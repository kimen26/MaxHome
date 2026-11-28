"""Boucle d'agent pilotée par Python : le modèle (claude_cli, sans outil) rend à chaque tour UN JSON, soit une
LECTURE que le code exécute (le résultat revient au tour suivant, balisé comme donnée), soit une action
finale servie par la fonction `suite` reçue (dialogue_libre._suite). Au plus 6 tours et 150 s.

La garde est du code, jamais un jugement du modèle (D-068) : un contenu lu suspect arrête tout ; après la
lecture d'un tiers (l'école), seule une liste FERMÉE d'actions finales est servie.
"""
import logging
import time

import agent_lectures
import budget_lignes
import libre
import outils
import reponses

try:
    from accuse import signaler
except ImportError:  # accuse.py arrive avec le lot « accusé de lecture » : sans lui, aucun accusé
    def signaler(bot, cle):
        return None

ETAPES_MAX = 6
DELAI_TOTAL_S = 150
DELAI_APPEL_MAX_S = 60
DELAI_APPEL_MIN_S = 15
MODELE_SIMPLE = "haiku"    # tour où rien n'a encore été lu
MODELE_ENCHAINE = "sonnet"  # dès qu'une lecture est faite : le raisonnement sur du texte lu
TROP_LONG = "Ça prend trop de temps, je n'y arrive pas. Peux-tu me le demander plus simplement ?"
ECHEC_MODELE = "Je n'arrive pas à réfléchir pour l'instant, réessaie dans un moment."
SUSPECT = "Ce que j'ai lu contient une consigne suspecte : je m'arrête là et je ne fais rien."
REFUS_APRES_LECTURE = "J'ai lu du contenu venu de l'extérieur : je ne fais aucune écriture sans que tu me le demandes."
FINALES_APRES_TIERS = frozenset({
    "repondre", "demander", "inconnu", "ecritures", "agenda_lire", "agenda_creer", "course_ajout", "bilan",
    "charges", "a_virer", "taches", "balance", "courses_liste", "question", "ecole_nouvelles", "ecole_photos",
    "ecole_documents", "ecole_tours", "proches"})
FINALES_LENTES = frozenset({"ecole_nouvelles", "question", "web_recherche", "recherche"})  # modèle ou réseau

log = logging.getLogger("bot")


def _cle(interp):
    """Identité d'une lecture : même nom et mêmes paramètres = même lecture."""
    return tuple(sorted((k, str(v)) for k, v in interp.items()))


def _refusee_apres_tiers(interp):
    """Après une lecture d'un tiers : l'action (et chaque écriture groupée) doit être dans la liste fermée."""
    if interp.get("action") not in FINALES_APRES_TIERS:
        return True
    liste = interp.get("liste")
    if interp.get("action") == "ecritures" and isinstance(liste, list):
        return any(not isinstance(e, dict) or e.get("action") not in FINALES_APRES_TIERS for e in liste)
    return False


def _ecritures(bot, etat, telegram_id, prenom, texte, interp, servir, ecrire_lot):
    liste = [e for e in interp.get("liste") or [] if isinstance(e, dict)] if isinstance(interp.get("liste"), list) else []
    if not liste:
        return reponses.non_compris()
    if ecrire_lot is not None:
        return ecrire_lot(bot, etat, telegram_id, prenom, texte, liste)
    return servir(liste[0])  # sans lot : la première écriture seule, proposée d'un « OK ? »


def _finale(bot, etat, telegram_id, prenom, texte, interp, suite, annee, mois, peut_se_taire, ecrire_lot, tiers):
    nom = interp.get("action")
    if tiers and _refusee_apres_tiers(interp):
        log.warning("agent : action %s refusée après une lecture d'un tiers", nom)
        return REFUS_APRES_LECTURE
    if nom == "bavardage":
        return None if peut_se_taire else reponses.non_compris()
    if nom == "repondre":
        reponse = interp.get("texte")
        return reponse.strip() if isinstance(reponse, str) and reponse.strip() else reponses.non_compris()

    def servir(action):
        if action.get("action") in FINALES_LENTES:
            signaler(bot, action["action"])
        return suite(bot, etat, telegram_id, prenom, texte, action, annee, mois)

    if nom == "ecritures":
        return _ecritures(bot, etat, telegram_id, prenom, texte, interp, servir, ecrire_lot)
    return servir(interp)


def mener(bot, etat, telegram_id, prenom, texte, suite, echanges=(), peut_se_taire=False,
          horloge=time.monotonic, ecrire_lot=None):
    """Réponse à envoyer (texte), ou None si le bot doit se taire (bavardage en groupe).

    `suite(bot, etat, telegram_id, prenom, texte, interp, annee, mois)` sert l'action finale ;
    `ecrire_lot(bot, etat, telegram_id, prenom, texte, liste)` proposera plusieurs écritures d'un seul « OK ? ».
    """
    debut = horloge()
    bot.rafraichir_referentiel()  # une charge créée dans l'app depuis le démarrage doit être connue
    annee, mois = bot.mois_courant()
    libelles = [c["libelle"] for c in budget_lignes.charges_actives(bot.charges)]
    canal = "groupe" if peut_se_taire else "prive"
    lectures, vues, tiers = [], set(), False
    for etape in range(1, ETAPES_MAX + 1):
        reste = DELAI_TOTAL_S - (horloge() - debut)
        if reste < DELAI_APPEL_MIN_S:
            break
        interp = libre.interpreter(
            texte, prenom, bot.membres, libelles, f"{annee}-{mois:02d}", echanges,
            timeout=min(DELAI_APPEL_MAX_S, reste), lectures=lectures, canal=canal,
            modele=MODELE_ENCHAINE if lectures else MODELE_SIMPLE, etape=etape)
        nom = interp.get("action")
        if nom == "echec":
            return ECHEC_MODELE
        if nom not in agent_lectures.LECTURES:
            return _finale(bot, etat, telegram_id, prenom, texte, interp, suite, annee, mois,
                           peut_se_taire, ecrire_lot, tiers)
        if _cle(interp) in vues:  # déjà lue : le modèle a déjà son résultat, on ne le relit pas
            continue
        vues.add(_cle(interp))
        signaler(bot, nom)
        lecture = agent_lectures.lire(bot, telegram_id, prenom, interp)
        if outils.contenu_suspect(lecture.texte):
            log.warning("agent : contenu suspect dans la lecture %s (contenu non journalisé)", nom)
            return SUSPECT
        tiers = tiers or lecture.tiers
        lectures = [*lectures, (nom, lecture.texte)]
    return TROP_LONG
