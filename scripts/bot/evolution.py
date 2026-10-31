"""Demandes d'évolution reçues par le bot (« change ce libellé », « ajoute une fonctionnalité »).

Le bot NE TOUCHE JAMAIS au code : il note la demande dans inbox/demandes_bot.md (inbox/ est
ignoré par git : invariant 1, rien de personnel dans le dépôt) et prévient Yann en privé
si la demande vient de quelqu'un d'autre.
"""
import logging
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

RACINE = Path(__file__).resolve().parent.parent.parent
FICHIER = RACINE / "inbox" / "demandes_bot.md"
PRENOM_ADMIN = "Yann"
LONGUEUR_MAX = 500
ENTETE = "# Demandes reçues par le bot Telegram\n\nUne ligne par demande : date, prénom, texte.\n\n"

log = logging.getLogger("bot")


def _une_ligne(texte):
    return " ".join(str(texte).split())[:LONGUEUR_MAX]


def noter(prenom, texte, maintenant=None):
    """Ajoute « - date — prénom : texte » au fichier (créé avec son en-tête au besoin). Lève OSError."""
    quand = (maintenant or datetime.now()).strftime("%Y-%m-%d %H:%M")
    FICHIER.parent.mkdir(parents=True, exist_ok=True)
    nouveau = not FICHIER.exists()
    with FICHIER.open("a", encoding="utf-8") as f:
        if nouveau:
            f.write(ENTETE)
        f.write(f"- {quand} — {prenom} : {_une_ligne(texte)}\n")


def ids_telegram(donnees, prenom):
    """Les telegram_id inscrits sous ce prénom (donnees.py n'a pas cette lecture : on passe par `_appel`,
    comme budget_lignes.py)."""
    lignes = donnees._appel("GET", f"telegram_membres?prenom=eq.{quote(prenom)}&select=telegram_id")
    return [int(l["telegram_id"]) for l in lignes or []]


def prevenir_admin(bot, prenom, texte):
    """Message privé à Yann (un chat privé a pour chat_id le telegram_id). Un échec d'envoi est
    journalisé, jamais bloquant : la demande est déjà notée dans le fichier."""
    message = f"Demande de {prenom} pour MaxHome : {_une_ligne(texte)}"
    try:
        for telegram_id in ids_telegram(bot.donnees, PRENOM_ADMIN):
            bot.telegram.envoyer(telegram_id, message)
    except Exception:
        log.exception("message à %s échoué", PRENOM_ADMIN)


def enregistrer(bot, prenom, texte):
    """Note la demande, prévient Yann si besoin, rend la réponse à la personne."""
    try:
        noter(prenom, texte)
    except OSError:
        log.exception("demande d'évolution non notée")
        return f"Je n'ai pas réussi à noter ta demande. Dis-la directement à {PRENOM_ADMIN}."
    if prenom != PRENOM_ADMIN:
        prevenir_admin(bot, prenom, texte)
    return f"Noté pour {PRENOM_ADMIN}."
