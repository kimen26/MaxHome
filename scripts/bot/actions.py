"""Dispatch métier du bot, un groupe de fonctions par module.

Chaque fonction reçoit le bot (pour ses données, son référentiel et son état d'annulation),
retourne le texte à envoyer, ou None si l'action ne la concerne pas. Aucune boucle, aucune
gestion de conversation ici : bot.py aiguille, ces fonctions agissent.
"""
from datetime import date, timedelta

import courses as courses_mod
import mouvements
import reponses
import taches as taches_mod

# ---------- module Budget ----------
def budget(bot, telegram_id, prenom, action, annee, mois):
    a = action["action"]
    if a == "mois":
        return f"Mois courant : {reponses.nom_mois(annee, mois)}."

    if a == "bilan":
        r, lignes, _ = bot.charger_r(annee, mois)
        a_prec, m_prec = bot.mois_precedent(annee, mois)
        prec = {l["charge_id"] for l in bot.donnees.lignes_mois(a_prec, m_prec) if l["montant_centimes"]}
        actuelles = {cid for cid, m in lignes.items() if m}
        restants = mouvements.restants(bot.donnees, annee, mois, r, lignes)
        return reponses.bilan(r, bot.membres, annee, mois, bool(prec - actuelles), restants)

    if a == "charges":
        _, lignes, _ = bot.charger_r(annee, mois)
        return reponses.liste_charges(bot.charges, lignes)

    if a == "salaire":
        cible = action["prenom"] or prenom
        if cible not in bot.membres:
            return f"Prénom inconnu : {cible}."
        ancienne = next((r["montant_centimes"] for r in bot.donnees.revenus_mois(annee, mois)
                         if r["prenom"] == cible), 0)
        bot.donnees.maj_revenu(annee, mois, cible, action["montant_centimes"])
        bot.marquer_annulable(telegram_id, "revenus", {"annee": annee, "mois": mois, "prenom": cible}, ancienne)
        return reponses.confirmation_ecriture(f"Salaire {cible}", action["montant_centimes"], annee, mois)

    if a == "charge":
        ancienne = next((l["montant_centimes"] for l in bot.donnees.lignes_mois(annee, mois)
                         if l["charge_id"] == action["charge_id"]), 0)
        bot.donnees.maj_ligne(annee, mois, action["charge_id"], action["montant_centimes"])
        bot.marquer_annulable(telegram_id, "lignes",
                               {"annee": annee, "mois": mois, "charge_id": action["charge_id"]}, ancienne)
        return reponses.confirmation_ecriture(action["libelle_reel"], action["montant_centimes"], annee, mois)

    if a == "extra":
        # Charge ponctuelle : créée inactive pour ne pas peupler les mois suivants.
        c = bot.donnees.creer_charge({
            "libelle": action["libelle"], "categorie": "Autre", "regle": action["regle"],
            "type": "proport", "ponctuel": True, "actif": False, "ordre": 999,
        })
        bot.charges.append(c)
        bot.donnees.maj_ligne(annee, mois, c["id"], action["montant_centimes"])
        bot.marquer_annulable(telegram_id, "lignes", {"annee": annee, "mois": mois, "charge_id": c["id"]}, 0)
        return reponses.confirmation_ecriture(f"Extra {action['libelle']}", action["montant_centimes"], annee, mois)

    if a == "ajustement":
        # « X prend N motif » : X reçoit moins de charge à verser, donc de = l'autre, vers = X.
        beneficiaire = action["beneficiaire"]
        autre = next((p for p in bot.membres if p != beneficiaire), beneficiaire)
        reg = bot.donnees.creer_ajustement({
            "annee": annee, "mois": mois, "de": autre, "vers": beneficiaire,
            "montant_centimes": action["montant_centimes"], "motif": action["motif"],
        })
        bot.marquer_annulable(telegram_id, "ajustements", {"id": reg["id"]}, None)
        return reponses.confirmation_ajustement(autre, beneficiaire, action["montant_centimes"], action["motif"])

    if a == "mouvement":
        return bot.basculer_fait(telegram_id, prenom, action, annee, mois)
    return None

# ---------- module Tâches ----------
def taches(bot, telegram_id, prenom, action):
    a = action["action"]
    if a == "taches":
        liste, recurrents = taches_mod.du_jour(bot.donnees)
        return reponses.liste_taches(taches_mod.restantes(liste, recurrents),
                                     recurrents, date.today().isoformat())
    if a == "balance":
        liste, _ = taches_mod.du_jour(bot.donnees)
        auj = date.today()
        b = taches_mod.balance(liste, bot.membres, auj - timedelta(days=action["jours"] - 1), auj)
        return reponses.balance_taches(b, bot.membres, action["jours"])
    return None

# ---------- module Courses ----------
def courses(bot, telegram_id, prenom, action):
    a = action["action"]
    if a == "course_ajout":
        article = courses_mod.ajouter(bot.donnees, prenom, action["libelle"])
        bot.marquer_annulable(telegram_id, "courses", {"id": article["id"]}, None)
        return f"« {article['libelle']} » ajouté à la liste de courses."
    if a == "courses_liste":
        return reponses.liste_courses(bot.donnees.courses())
    return None
