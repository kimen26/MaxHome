"""Tâches du jour : génération des occurrences, ciblage, coche, balance.

Miroir côté bot de frontend/taches/taches.js — mêmes échéances par période, même purge
des périmées, mêmes parts figées à la coche. Aucune logique de conversation ici.
"""
import calendar
from datetime import date, datetime, timedelta, timezone

import commandes

FREQUENCES = {"quotidien": "chaque jour", "hebdo": "chaque semaine",
              "mensuel": "chaque mois", "au_besoin": "au besoin"}

# Échelle non linéaire choisie à la main (0,5 · 1 · 2 · 3 · 5 · 8), stockée en quarts de
# part — mêmes valeurs que frontend/taches/taches.js::ECHELLE_QUART.
ECHELLE_QUART = [2, 4, 8, 12, 20, 32]


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
                        "echeance": e.isoformat(), "rang": rang, "qui": r.get("attribue_a"),
                        "qui2": None, "parts_quart": 0})
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


def parts_de(recurrent, qui):
    """Parts d'une tâche pour la personne qui la fait (en quarts). `qui` : prénom ou None.

    Miroir de frontend/taches/taches.js::partsDe. L'écart ajoute un cran à la personne
    désignée par `ecart_prenom`, plafonné en haut de l'échelle. Pas de plancher à 1 ici :
    0,5 est une valeur légitime (D-022 caduque).
    """
    base = recurrent["parts_quart"]
    if not qui or not recurrent.get("ecart_prenom") or recurrent["ecart_prenom"] != qui:
        return base
    # Une base hors échelle (donnée héritée, réglage manuel en base) ne doit pas faire tomber
    # le bot : `.index()` lève là où `indexOf` du JS rend -1. On aligne sur le JS, qui repart
    # du premier cran plutôt que de planter.
    i = ECHELLE_QUART.index(base) if base in ECHELLE_QUART else -1
    return ECHELLE_QUART[min(len(ECHELLE_QUART) - 1, i + 1)]


def credit_de(recurrent, tache):
    """Crédit de parts d'une occurrence cochée : {"Yann": q, "Claudia": q} en quarts.

    Miroir de frontend/taches/taches.js::creditDe. Fait à deux, on divise la base (jamais
    l'écart) ; non cochée (`qui` None), aucun crédit.
    """
    out = {}
    if tache.get("qui2"):
        # `//` et non `/` : les quarts sont des ENTIERS (colonne int en base). `/` rendrait
        # 4.0 là où le JS rend 4 — même valeur, mais un float écrit dans une colonne int.
        # La base de l'échelle est toujours paire, la division reste donc exacte.
        moitie = recurrent["parts_quart"] // 2
        out[tache["qui"]] = moitie
        out[tache["qui2"]] = moitie
    elif tache.get("qui"):
        out[tache["qui"]] = parts_de(recurrent, tache["qui"])
    return out


def restantes(taches, recurrents, jour=None):
    """Tâches non faites dues aujourd'hui ou en retard, triées par obligatoire puis échéance.

    `importance` n'est plus lu : obligatoire porte seul le tri (cf. logique-metier.md §3).
    """
    jour = (jour or date.today()).isoformat()
    dues = [t for t in taches if not t["fait_le"] and t["echeance"] <= jour]
    oblig = lambda t: 1 if recurrents.get(t["recurrent_id"], {}).get("obligatoire") else 0  # noqa: E731
    return sorted(dues, key=lambda t: (-oblig(t), t["echeance"], t["rang"], t["id"]))


def cibler(taches, titre):
    """Recherche floue sur le titre parmi les tâches non faites. Retourne (tache, erreur)."""
    candidates = [t for t in taches if not t["fait_le"]]
    if not candidates:
        return None, "Aucune tâche en attente."
    trouve, proches = commandes.meilleur_flou(commandes.normaliser(titre), candidates, "titre")
    if trouve:
        return trouve, None
    return None, f"Aucune tâche ne correspond assez à « {titre} ». Proches : {', '.join(proches)}."


def basculer(donnees, prenom, titre, fait, jour=None, qui2=None):
    """Coche (ou décoche) une tâche. Retourne (tache_avant, champs_ecrits, erreur).

    `qui2` coche « à deux » : la tâche porte alors `qui` + `qui2`, `creditDe` divisera
    la base en deux au moment de la balance.
    """
    taches, recurrents = du_jour(donnees, jour)
    cible, erreur = cibler(taches if fait else [dict(t, fait_le=None) for t in taches if t["fait_le"]], titre)
    if erreur:
        return None, None, erreur
    if not fait:
        cible = next(t for t in taches if t["id"] == cible["id"])
    avant = {"fait_le": cible["fait_le"], "qui": cible["qui"], "qui2": cible.get("qui2"),
             "parts_quart": cible["parts_quart"]}
    if fait:
        # Les parts se figent à la coche, comme dans le frontend (L-008) : `taches.parts_quart`
        # ne se recalcule jamais depuis le récurrent courant, sinon changer le barème
        # réécrirait l'historique.
        recurrent = recurrents.get(cible["recurrent_id"])
        champs = {"fait_le": datetime.now(timezone.utc).isoformat(), "qui": prenom, "qui2": qui2,
                  "parts_quart": recurrent["parts_quart"] if recurrent else (cible.get("parts_quart") or 0)}
    else:
        rec = recurrents.get(cible["recurrent_id"]) or {}
        champs = {"fait_le": None, "qui": rec.get("attribue_a"), "qui2": None, "parts_quart": 0}
    donnees.maj_tache(cible["id"], champs)
    return cible, champs, None


def balance(taches, recurrents, membres, depuis, jusqu, obligatoire_seul=False):
    """Parts (en quarts) des tâches faites dans [depuis, jusqu] (dates).

    Même forme de retour que frontend/taches/taches.js::balance, `parCategorie` compris :
    les deux canaux doivent pouvoir afficher le même détail. Les crédits viennent de
    `credit_de()`, donc une occurrence faite à deux crédite les deux personnes. Base
    figée à la coche (`taches.parts_quart`), jamais recalculée depuis le récurrent
    courant : changer le barème ne réécrit pas la balance d'une semaine déjà passée.
    `obligatoire_seul` restreint aux tâches dont le récurrent est obligatoire — le KPI
    hebdomadaire de la vue Semaine, jamais un second système de points.
    """
    recurrents_par_id = {r["id"]: r for r in recurrents}
    parts = {p: 0 for p in membres}
    nombre = {p: 0 for p in membres}
    par_categorie = {}
    for t in taches:
        if not t["fait_le"]:
            continue
        j = datetime.fromisoformat(t["fait_le"].replace("Z", "+00:00")).astimezone().date()
        if j < depuis or j > jusqu:
            continue
        recurrent = recurrents_par_id.get(t["recurrent_id"])
        if obligatoire_seul and not (recurrent and recurrent.get("obligatoire")):
            continue
        credit = credit_de({"parts_quart": t["parts_quart"]}, t)
        for qui, q in credit.items():
            if qui not in parts:
                continue
            parts[qui] += q
            # `nombre` compte les PARTICIPATIONS, pas les tâches (cf. taches.js::balance) :
            # une tâche faite à deux vaut 1 pour chacun, la somme dépasse le nombre de tâches.
            nombre[qui] += 1
            par_categorie.setdefault(t["categorie"], {p: 0 for p in membres})[qui] += q
    total = sum(parts.values())
    ratio = {p: (parts[p] / total if total else 1 / len(membres)) for p in membres}
    return {"parts": parts, "nombre": nombre, "total": total, "ratio": ratio,
            "parCategorie": par_categorie}
