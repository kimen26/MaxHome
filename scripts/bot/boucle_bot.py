"""Boucle de long polling du bot et traitement d'un update Telegram (extraits de bot.py).

`bot` est l'instance de bot.Bot : ce module n'ajoute aucune logique, il ne fait que séquencer.
"""
import time

import groupe
from telegram import est_reseau_transitoire

PAUSE_RESEAU_MIN_S = 5
PAUSE_RESEAU_MAX_S = 60


def boucler(bot, max_iterations=None):
    """`max_iterations` borne le nombre de passages (tests hors ligne) ; None = infini (prod)."""
    offset = 0
    pause_reseau = PAUSE_RESEAU_MIN_S
    bot.log.info("bot démarré")
    iterations = 0
    while max_iterations is None or iterations < max_iterations:
        iterations += 1
        try:
            updates = bot.telegram.get_updates(offset)
        except Exception as exc:
            if est_reseau_transitoire(exc):
                bot.log.warning("getUpdates : réseau indisponible (%s), pause %ds",
                                  type(exc).__name__, pause_reseau)
                time.sleep(pause_reseau)
                pause_reseau = min(pause_reseau * 2, PAUSE_RESEAU_MAX_S)
            else:
                bot.log.exception("getUpdates : erreur inattendue, pause %ds", PAUSE_RESEAU_MIN_S)
                time.sleep(PAUSE_RESEAU_MIN_S)
            continue
        pause_reseau = PAUSE_RESEAU_MIN_S  # un getUpdates réussi remet le backoff à zéro
        for u in updates:
            offset = u["update_id"] + 1
            traiter_update(bot, u)


def traiter_update(bot, u):
    """Un update Telegram : événement de groupe, filtre de groupe (groupe.py), puis texte ou pièce jointe."""
    msg = u.get("message")
    if not msg:
        if u.get("edited_message"):  # jamais traité : on le dit au journal (sans texte ni identifiant)
            bot.log.info("message modifié ignoré : renvoyer un nouveau message")
        return
    if groupe.gerer_evenement(bot, msg):
        return
    msg, adresse = groupe.filtrer(msg, bot.identite, bot.etats)  # groupe : adressé ou non, sinon None
    if msg is None:
        bot.log.info("groupe : message ignoré (pièce jointe non adressée, ou identité du bot inconnue)")
        return
    bot.log.info("message reçu (%s), traitement", "groupe" if groupe.est_groupe(msg["chat"]) else "privé")
    chat_id = msg["chat"]["id"]
    telegram_id = msg["from"]["id"]
    bot.etats.get(telegram_id, {}).pop("envois", None)  # jamais l'envoi resté d'un message précédent
    if "text" in msg:
        try:
            reponse = (bot.traiter_message(telegram_id, msg["text"]) if adresse
                       else bot.traiter_message(telegram_id, msg["text"], adresse=False))
        except Exception:
            bot.log.exception("erreur non gérée")
            reponse = "Erreur interne, réessaie."
        if not adresse and reponse is None:  # bruit écarté (groupe.py) : le bot se tait ; « pas compris » se dit
            bot.log.info("groupe : message sans suite, pas de réponse")
            return
    elif "photo" in msg or "document" in msg:
        try:
            reponse = (bot.traiter_piece(telegram_id, msg) if adresse
                       else bot.traiter_piece(telegram_id, msg, adresse=False))
        except Exception:
            bot.log.exception("erreur traitement pièce jointe")
            reponse = "Erreur interne, réessaie."
    else:
        return
    groupe.noter_chat(bot.etats, telegram_id, chat_id)
    if reponse is None:
        return
    try:
        bot.telegram.envoyer(chat_id, reponse)
    except Exception:
        bot.log.exception("envoi Telegram échoué")
        return
    envoyer_fichiers_en_attente(bot, chat_id, telegram_id)


def envoyer_fichiers_en_attente(bot, chat_id, telegram_id):
    """Photos, vidéos et documents que la réponse vient d'annoncer (ecole_espace.py), après le texte."""
    fichiers = bot.etats.get(telegram_id, {}).pop("envois", None)
    if not fichiers:
        return
    try:
        bot.telegram.envoyer_fichiers(chat_id, fichiers)
    except Exception:
        bot.log.exception("envoi des fichiers Telegram échoué")
        try:
            bot.telegram.envoyer(chat_id, "Je n'ai pas réussi à envoyer les fichiers.")
        except Exception:
            bot.log.exception("envoi Telegram échoué")
