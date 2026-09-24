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

    Miroir de frontend/taches/taches.js::partsDe. « Part équiv » (`parts_spe` None) :
    `parts_quart` pour tout le monde. « Part spé » : `parts_spe` donne les parts de chacun
    (D-038, remplace l'écart d'un cran). Sans récurrent : 0.
    """
    if not recurrent:
        return 0
    spe = recurrent.get("parts_spe")
    # `bool` est un int en Python : on l'écarte pour rester aligné sur Number.isInteger du JS.
    if qui and spe and isinstance(spe.get(qui), int) and not isinstance(spe.get(qui), bool):
        return spe[qui]
    return recurrent["parts_quart"]


def au_tiers(q, tiers):
    """Part retenue au tiers (1, 2 ou 3) : miroir de taches.js::auTiers, entier si plein."""
    return q if tiers is None or tiers == 3 else q * tiers / 3


def credit_de(recurrent, tache):
    """Crédit de parts d'une occurrence cochée : {"Yann": q, "Claudia": q} en quarts.

    Miroir de frontend/taches/taches.js::creditDe. `recurrent["parts_quart"]` est la base
    FIGÉE de `qui`. Fait à deux (D-038) : chacun ses parts pleines (`parts_quart`,
    `parts_quart2`), réduites au tiers retenu (`tiers`, `tiers2`). Une occurrence à deux
    d'avant 017 (`parts_quart2` None) garde l'ancienne règle : base divisée en deux.
    """
    out = {}
    if not tache.get("qui"):
        return out
    if tache.get("qui2"):
        if tache.get("parts_quart2") is None:
            # `//` : les quarts sont des entiers, la base de l'échelle est toujours paire.
            moitie = recurrent["parts_quart"] // 2
            out[tache["qui"]] = moitie
            out[tache["qui2"]] = moitie
            return out
        out[tache["qui"]] = au_tiers(recurrent["parts_quart"], tache.get("tiers"))
        out[tache["qui2"]] = au_tiers(tache["parts_quart2"], tache.get("tiers2"))
        return out
    out[tache["qui"]] = parts_de(recurrent, tache["qui"])
    return out


def restantes(taches, recurrents, jour=None):
    """Tâches non faites dues aujourd'hui ou en retard, triées par obligatoire puis moment
    puis échéance.

    `importance` n'est plus lu : obligatoire porte seul le tri (cf. logique-metier.md §3).
    Le moment (012_moment.sql) s'intercale juste après : matin avant soir, comme les deux
    cartes de l'écran Jour (frontend/taches/ui-taches.js::cartesMoment). Une tâche sans
    moment — hebdo, mensuelle, au besoin, ou quotidienne pas encore réglée — n'a pas sa
    place dans ces deux blocs : elle est classée APRÈS matin/soir (rang 2), jamais perdue,
    de la même façon que la carte « Sans moment » du front vient après Matin et Soir plutôt
    que de faire disparaître la tâche.
    """
    jour = (jour or date.today()).isoformat()
    dues = [t for t in taches if not t["fait_le"] and t["echeance"] <= jour]
    oblig = lambda t: 1 if recurrents.get(t["recurrent_id"], {}).get("obligatoire") else 0  # noqa: E731
    rang_moment = {"matin": 0, "soir": 1}

    def moment(t):
        return rang_moment.get(recurrents.get(t["recurrent_id"], {}).get("moment"), 2)

    return sorted(dues, key=lambda t: (-oblig(t), moment(t), t["echeance"], t["rang"], t["id"]))


def regrouper_pour_affichage(restantes_triees, recurrents):
    """Une ligne par récurrent + échéance, avec le compte fait/total — AFFICHAGE seulement.

    Miroir de frontend/taches/ui-taches.js::regrouper (esprit D-023, étendu au bot). Le
    ciblage (`cibler`) et la coche (`basculer`) continuent de travailler occurrence par
    occurrence : ce regroupement ne change ni le modèle ni le tri, il fusionne seulement
    des lignes déjà triées pour l'affichage.

    `restantes_triees` ne contient QUE des tâches non faites (sortie de `restantes()`), le
    bot n'a pas non plus les occurrences déjà cochées sous la main à cet endroit — le total
    prévu vient donc de `recurrents[...]["fois"]` (le récurrent le connaît, lui), et le
    nombre de faites se déduit par soustraction : `total - restantes`. Une tâche ponctuelle
    (`recurrent_id` None, pas de `fois`) garde sa propre ligne, jamais fusionnée.
    """
    groupes = {}
    ordre = []
    for t in restantes_triees:
        cle = (t["recurrent_id"], t["echeance"]) if t["recurrent_id"] else ("ponctuelle", t["id"])
        if cle not in groupes:
            total = recurrents.get(t["recurrent_id"], {}).get("fois", 1) if t["recurrent_id"] else 1
            groupes[cle] = {"tache": t, "restantes": 0, "total": total}
            ordre.append(cle)
        groupes[cle]["restantes"] += 1
    return [groupes[cle] for cle in ordre]


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

    `qui2` coche « à deux » : la tâche porte alors `qui` + `qui2`, chacun avec ses parts
    pleines figées (`parts_quart`, `parts_quart2`, D-038).
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
        # Parts de la personne qui coche (part spé comprise) ; à deux, chacun les siennes,
        # pleines (D-038) — l'ajustement au tiers se fait dans l'app.
        recurrent = recurrents.get(cible["recurrent_id"])
        base = lambda p: parts_de(recurrent, p) if recurrent else (cible.get("parts_quart") or 0)  # noqa: E731
        champs = {"fait_le": datetime.now(timezone.utc).isoformat(), "qui": prenom, "qui2": qui2,
                  "parts_quart": base(prenom), "parts_quart2": base(qui2) if qui2 else None,
                  "tiers": 3, "tiers2": 3 if qui2 else None}
    else:
        rec = recurrents.get(cible["recurrent_id"]) or {}
        champs = {"fait_le": None, "qui": rec.get("attribue_a"), "qui2": None, "parts_quart": 0,
                  "parts_quart2": None, "tiers": 3, "tiers2": None}
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
