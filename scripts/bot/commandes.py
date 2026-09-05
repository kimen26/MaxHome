"""Grammaire déterministe : reconnaît un message et retourne une action structurée.

Ne touche pas au réseau. Retourne toujours un dict {"action": "...", ...} ou
{"action": None} si rien ne matche (repli vers libre.py).
"""
import difflib
import re
from datetime import date

from reponses import normaliser

MONTANT_MAX_CENTIMES = 50_000 * 100

MOIS_NOMS = {
    "janvier": 1, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
    "juillet": 7, "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11, "decembre": 12,
}

RE_MOIS_NOM = re.compile(r"\b(?:en )?(" + "|".join(MOIS_NOMS) + r")(?:\s+(\d{4}))?\b")
RE_MOIS_NUM = re.compile(r"\b(\d{1,2})/(\d{4})\b")
RE_MONTANT = re.compile(r"[+-]?\d[\d\s ]*(?:[.,]\d+)?")


def extraire_mois(texte_norm, annee_defaut, mois_defaut):
    """Retourne (annee, mois, texte_sans_suffixe_mois)."""
    m = RE_MOIS_NUM.search(texte_norm)
    if m:
        mois, annee = int(m.group(1)), int(m.group(2))
        if 1 <= mois <= 12:
            return annee, mois, texte_norm[: m.start()] + texte_norm[m.end():]
    m = RE_MOIS_NOM.search(texte_norm)
    if m:
        mois = MOIS_NOMS[m.group(1)]
        annee = int(m.group(2)) if m.group(2) else annee_defaut
        return annee, mois, texte_norm[: m.start()] + texte_norm[m.end():]
    return annee_defaut, mois_defaut, texte_norm


def extraire_montant(texte):
    """Dernier nombre du texte = montant (convention : le montant suit le libellé)."""
    matches = list(RE_MONTANT.finditer(texte))
    if not matches:
        return None, texte
    m = matches[-1]
    brut = m.group(0).replace(" ", "").replace(" ", "").replace(",", ".")
    try:
        valeur = float(brut)
    except ValueError:
        return None, texte
    reste = (texte[: m.start()] + texte[m.end():]).strip()
    return valeur, reste


def valider_montant_euros(valeur):
    centimes = round(valeur * 100)
    if not (0 < abs(centimes) <= MONTANT_MAX_CENTIMES):
        return None
    return centimes


def meilleur_libelle(cible_norm, charges):
    """Fuzzy match sur le libellé normalisé. Retourne (charge, ratio) ou (None, [3 plus proches])."""
    candidats = [(c, difflib.SequenceMatcher(None, cible_norm, normaliser(c["libelle"])).ratio()) for c in charges]
    candidats.sort(key=lambda x: -x[1])
    if candidats and candidats[0][1] >= 0.75:
        return candidats[0][0], None
    return None, [c["libelle"] for c, _ in candidats[:3]]


