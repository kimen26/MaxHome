"""Garder le lien avec nos proches côté bot : la règle (miroir de frontend/proches/relances.js) et l'accès aux données.

La règle est PURE (dicts et dates en entrée, dicts en sortie) ; elle est confrontée à la version JS dans
tests/bot/test_proches.py (invariant 7, L-014). Les lignes sont celles des tables `proches` et `proche_echanges` ;
les dates sont des chaînes « AAAA-MM-JJ », `aujourdhui` un `date`. Les entrées/sorties passent par `Donnees`, aux bords.
"""
import unicodedata
from datetime import date

MEMBRES_QUI = ("Yann", "Claudia")  # « qui relance » : un membre, ou « nous » (les deux)
QUI_COMMUN = "nous"
PRENOM_MAX = 60
TEXTE_MAX = 500


# ---------- la règle (miroir de relances.js) ----------
def _jour(iso):
    return date.fromisoformat(str(iso)[:10])


def _cle_tri(proche):
    """Prénom sans accents ni casse, puis id : même ordre que relances.js, sans dépendre de la locale."""
    nu = "".join(c for c in unicodedata.normalize("NFD", str(proche.get("prenom") or "")) if unicodedata.category(c) != "Mn")
    return (nu.lower(), proche["id"])


def _rythme(proche):
    valeur = proche.get("rythme_jours")
    return valeur if isinstance(valeur, int) and not isinstance(valeur, bool) and valeur > 0 else 0


def dernier_contact(proche, echanges):
    """Date max des échanges de la personne, sinon sa date de création (chaîne « AAAA-MM-JJ »)."""
    dates = [str(e["le"])[:10] for e in echanges if e["proche_id"] == proche["id"] and e.get("le")]
    if dates:
        return max(dates)
    return str(proche["cree_le"])[:10] if proche.get("cree_le") else None


def a_relancer(proches, echanges, aujourdhui):
    """[{id, depuis_jours, retard_jours}] : proches actifs avec un rythme, sans contact depuis au moins ce rythme.
    Les plus en retard d'abord, puis par prénom."""
    trouves = []
    for p in proches:
        if p.get("actif") is False or not _rythme(p):
            continue
        dernier = dernier_contact(p, echanges)
        if dernier is None:
            continue
        depuis = (aujourdhui - _jour(dernier)).days
        retard = depuis - _rythme(p)
        if retard >= 0:
            trouves.append((p, depuis, retard))
    trouves.sort(key=lambda t: (-t[2], *_cle_tri(t[0])))
    return [{"id": p["id"], "depuis_jours": depuis, "retard_jours": retard} for p, depuis, retard in trouves]


def _bissextile(annee):
    return (annee % 4 == 0 and annee % 100 != 0) or annee % 400 == 0


def _jours_du_mois(annee, mois):
    return (31, 29 if _bissextile(annee) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)[mois - 1]


def _entier(valeur):
    return valeur if isinstance(valeur, int) and not isinstance(valeur, bool) else 0


def _prochaine_occurrence(p, aujourdhui):
    """(date, année) de la prochaine fête (aujourd'hui compris), ou None si la date est invalide.
    Un 29 février se fête le 28 février les années non bissextiles."""
    jour, mois = _entier(p.get("anniv_jour")), _entier(p.get("anniv_mois"))
    if not 1 <= mois <= 12 or not 1 <= jour <= _jours_du_mois(2024, mois):  # 2024 : bissextile, 29/02 admis
        return None
    for annee in (aujourdhui.year, aujourdhui.year + 1):
        candidat = date(annee, mois, min(jour, _jours_du_mois(annee, mois)))
        if candidat >= aujourdhui:
            return candidat, annee
    return None


def anniversaires(proches, aujourdhui, horizon_jours=1):
    """[{id, jour, dans_jours, age}] des proches actifs : dans_jours 0 = aujourd'hui, 1 = demain.
    `age` : l'âge atteint ce jour-là si l'année de naissance est connue, sinon None."""
    trouves = []
    for p in proches:
        if p.get("actif") is False:
            continue
        occurrence = _prochaine_occurrence(p, aujourdhui)
        if occurrence is None:
            continue
        jour, annee = occurrence
        dans = (jour - aujourdhui).days
        if dans > horizon_jours:
            continue
        nee = _entier(p.get("anniv_annee"))
        age = annee - nee if nee > 0 and annee - nee >= 0 else None
        trouves.append((p, {"id": p["id"], "jour": jour.isoformat(), "dans_jours": dans, "age": age}))
    trouves.sort(key=lambda t: (t[1]["dans_jours"], *_cle_tri(t[0])))
    return [r for _, r in trouves]


def derniers_echanges(proche, echanges, n):
    """Les `n` derniers échanges de la personne, le plus récent d'abord."""
    siens = [e for e in echanges if e["proche_id"] == proche["id"]]
    return sorted(siens, key=lambda e: (str(e["le"]), e.get("id") or 0), reverse=True)[:n]


def concerne(proche, prenom):
    """Le proche relève-t-il de ce membre (« qui relance » = lui, ou « nous ») ?"""
    return proche.get("qui") in (prenom, QUI_COMMUN)


# ---------- bords : lecture et écriture ----------
def lire(donnees):
    """(proches actifs ou non, tous les échanges), tels que la base les rend."""
    return donnees.proches(), donnees.proche_echanges()


def trouver(proches, prenom, normaliser):
    """Le proche de ce prénom (sans casse ni accents), ou None. `normaliser` : reponses.normaliser."""
    cible = normaliser(prenom.strip())
    return next((p for p in proches if normaliser(p["prenom"]) == cible), None)


def qui_pour(auteur):
    """« qui relance » d'un proche créé par `auteur` : lui-même s'il est membre, sinon « nous »."""
    return auteur if auteur in MEMBRES_QUI else QUI_COMMUN


def creer(donnees, prenom, auteur):
    """Nouveau proche : qui = l'auteur, sans rythme (pas de relance tant qu'on n'en a pas choisi un)."""
    return donnees.creer_proche({"prenom": prenom.strip(), "qui": qui_pour(auteur), "rythme_jours": None})


def noter_echange(donnees, proche_id, texte, le, par):
    return donnees.creer_proche_echange({"proche_id": proche_id, "le": le, "texte": texte.strip(), "par": par})
