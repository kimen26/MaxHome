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
import voyages as voyages_mod

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
        liste, recurrents = taches_mod.du_jour(bot.donnees)
        auj = date.today()
        depuis = auj - timedelta(days=action["jours"] - 1)
        recurrents_liste = list(recurrents.values())
        b = taches_mod.balance(liste, recurrents_liste, bot.membres, depuis, auj)
        b_oblig = taches_mod.balance(liste, recurrents_liste, bot.membres, depuis, auj,
                                     obligatoire_seul=True)
        return reponses.balance_taches(b, bot.membres, action["jours"],
                                       obligatoire=b_oblig["ratio"] if b_oblig["total"] else None)
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


# ---------- module Voyages (carnet, D-045) ----------
def voyages(bot, telegram_id, prenom, action, texte_brut=None):
    """Retourne le texte à envoyer, ou None si l'action ne la concerne pas.

    `topo` et `resa_libre` ne CHANGENT rien ici : ils préparent une confirmation oui/non
    posée dans bot.etats[telegram_id]["attente_voyage"], vidée par bot.py::gerer_attente_voyage.
    """
    a = action["action"]

    if a == "voyages":
        vs = voyages_mod.voyages_a_venir(bot.donnees.voyages(), date.today())
        avec_delai = [(v, (date_iso_en_date(v["debut"]) - date.today()).days) for v in vs]
        return reponses.liste_voyages(avec_delai)

    if a == "voyage":
        voyage, proches = voyages_mod.trouver_voyage(action["nom"], bot.donnees.voyages())
        if not voyage:
            return _voyage_introuvable(action["nom"], proches)
        resas = bot.donnees.resas_voyage(voyage["id"])
        lieux = bot.donnees.lieux_voyage(voyage["id"])
        aujourdhui = date.today().isoformat()
        du_jour = [l for l in lieux if l.get("jour") == aujourdhui]
        cible = du_jour if du_jour else [l for l in lieux if l.get("jour") and l["jour"] >= aujourdhui][:5]
        resume = bot.donnees.bloc_resume(voyage["id"])
        enveloppes = bot.donnees.enveloppes_voyage(voyage["id"])
        engage, prevu = voyages_mod.budget_engage_prevu(resas, enveloppes)
        return reponses.fiche_voyage(voyage, resas, cible, aujourdhui,
                                      resume=resume["texte"] if resume else None,
                                      budget_engage=engage, budget_prevu=prevu)

    if a == "lieu":
        voyage, suite_ou_proches = voyages_mod.separer_voyage_et_reste(action["reste"], bot.donnees.voyages())
        if not voyage:
            proches = suite_ou_proches
            return (f"Voyage introuvable. Proches : {', '.join(proches)}." if proches
                    else "Voyage introuvable.")
        nom_lieu = suite_ou_proches
        if not nom_lieu:
            return "Format : `lieu <voyage> <nom du lieu>`."
        lieu = voyages_mod.ajouter_lieu(bot.donnees, voyage, nom_lieu, prenom)
        bot.marquer_annulable(telegram_id, "voyage_lieux", {"id": lieu["id"]}, None)
        return reponses.lieu_ajoute(nom_lieu, lieu)

    if a == "localise":
        voyage, proches = voyages_mod.trouver_voyage(action["voyage"], bot.donnees.voyages())
        if not voyage:
            return _voyage_introuvable(action["voyage"], proches)
        n, restants = voyages_mod.localiser_manquants(bot.donnees, voyage)
        return reponses.localisation_resultat(n, restants)

    if a == "topo":
        voyage, proches = voyages_mod.trouver_voyage(action["voyage"], bot.donnees.voyages())
        if not voyage:
            return _voyage_introuvable(action["voyage"], proches)
        texte = voyages_mod.reecrire_topo(bot.donnees, voyage)
        if not texte:
            return "Le topo n'a pas pu être réécrit (assistant indisponible)."
        bot.etats.setdefault(telegram_id, {})["attente_voyage"] = {"type": "topo", "voyage_id": voyage["id"], "texte": texte}
        return reponses.topo_propose(texte)

    if a == "resa_libre":
        vs = bot.donnees.voyages()
        interp = voyages_mod.extraire_resa(texte_brut or "", vs, bot.membres)
        if interp.get("action") == "inconnu" or not interp.get("titre"):
            return "Je n'ai pas compris la réservation. Précise voyage, type, titre, date, prix, payeur."
        resa, erreur = voyages_mod.valider_resa(interp, vs, bot.membres)
        if erreur:
            return erreur
        bot.etats.setdefault(telegram_id, {})["attente_voyage"] = {"type": "resa", "resa": resa}
        return reponses.recap_resa(resa)

    return None


def _voyage_introuvable(nom, proches):
    base = f"Aucun voyage ne correspond à « {nom} »."
    return f"{base} Proches : {', '.join(proches)}." if proches else base


def date_iso_en_date(iso):
    if not iso:
        return date.max
    return date.fromisoformat(iso[:10])


def confirmer_voyage(bot, telegram_id, prenom, oui):
    """Traite la réponse oui/non à une attente_voyage (topo ou résa). Vide l'attente."""
    etat = bot.etats.get(telegram_id, {}).pop("attente_voyage", None)
    if not etat:
        return None
    if not oui:
        return "OK, rien fait."
    if etat["type"] == "topo":
        voyages_mod.enregistrer_topo(bot.donnees, etat["voyage_id"], etat["texte"])
        return "Topo enregistré."
    if etat["type"] == "resa":
        cree = voyages_mod.inserer_resa(bot.donnees, etat["resa"], prenom)
        bot.marquer_annulable(telegram_id, "voyage_resas", {"id": cree["id"]}, None)
        return reponses.resa_enregistree(etat["resa"])
    raise RuntimeError(f"attente_voyage de type inconnu : {etat['type']}")
