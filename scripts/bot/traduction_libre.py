"""Traduit le JSON du langage libre (schéma de libre.py) vers le schéma INTERNE de commandes.py,
exécuté tel quel par bot.traiter_action. Aucune logique métier nouvelle : on valide, on résout
(charge, prénom, mois, règle) et, quand il manque une info ou qu'elle est ambiguë, on renvoie
{"action": "demander", "texte": ...} — le bot pose la question, il ne devine jamais.

La sortie du modèle est une donnée non fiable : chaque champ est vérifié ici, jamais supposé.
"""
import math
import re
from dataclasses import dataclass
from difflib import SequenceMatcher

import commandes
from reponses import MOIS_NOMS, normaliser

RE_MOIS = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")
LIBELLE_MAX = 80
JOURS_DEFAUT, JOURS_MAX = 7, 365
REGLES = {
    "egales": "egales", "egale": "egales", "50/50": "egales", "50 50": "egales", "moitie": "egales",
    "proport": "proport", "prorata": "proport", "proportionnel": "proport", "proportionnelle": "proport",
}
MSG_MONTANT_BORNES = "Montant hors bornes (0 < montant <= 50 000 €)."


@dataclass(frozen=True)
class Contexte:
    charges: tuple   # charges ACTIVES seulement (D-043)
    membres: tuple
    annee: int       # mois courant
    mois: int


def demander(texte):
    return {"action": "demander", "texte": texte}


def _texte(valeur):
    return valeur.strip() if isinstance(valeur, str) else ""


def _noms(membres):
    return " ou ".join(membres)


def _periode(interp, ctx):
    """(annee, mois) du message, le mois courant s'il n'en cite aucun, ou None si illisible."""
    brut = interp.get("mois")
    if not brut:
        return ctx.annee, ctx.mois
    m = RE_MOIS.match(brut) if isinstance(brut, str) else None
    return (int(m.group(1)), int(m.group(2))) if m else None


def _montant(interp):
    """(centimes absolus, None) ou (None, action à renvoyer : une question ou une erreur)."""
    brut = interp.get("montant")
    if isinstance(brut, str):
        brut = commandes.extraire_montant(brut)[0]
    if isinstance(brut, bool) or not isinstance(brut, (int, float)) or not math.isfinite(brut):
        return None, demander("Quel montant ?")
    centimes = commandes.valider_montant_euros(abs(brut))
    if centimes is None:
        return None, {"action": "erreur", "message": MSG_MONTANT_BORNES}
    return centimes, None


def _signe(interp, centimes):
    """Une dépense (négatif) sauf si le modèle dit « remboursement » : c'est le bot qui pose le signe."""
    return centimes if interp.get("remboursement") is True else -centimes


def _membre(valeur, ctx):
    """Le membre nommé (insensible casse/accents), ou None."""
    cible = normaliser(_texte(valeur))
    return next((p for p in ctx.membres if normaliser(p) == cible), None) if cible else None


def _proches(cible, charges):
    return [c for c in charges
            if cible in normaliser(c["libelle"]) or normaliser(c["libelle"]) in cible
            or SequenceMatcher(None, cible, normaliser(c["libelle"])).ratio() >= commandes.SEUIL_FLOU]


def choisir_charge(libelle, ctx):
    """(charge, None) si UNE seule convient, sinon (None, question à poser) : jamais de choix au hasard."""
    cible = normaliser(_texte(libelle))
    if not cible:
        return None, demander("De quelle charge parles-tu ?")
    exactes = [c for c in ctx.charges if normaliser(c["libelle"]) == cible]
    candidates = exactes or _proches(cible, ctx.charges)
    if len(candidates) == 1:
        return candidates[0], None
    if candidates:
        return None, demander(f"Tu parles de {' ou de '.join(c['libelle'] for c in candidates)} ?")
    trouvee, proches = commandes.meilleur_libelle(cible, list(ctx.charges))
    if trouvee:
        return trouvee, None
    suite = f" Tu veux dire {' ou '.join(proches)} ?" if proches else ""
    return None, demander(f"Je ne trouve pas « {_texte(libelle)} » dans les charges.{suite}")


def _avec(action, periode):
    return {**action, "annee": periode[0], "mois": periode[1]}


def _valider(interp, ctx, periode, valider=True):
    charge, question = choisir_charge(interp.get("charge"), ctx)
    if question:
        return question
    pour = None
    if valider and interp.get("pour"):
        pour = _membre(interp["pour"], ctx)
        if pour is None:
            return demander(f"Pour qui ? {_noms(ctx.membres)} ?")
    return _avec({"action": "valider", "libelle": charge["libelle"], "valider": valider, "prenom": pour}, periode)