def interpreter(texte_brut, prenoms, charges, annee_courante, mois_courant):
    """Retourne un dict d'action. `action` == None si rien ne matche (repli libre)."""
    texte_norm = normaliser(texte_brut.strip())
    annee, mois, sans_mois = extraire_mois(texte_norm, annee_courante, mois_courant)
    sans_mois = sans_mois.strip()

    if sans_mois in ("aide", "help", "?"):
        return {"action": "aide"}
    if sans_mois in ("mois",):
        return {"action": "mois", "annee": annee, "mois": mois}
    if sans_mois in ("bilan",):
        return {"action": "bilan", "annee": annee, "mois": mois}
    if sans_mois in ("charges",):
        return {"action": "charges", "annee": annee, "mois": mois}
    if sans_mois in ("annuler",):
        return {"action": "annuler"}
    if sans_mois in ("fait", "virement fait"):
        return {"action": "virement", "fait": True}
    if sans_mois in ("pas fait", "virement pas fait"):
        return {"action": "virement", "fait": False}
    if sans_mois in ("oui", "non"):
        return {"action": "confirmation", "valeur": sans_mois == "oui"}

    m = re.match(r"^inscrire\s+(\d+)\s+(.+)$", sans_mois)
    if m:
        return {"action": "inscrire", "telegram_id": int(m.group(1)), "prenom": m.group(2).strip().capitalize()}

    m = re.match(r"^moi\s+(.+)$", sans_mois)
    if m:
        return {"action": "moi", "prenom": m.group(1).strip().capitalize()}

    # salaire [prenom] montant
    m = re.match(r"^salaire\s+(.*)$", sans_mois)
    if m:
        reste = m.group(1)
        prenom_cible = None
        for p in prenoms:
            if normaliser(p) in reste.split():
                prenom_cible = p
                reste = reste.replace(normaliser(p), "").strip()
                break
        montant, _ = extraire_montant(reste)
        if montant is None:
            return {"action": "erreur", "message": "Montant de salaire manquant."}
        centimes = valider_montant_euros(montant)
        if centimes is None:
            return {"action": "erreur", "message": "Montant hors bornes (0 < montant <= 50 000 €)."}
        return {"action": "salaire", "prenom": prenom_cible, "montant_centimes": centimes, "annee": annee, "mois": mois}

    # yann prend 200 resto / ajustement claudia 120 courses
    m = re.match(r"^(\w[\w-]*)\s+prend\s+(.+)$", sans_mois)
    if not m:
        m = re.match(r"^ajustement\s+(\w[\w-]*)\s+(.+)$", sans_mois)
    if m:
        prenom_brut, reste = m.group(1), m.group(2)
        beneficiaire = next((p for p in prenoms if normaliser(p) == prenom_brut), None)
        if not beneficiaire:
            return {"action": "erreur", "message": f"Prénom inconnu : {prenom_brut}."}
        montant, motif = extraire_montant(reste)
        if montant is None:
            return {"action": "erreur", "message": "Montant d'ajustement manquant."}
        centimes = valider_montant_euros(montant)
        if centimes is None:
            return {"action": "erreur", "message": "Montant hors bornes (0 < montant <= 50 000 €)."}
        return {"action": "ajustement", "beneficiaire": beneficiaire, "montant_centimes": centimes,
                "motif": motif.strip(), "annee": annee, "mois": mois}

    # extra <libelle> <montant> [egales]
    m = re.match(r"^extra\s+(.+)$", sans_mois)
    if m:
        reste = m.group(1)
        regle = "egales" if re.search(r"\begales\b", reste) else "proport"
        reste = re.sub(r"\begales\b", "", reste).strip()
        montant, libelle = extraire_montant(reste)
        if montant is None or not libelle:
            return {"action": "erreur", "message": "Format : extra <libellé> <montant> [egales]."}
        centimes = valider_montant_euros(montant)
        if centimes is None:
            return {"action": "erreur", "message": "Montant hors bornes (0 < montant <= 50 000 €)."}
        signe = -1 if montant > 0 and not re.search(r"^\+|rembours", sans_mois) else 1
        return {"action": "extra", "libelle": libelle.strip(), "montant_centimes": -abs(centimes) if signe == -1 else centimes,
                "regle": regle, "annee": annee, "mois": mois}

    # <libelle charge> <montant> — dernier recours grammatical, fuzzy sur libellé
    montant, libelle = extraire_montant(sans_mois)
    if montant is not None and libelle:
        positif = sans_mois.strip().startswith("+") or "rembours" in libelle
        libelle_recherche = re.sub(r"\brembours\w*\b", "", libelle).strip()
        centimes = valider_montant_euros(montant)
        if centimes is None:
            return {"action": "erreur", "message": "Montant hors bornes (0 < montant <= 50 000 €)."}
        valeur_signee = centimes if positif else -abs(centimes)
        charge, proches = meilleur_libelle(libelle_recherche or libelle, charges)
        if charge is None:
            return {"action": "ambigu", "libelle": libelle, "proches": proches}
        return {"action": "charge", "charge_id": charge["id"], "libelle_reel": charge["libelle"],
                "montant_centimes": valeur_signee, "annee": annee, "mois": mois}

    return {"action": None}
