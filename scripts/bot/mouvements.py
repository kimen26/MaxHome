"""Mouvements du mois : génération des occurrences, ciblage, coche.

Miroir côté bot de frontend/ui-mouvements.js — même règle de montant selon le mode
du récurrent, même figeage du montant au moment de la coche.
Aucune logique de conversation ici : bot.py appelle, formate via reponses.py.
"""
from datetime import datetime, timezone

import commandes


def montant_theorique(recurrent, resultat, lignes):
    """Montant attendu d'un mouvement selon le mode de son récurrent."""
    mode = recurrent["mode"]
    if mode == "fixe":
        return recurrent.get("montant_centimes") or 0
    if mode == "charge":
        return lignes.get(recurrent["charge_id"], 0)
    if mode == "part":
        return -resultat["aVerser"].get(recurrent["prenom_part"], 0)
    raise RuntimeError(f"mode de récurrent inconnu : {mode}")


def index_recurrents(donnees):
    return {r["id"]: r for r in donnees.recurrents_actifs()}


def du_mois(donnees, annee, mois, resultat, lignes):
    """Occurrences du mois, en créant celles des récurrents actifs qui manquent encore."""
    existants = donnees.mouvements(annee, mois)
    deja = {m["recurrent_id"] for m in existants if m["recurrent_id"]}
    manquants = [r for r in donnees.recurrents_actifs() if r["id"] not in deja]
    if not manquants:
        return existants
    crees = donnees.creer_mouvements([{
        "annee": annee, "mois": mois, "recurrent_id": r["id"], "titre": r["titre"],
        "compte_de": r.get("compte_de"), "compte_vers": r.get("compte_vers"),
        "montant_centimes": montant_theorique(r, resultat, lignes), "qui": r.get("qui"),
    } for r in manquants])
    return existants + crees


def montant_affiche(mouvement, recurrents, resultat, lignes):
    """Montant figé si le mouvement est fait, recalculé sinon."""
    if mouvement["fait_le"]:
        return mouvement["montant_centimes"]
    rec = recurrents.get(mouvement["recurrent_id"])
    return montant_theorique(rec, resultat, lignes) if rec else mouvement["montant_centimes"]


def restants(donnees, annee, mois, resultat, lignes):
    """Mouvements non faits du mois, montant recalculé."""
    recurrents = index_recurrents(donnees)
    return [{**m, "montant_centimes": montant_affiche(m, recurrents, resultat, lignes)}
            for m in du_mois(donnees, annee, mois, resultat, lignes) if not m["fait_le"]]


def cibler(mouvements, recurrents, prenom, titre):
    """Sans titre : le mouvement « part » de l'expéditeur. Avec titre : recherche floue.

    Retourne (mouvement, message_d_erreur) — exactement l'un des deux est None.
    """
    if titre:
        trouve, proches = commandes.meilleur_flou(titre, mouvements, "titre")
        if trouve:
            return trouve, None
        return None, f"Aucun mouvement ne correspond assez à « {titre} ». Proches : {', '.join(proches)}."
    part = [m for m in mouvements
            if recurrents.get(m["recurrent_id"], {}).get("mode") == "part"
            and recurrents[m["recurrent_id"]]["prenom_part"] == prenom]
    if not part:
        return None, f"Aucun virement au commun pour {prenom} ce mois. Précise : `fait <titre>`."
    return part[0], None


def basculer(donnees, prenom, titre, fait, resultat, lignes, annee, mois):
    """Coche (ou décoche) un mouvement. Retourne (mouvement_avant, champs_ecrits, erreur)."""
    recurrents = index_recurrents(donnees)
    cible, erreur = cibler(du_mois(donnees, annee, mois, resultat, lignes), recurrents, prenom, titre)
    if erreur:
        return None, None, erreur
    avant = {"fait_le": cible["fait_le"], "montant_centimes": cible["montant_centimes"]}
    if fait:
        # Le montant se fige au moment de la coche, comme dans le frontend.
        champs = {"fait_le": datetime.now(timezone.utc).isoformat(),
                  "montant_centimes": montant_affiche(cible, recurrents, resultat, lignes)}
    else:
        champs = {"fait_le": None, "montant_centimes": cible["montant_centimes"]}
    donnees.maj_mouvement(cible["id"], champs)
    return cible, champs, None
