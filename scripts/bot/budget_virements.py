"""Dispatch bot pour `valider`/`pas validé`/`dévalider` une ligne de charge (D-046, D-048 §1-2)
et `à virer`/`virements` (virements du mois groupés par trajet, D-048 §3). Hors actions.py
(fichier interdit, arbre partagé) : bot.py aiguille directement ici. Style voisin de actions.py.
"""
import json
import subprocess
from datetime import datetime
from pathlib import Path

import budget_lignes
import commandes
import mouvements
import reponses
from iban_bot import formater_iban

RACINE = Path(__file__).resolve().parent.parent.parent
VIREMENTS_CLI = RACINE / "scripts" / "bot" / "virements_cli.mjs"


def basculer_mouvement(bot, telegram_id, prenom, action, annee, mois):
    """Coche (ou décoche) un mouvement du mois et rend l'écriture annulable — bot.py::basculer_fait.

    Un mouvement dont le récurrent est en mode "charge" (compte-charge.js) n'a plus sa propre
    case côté app depuis D-046 : sa LIGNE de charge porte la validation. Si le bot coche ce
    mouvement (par son titre), il valide donc aussi la ligne liée avec la même personne — sinon
    l'app afficherait la charge comme non validée alors que son virement est fait (le mouvement,
    lui, ne réapparaît plus dans « à faire »)."""
    resultat, lignes, _ = bot.charger_r(annee, mois)
    cible, champs, erreur = mouvements.basculer(
        bot.donnees, prenom, action.get("titre"), action["fait"], resultat, lignes, annee, mois)
    if erreur:
        return erreur
    avant_mouvement = {"fait_le": cible["fait_le"], "montant_centimes": cible["montant_centimes"],
                       "fait_par": cible.get("fait_par")}
    avant_ligne = budget_lignes.valider_ligne_si_mouvement_charge(
        bot.donnees, bot.charges, cible, prenom, action["fait"])
    # Une seule entrée d'annulation couvre les deux écritures (mouvement + ligne liée) : deux
    # marquer_annulable successifs écraseraient l'un par l'autre, `annuler` ne restaurerait
    # alors que la dernière table touchée (la coche est UN geste utilisateur, elle s'annule
    # d'un coup, comme annulerBascule côté frontend).
    if avant_ligne is not None:
        bot.marquer_annulable(telegram_id, "mouvement_et_ligne",
                              {"mouvement_id": cible["id"]}, {"mouvement": avant_mouvement, "ligne": avant_ligne})
    else:
        bot.marquer_annulable(telegram_id, "mouvements", {"id": cible["id"]}, avant_mouvement)
    return reponses.confirmation_mouvement(cible["titre"], champs["montant_centimes"], action["fait"])


def _fuzzy_charge(bot, libelle):
    """Charge trouvée par le même fuzzy que la saisie de montant (D-043 : jamais une terminée)."""
    proposables = budget_lignes.charges_actives(bot.charges)
    return commandes.meilleur_libelle(reponses.normaliser(libelle), proposables)


def valider(bot, telegram_id, prenom, action, annee, mois):
    charge, proches = _fuzzy_charge(bot, action["libelle"])
    if charge is None:
        return (f"Aucune charge ne correspond assez à « {action['libelle']} ». "
                f"Proches : {', '.join(proches)}.")
    cible = action["prenom"] if action["valider"] else None
    if action["valider"] and not cible:
        cible = prenom
    texte, avant = budget_lignes.valider_ligne(bot.donnees, annee, mois, charge, cible,
                                                action["valider"], bot.membres)
    if avant is not None:
        bot.marquer_annulable(telegram_id, "lignes_validation", {}, avant)
    return texte


def _construire_groupes(bot, annee, mois):
    """Appelle le pont Node (virements_cli.mjs) sur l'état complet du mois — même moteur que
    l'app (frontend/budget/groupes-virements.js), jamais une réimplémentation Python (L-014)."""
    resultat, lignes, _ = bot.charger_r(annee, mois)
    lignes_avec_validation = {l["charge_id"]: {"montant_centimes": l["montant_centimes"],
                                                "fait_le": l.get("fait_le"), "fait_par": l.get("fait_par")}
                              for l in budget_lignes.lignes_mois_avec_validation(bot.donnees, annee, mois)}
    etat = {
        "membres": [{"prenom": p} for p in bot.membres],
        "comptes": budget_lignes.comptes(bot.donnees),
        "charges": bot.charges,
        "recurrents": bot.donnees.recurrents_actifs(),
        "lignes": lignes_avec_validation,
        "mouvements": bot.donnees.mouvements(annee, mois),
    }
    entree = json.dumps({"etat": etat})
    # encoding="utf-8" explicite : sur Windows, text=True seul retombe sur l'encodage console
    # (cp1252) et corrompt les accents des libellés/titres/comptes (D-048 §3, noms réels : « Caisse
    # d'Épargne »...) — même piège que calc_cli.mjs, invisible tant qu'aucune sortie n'a d'accent.
    r = subprocess.run(["node", str(VIREMENTS_CLI)], input=entree, capture_output=True, text=True,
                       encoding="utf-8", timeout=30)
    if r.returncode != 0:
        raise RuntimeError(f"virements_cli.mjs échoué : {r.stderr[:300]}")
    return json.loads(r.stdout)["groupes"], etat["comptes"]


def _ligne_groupe(g, comptes):
    statut = ""
    if g["fait"]:
        prenom = g["prenom"] if isinstance(g["prenom"], str) else "?"
        date_faite = _date_plus_recente(g["lignes"])
        statut = f" (✓ {prenom}" + (f" · {date_faite}" if date_faite else "") + ")"
    lignes = [f"{g['libelleDe']} → {g['libelleVers']} : {reponses.euros(g['total'])}"
              f" ({reponses.pluriel(len(g['lignes']), 'ligne')}){statut}"]
    for l in g["lignes"]:
        coche = " ✓" if l["valeur"] else ""
        lignes.append(f"  {l['libelle']} : {reponses.euros(l['montant_centimes'])}{coche}")
    compte = next((c for c in comptes if c["id"] == g["vers"]), None)
    if compte and compte.get("iban"):
        lignes.append(f"  IBAN : {formater_iban(compte['iban'])}")
    return "\n".join(lignes)


def _date_plus_recente(lignes):
    """`fait_le` le plus récent parmi les lignes du groupe (virements_cli.mjs l'ajoute à chaque
    ligne). Formaté `jj/mm`, comme reponses.py::_date_heure pour les résas de voyage."""
    dates = sorted((l["fait_le"] for l in lignes if l.get("fait_le")), reverse=True)
    if not dates:
        return None
    try:
        return datetime.fromisoformat(dates[0]).strftime("%d/%m")
    except ValueError:
        return None


def a_virer(bot, annee, mois):
    groupes, comptes = _construire_groupes(bot, annee, mois)
    if not groupes:
        return "Aucun virement à faire ce mois."
    a_faire = [g for g in groupes if not g["fait"]]
    faits = [g for g in groupes if g["fait"]]
    lignes = ["Virements à faire :"] if a_faire else []
    for g in a_faire:
        lignes.append(_ligne_groupe(g, comptes))
    if faits:
        lignes.append("Déjà faits :")
        for g in faits:
            lignes.append(_ligne_groupe(g, comptes))
    return "\n".join(lignes)