def _charge(interp, ctx, periode):
    charge, question = choisir_charge(interp.get("libelle"), ctx)
    if question:
        return question
    centimes, refus = _montant(interp)
    if refus:
        return refus
    return _avec({"action": "charge", "charge_id": charge["id"], "libelle_reel": charge["libelle"],
                  "montant_centimes": _signe(interp, centimes)}, periode)


def _extra(interp, ctx, periode):
    libelle = _texte(interp.get("libelle"))
    if not libelle:
        return demander("Comment s'appelle cette ligne ?")
    if len(libelle) > LIBELLE_MAX:
        return {"action": "erreur", "message": f"Libellé trop long ({LIBELLE_MAX} caractères max)."}
    centimes, refus = _montant(interp)
    if refus:
        return refus
    regle = REGLES.get(normaliser(_texte(interp.get("regle"))))
    if regle is None:
        return demander("Cette ligne se répartit 50/50 ou au prorata des salaires ?")
    return _avec({"action": "extra", "libelle": libelle[0].upper() + libelle[1:],
                  "montant_centimes": _signe(interp, centimes),
                  "regle": regle}, periode)


def _salaire(interp, ctx, periode):
    prenom = None
    if interp.get("prenom"):
        prenom = _membre(interp["prenom"], ctx)
        if prenom is None:
            return demander(f"Le salaire de qui ? {_noms(ctx.membres)} ?")
    centimes, refus = _montant(interp)
    return refus or _avec({"action": "salaire", "prenom": prenom, "montant_centimes": centimes}, periode)


def _ajustement(interp, ctx, periode):
    beneficiaire = _membre(interp.get("vers"), ctx)
    if beneficiaire is None:
        return demander(f"Qui reçoit l'ajustement ? {_noms(ctx.membres)} ?")
    centimes, refus = _montant(interp)
    return refus or _avec({"action": "ajustement", "beneficiaire": beneficiaire, "montant_centimes": centimes,
                           "motif": _texte(interp.get("motif"))}, periode)


def _mouvement(interp, ctx, periode):
    par = None
    if interp.get("pour"):
        par = _membre(interp["pour"], ctx)
        if par is None:
            return demander(f"Pour qui ? {_noms(ctx.membres)} ?")
    return _avec({"action": "mouvement", "fait": interp.get("fait") is not False,
                  "titre": _texte(interp.get("titre")) or None, "par": par}, periode)


def _course(interp, ctx, periode):
    libelle = _texte(interp.get("libelle"))
    if not libelle:
        return demander("Qu'est-ce que j'ajoute à la liste de courses ?")
    if len(libelle) > LIBELLE_MAX:
        return {"action": "erreur", "message": f"Libellé trop long ({LIBELLE_MAX} caractères max)."}
    return {"action": "course_ajout", "libelle": libelle}


def _balance(interp, ctx, periode):
    jours = interp.get("jours")
    valides = isinstance(jours, int) and not isinstance(jours, bool) and 1 <= jours <= JOURS_MAX
    return {"action": "balance", "jours": jours if valides else JOURS_DEFAUT}


def _lecture(nom):
    return lambda interp, ctx, periode: _avec({"action": nom}, periode)


def _sans_mois(nom):
    return lambda interp, ctx, periode: {"action": nom}


SANS_MOIS = {"course_ajout", "balance", "taches", "courses_liste"}
TRADUCTEURS = {
    "salaire": _salaire, "charge": _charge, "extra": _extra, "ajustement": _ajustement,
    "valider": _valider, "devalider": lambda i, c, p: _valider(i, c, p, valider=False),
    "mouvement_fait": _mouvement, "tache_faite": _mouvement,
    "course_ajout": _course, "balance": _balance,
    "bilan": _lecture("bilan"), "charges": _lecture("charges"), "a_virer": _lecture("a_virer"),
    "taches": _sans_mois("taches"), "courses_liste": _sans_mois("courses_liste"),
}


def traduire(interp, charges, membres, annee_c, mois_c):
    """Action interne prête pour bot.traiter_action, ou {"action": "demander"|"erreur", ...}.

    `charges` : toutes les charges (les terminées sont écartées ici, D-043).
    """
    ctx = Contexte(tuple(c for c in charges if c.get("actif") is not False), tuple(membres), annee_c, mois_c)
    nom = interp.get("action")
    traducteur = TRADUCTEURS.get(nom) if isinstance(nom, str) else None
    if traducteur is None:
        return {"action": "erreur", "message": "Action libre non prise en charge."}
    periode = _periode(interp, ctx)
    if periode is None and nom in SANS_MOIS:
        periode = (ctx.annee, ctx.mois)
    if periode is None:
        return demander(f"Quel mois ? Par exemple « {MOIS_NOMS[ctx.mois]} {ctx.annee} ».")
    return traducteur(interp, ctx, periode)
