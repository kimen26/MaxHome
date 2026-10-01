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


SEUIL_FLOU = 0.75


def _score(cible_norm, valeur_norm):
    """Similarité globale, relevée quand la cible est un mot ou un fragment du libellé.

    Les titres de tâches (« Étendre et plier le linge ») sont trop longs pour qu'un mot
    isolé atteigne le seuil global : sans ce relèvement, « linge » ne trouverait rien.
    Un fragment doit faire au moins 3 caractères pour ne pas rendre « le » universel.
    """
    ratio = difflib.SequenceMatcher(None, cible_norm, valeur_norm).ratio()
    if len(cible_norm) >= 3 and cible_norm in valeur_norm.split():
        return max(ratio, 0.95)
    if len(cible_norm) >= 3 and cible_norm in valeur_norm:
        return max(ratio, 0.85)
    return ratio


def meilleur_flou(cible_norm, elements, champ):
    """Fuzzy match insensible casse/accents sur `champ`. Retourne (élément, None) ou (None, [3 proches])."""
    candidats = [(e, _score(cible_norm, normaliser(e[champ]))) for e in elements]
    candidats.sort(key=lambda x: -x[1])
    if candidats and candidats[0][1] >= SEUIL_FLOU:
        return candidats[0][0], None
    return None, [e[champ] for e, _ in candidats[:3]]


def meilleur_libelle(cible_norm, charges):
    """Fuzzy match sur le libellé d'une charge."""
    return meilleur_flou(cible_norm, charges, "libelle")


def interpreter(texte_brut, prenoms, charges, annee_courante, mois_courant):
    """Retourne un dict d'action. `action` == None si rien ne matche (repli libre)."""
    texte_brut = texte_brut.strip()
    texte_norm = normaliser(texte_brut)
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
    if sans_mois in ("courses", "liste"):
        return {"action": "courses_liste"}
    # « ajoute lait », « ajoute 2 packs de lait » — tout ce qui suit est le libellé.
    m = re.match(r"^(?:ajoute|ajouter)\s+(.+)$", sans_mois)
    if m:
        libelle = m.group(1).strip()
        if len(libelle) > 80:
            return {"action": "erreur", "message": "Libellé trop long (80 caractères max)."}
        return {"action": "course_ajout", "libelle": libelle}
    if sans_mois in ("taches", "tache", "todo"):
        return {"action": "taches"}

    # ---------- module Voyages (carnet, D-045) ----------
    if sans_mois in ("voyages",):
        return {"action": "voyages"}
    m = re.match(r"^voyage\s+(.+)$", sans_mois)
    if m:
        return {"action": "voyage", "nom": m.group(1).strip()}
    m = re.match(r"^lieu\s+(.+)$", sans_mois)
    if m:
        # Le voyage peut être multi-mots (« Test bot ZZZ ») : la séparation exacte
        # voyage / nom du lieu se fait dans voyages.py, seul à connaître la liste des voyages.
        return {"action": "lieu", "reste": m.group(1).strip()}
    m = re.match(r"^localise\s+(.+)$", sans_mois)
    if m:
        return {"action": "localise", "voyage": m.group(1).strip()}
    m = re.match(r"^topo\s+(.+)$", sans_mois)
    if m:
        return {"action": "topo", "voyage": m.group(1).strip()}
    if re.match(r"^r[ée]sa\b", sans_mois) or re.match(r"^r[ée]servation\b", sans_mois):
        # Grammaire déterministe insuffisante pour la résa (langage libre) : signale à bot.py
        # de passer par le repli dédié (voyages.extraire_resa), sans consommer le texte brut.
        return {"action": "resa_libre"}
    if sans_mois in ("balance", "equilibre"):
        return {"action": "balance", "jours": 7}
    m = re.match(r"^balance\s+(\d{1,3})\s*(?:j|jours?)?$", sans_mois)
    if m:
        return {"action": "balance", "jours": max(1, min(365, int(m.group(1))))}

    # « à virer » (alias « virements ») : virements du mois groupés par trajet (D-048 §3).
    if sans_mois in ("a virer", "virements"):
        return {"action": "a_virer", "annee": annee, "mois": mois}

    # libellé <charge|compte> <texte> (alias libelle) : pose la valeur du mois (D-050). Un
    # libellé bancaire doit garder EXACTEMENT ce qui a été tapé (casse, accents, tirets : « Max
    # DUPONT Facture-École 1234-56 ») — seule la CIBLE (compte ou charge) se cherche en flou,
    # budget_libelle.py la sépare du texte sans jamais passer `reste` par `normaliser()`. On
    # repère juste ici où commence le reste, sur le texte BRUT (insensible casse/accents pour
    # reconnaître « libellé »/« libelle », mais rien n'est réécrit) ; la séparation cible/texte
    # n'est pas déterministe (la cible peut être multi-mots, « École Max »), comme
    # `lieu <voyage> <nom du lieu>` plus haut.
    m = re.match(r"^libell?[ée]\s+(.+)$", texte_brut, flags=re.IGNORECASE)
    if m:
        return {"action": "libelle", "reste": m.group(1).strip(), "annee": annee, "mois": mois}

    # valider <charge> [pour <prenom>] / pas validé <charge> / devalider <charge> (D-046, D-048).
    # Testé AVANT « fait/pas fait » (grammaire voisine, même verbe « fait » à distinguer par
    # le mot-clé « valid »/« dévalid ») pour ne jamais lui laisser confondre les deux.
    m = re.match(r"^(?:pas\s+valid[ée]|d[ée]valider)\s+(.+)$", sans_mois)
    if m:
        return {"action": "valider", "libelle": m.group(1).strip(), "valider": False,
                "prenom": None, "annee": annee, "mois": mois}
    m = re.match(r"^valider\s+(.+?)(?:\s+pour\s+(\w[\w-]*))?$", sans_mois)
    if m:
        libelle, prenom_brut = m.group(1).strip(), m.group(2)
        prenom_cible = None
        if prenom_brut:
            prenom_cible = next((p for p in prenoms if normaliser(p) == prenom_brut), prenom_brut.capitalize())
        return {"action": "valider", "libelle": libelle, "valider": True,
                "prenom": prenom_cible, "annee": annee, "mois": mois}

    # fait / pas fait [<titre>] [à deux] — le titre peut viser une tâche ou un mouvement :
    # bot.py tranche, lui seul a les deux listes. Sans titre, c'est le virement au commun.
    # « à deux » (et ses variantes) ne s'applique qu'aux tâches : basculer_fait l'ignore
    # si le titre finit par viser un mouvement.
    m = re.match(r"^(?:virement\s+)?(pas\s+fait|fait)\b\s*(.*)$", sans_mois)
    if m:
        titre = m.group(2).strip()
        a_deux = False
        m_deux = re.match(r"^(.*?)\s+(?:a deux|ensemble|tous les deux)$", titre)
        if m_deux:
            titre = m_deux.group(1).strip()
            a_deux = True
        return {"action": "mouvement", "fait": not m.group(1).startswith("pas"),
                "titre": titre or None, "a_deux": a_deux, "annee": annee, "mois": mois}
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
