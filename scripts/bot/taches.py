"""Tâches du jour : génération des occurrences, ciblage, coche, balance.

Miroir côté bot de frontend/taches.js — mêmes échéances par période, même purge des
périmées, mêmes points figés à la coche. Aucune logique de conversation ici.
"""
import calendar
from datetime import date, datetime, timedelta, timezone

import commandes

FREQUENCES = {"quotidien": "chaque jour", "hebdo": "chaque semaine",
              "mensuel": "chaque mois", "au_besoin": "au besoin"}


def echeance(frequence, jour):
    """Fin de la période contenant `jour` (date) : le jour, le dimanche, le dernier du mois."""
    if frequence == "quotidien":
        return jour
    if frequence == "hebdo":
        return jour + timedelta(days=(6 - jour.weekday()) % 7)
    if frequence == "mensuel":
        return jour.replace(day=calendar.monthrange(jour.year, jour.month)[1])
    return None


def occurrences_manquantes(recurrents, existantes, jour):
    """Occurrences à créer pour `jour` : celles des récurrents actifs qui manquent."""
    deja = {(t["recurrent_id"], t["echeance"], t["rang"]) for t in existantes if t["recurrent_id"]}
    out = []
    for r in recurrents:
        if not r.get("actif", True):
            continue
        e = echeance(r["frequence"], jour)
        if e is None:
            continue
        for rang in range(1, (r.get("fois") or 1) + 1):
            if (r["id"], e.isoformat(), rang) in deja:
                continue
            out.append({"recurrent_id": r["id"], "titre": r["titre"], "categorie": r["categorie"],
                        "echeance": e.isoformat(), "rang": rang, "qui": r.get("attribue_a"), "points": 0})
    return out


def perimees(taches, jour):
    """Non faites dont la période est finie depuis plus d'un jour : on ne les rattrape plus."""
    limite = (jour - timedelta(days=1)).isoformat()
    return [t for t in taches if not t["fait_le"] and t["recurrent_id"] and t["echeance"] < limite]


def du_jour(donnees, jour=None):
    """Tâches en cours, après purge des périmées et création des manquantes."""
    jour = jour or date.today()
    recurrents = donnees.taches_recurrentes()
    existantes = donnees.taches(depuis=(jour - timedelta(days=35)).isoformat())
    mortes = perimees(existantes, jour)
    if mortes:
        donnees.supprimer_taches([t["id"] for t in mortes])
        existantes = [t for t in existantes if t not in mortes]
    manquantes = occurrences_manquantes(recurrents, existantes, jour)
    if manquantes:
        existantes = existantes + donnees.creer_taches(manquantes)
    return existantes, {r["id"]: r for r in recurrents}


def points_de(recurrent, tache):
    """Points d'une tâche : la pénibilité de son récurrent (l'importance ne rapporte rien)."""
    if recurrent:
        return recurrent["penibilite"]
    return tache.get("points") or 1


def restantes(taches, recurrents, jour=None):
    """Tâches non faites dues aujourd'hui ou en retard, triées par importance puis échéance."""
    jour = (jour or date.today()).isoformat()
    dues = [t for t in taches if not t["fait_le"] and t["echeance"] <= jour]
    importance = lambda t: recurrents.get(t["recurrent_id"], {}).get("importance", 2)  # noqa: E731
    return sorted(dues, key=lambda t: (-importance(t), t["echeance"], t["rang"], t["id"]))


def cibler(taches, titre):
    """Recherche floue sur le titre parmi les tâches non faites. Retourne (tache, erreur)."""
    candidates = [t for t in taches if not t["fait_le"]]
    if not candidates:
        return None, "Aucune tâche en attente."
    trouve, proches = commandes.meilleur_flou(commandes.normaliser(titre), candidates, "titre")
    if trouve:
        return trouve, None
    return None, f"Aucune tâche ne correspond assez à « {titre} ». Proches : {', '.join(proches)}."


def basculer(donnees, prenom, titre, fait, jour=None):
    """Coche (ou décoche) une tâche. Retourne (tache_avant, champs_ecrits, erreur)."""
    taches, recurrents = du_jour(donnees, jour)
    cible, erreur = cibler(taches if fait else [dict(t, fait_le=None) for t in taches if t["fait_le"]], titre)
    if erreur:
        return None, None, erreur
    if not fait:
        cible = next(t for t in taches if t["id"] == cible["id"])
    avant = {"fait_le": cible["fait_le"], "qui": cible["qui"], "points": cible["points"]}
    if fait:
        # Les points se figent à la coche, comme dans le frontend (L-008).
        champs = {"fait_le": datetime.now(timezone.utc).isoformat(), "qui": prenom,
                  "points": points_de(recurrents.get(cible["recurrent_id"]), cible)}
    else:
        rec = recurrents.get(cible["recurrent_id"]) or {}
        champs = {"fait_le": None, "qui": rec.get("attribue_a"), "points": 0}
    donnees.maj_tache(cible["id"], champs)
    return cible, champs, None


def balance(taches, membres, depuis, jusqu):
    """Points des tâches faites dans [depuis, jusqu] (dates). Ratio et détail par personne."""
    points = {p: 0 for p in membres}
    nombre = {p: 0 for p in membres}
    for t in taches:
        if not t["fait_le"] or t["qui"] not in points:
            continue
        j = datetime.fromisoformat(t["fait_le"].replace("Z", "+00:00")).astimezone().date()
        if j < depuis or j > jusqu:
            continue
        points[t["qui"]] += t["points"]
        nombre[t["qui"]] += 1
    total = sum(points.values())
    ratio = {p: (points[p] / total if total else 1 / len(membres)) for p in membres}
    return {"points": points, "nombre": nombre, "total": total, "ratio": ratio}
