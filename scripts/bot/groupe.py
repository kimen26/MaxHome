"""Le bot dans le groupe Telegram « Maison » (D-060).

Le mode confidentialité du bot est désactivé dans BotFather : Telegram lui livre TOUS les messages du
groupe. C'est donc ici que le bot décide lesquels le concernent. Sinon il ignore, en silence, et ne
journalise jamais le contenu. En conversation privée rien ne change.

Un message de groupe est traité seulement s'il (a) mentionne le bot, (b) répond à l'un de ses
messages, ou (c) vient de quelqu'un à qui le bot attend encore une réponse, dans ce même groupe.

Des fonctions sur des dicts (messages Telegram, bot.etats) ; seules `gerer_evenement` et
`noter_chat` touchent au bot, et par ses ports (donnees, telegram, log).
"""
import re
import time
from dataclasses import dataclass

import conversation

TYPES_GROUPE = frozenset({"group", "supergroup"})
CLE_PARAMETRE = "telegram_groupe"  # table parametres (migration 016) ; dupliquée dans rappel-virements/index.ts
CLE_CHAT = "chat_dernier"          # etats[personne][CLE_CHAT] : le chat où elle a parlé en dernier
AVERTISSEMENT_CONFIDENTIALITE = (
    "mode confidentialité actif : en groupe je ne vois que les mentions et réponses")
MOT_DEFAUT = "aide"  # une mention seule (« @bot ») : le bot montre ce qu'il sait faire, sans appeler le modèle

_RE_ESPACES = re.compile(r"[ \t]+")
_DEBUT_PARASITE = ",:;"


@dataclass(frozen=True)
class Identite:
    bot_id: int
    username: str
    lit_tout: bool  # can_read_all_group_messages : faux = mode confidentialité encore actif


def identite(reponse_get_me):
    """L'identité du bot, d'après la réponse de getMe. Jamais d'username écrit en dur."""
    bot_id, username = reponse_get_me.get("id"), reponse_get_me.get("username")
    if not isinstance(bot_id, int) or not username:
        raise RuntimeError("getMe : id ou username absent de la réponse")
    return Identite(bot_id, username, bool(reponse_get_me.get("can_read_all_group_messages")))


def est_groupe(chat):
    return chat.get("type") in TYPES_GROUPE


# ---------- filtrage ----------

def retirer_mention(texte, username):
    """(mentionne, texte sans la mention). Gère « @bot » n'importe où et le suffixe d'une /commande@bot."""
    nom = re.escape(username)
    sans_suffixe, n_suffixe = re.subn(rf"^(/\w+)@{nom}(?!\w)", r"\1", texte, flags=re.IGNORECASE)
    propre, n_mention = re.subn(rf"[ \t]*(?<!\w)@{nom}(?!\w)[ \t]*", " ", sans_suffixe, flags=re.IGNORECASE)
    propre = _RE_ESPACES.sub(" ", propre).strip().lstrip(_DEBUT_PARASITE + " ")
    return (n_suffixe + n_mention) > 0, propre


def repond_au_bot(msg, bot_id):
    cite = msg.get("reply_to_message") or {}
    return (cite.get("from") or {}).get("id") == bot_id


def attente_en_cours(etat, texte):
    """Le bot attend-il quelque chose de cette personne ?

    - une question libre en cours : toute réponse compte ;
    - une proposition à confirmer (écriture libre, copie du mois vide) : seulement un oui/non,
      toute autre phrase est une conversation entre eux (elle se dit avec la mention) ;
    - jamais `attente_voyage` : elle n'expire pas, rien ne prouve qu'elle soit encore valide.
    """
    if conversation.en_attente(etat, conversation.QUESTION):
        return True
    if conversation.verdict(texte) is None:
        return False
    if conversation.en_attente(etat, conversation.CONFIRMATION):
        return True
    copie = etat.get("attente")
    return bool(copie) and time.time() <= copie["expire"]


def _attendu(etats, msg, texte):
    etat = etats.get((msg.get("from") or {}).get("id"))
    return bool(etat) and etat.get(CLE_CHAT) == msg["chat"]["id"] and attente_en_cours(etat, texte)


def filtrer(msg, ident, etats):
    """Le message à traiter (mention retirée), ou None s'il est à ignorer en silence. Privé : inchangé."""
    if not est_groupe(msg.get("chat") or {}):
        return msg
    if ident is None:  # identité du bot inconnue : on ne sait pas reconnaître une mention, donc on se tait
        return None
    champ = "text" if "text" in msg else "caption"
    brut = msg.get(champ) or ""
    mentionne, propre = retirer_mention(brut, ident.username)
    if not (mentionne or repond_au_bot(msg, ident.bot_id) or _attendu(etats, msg, brut)):
        return None
    if champ not in msg:  # photo ou PDF sans légende, en réponse au bot
        return msg
    return {**msg, champ: propre or (MOT_DEFAUT if champ == "text" else "")}


def noter_chat(etats, telegram_id, chat_id):
    """Retient où la personne a parlé : une question posée en privé n'ouvre pas le groupe (ni l'inverse)."""
    etats.setdefault(telegram_id, {})[CLE_CHAT] = chat_id


# ---------- le bot arrive dans un groupe, ou le groupe change d'id ----------

def evenement(msg, ident):
    """'ajout' (le bot vient d'être mis dans le groupe), 'migration' (groupe devenu supergroupe) ou None."""
    if not est_groupe(msg.get("chat") or {}):
        return None
    if "migrate_to_chat_id" in msg:
        return "migration"
    if msg.get("group_chat_created"):
        return "ajout"
    if ident and any(m.get("id") == ident.bot_id for m in msg.get("new_chat_members") or []):
        return "ajout"
    return None


def accueil(username):
    return (f"Bonjour ! Ce groupe reçoit maintenant les rappels de MaxHome. "
            f"Pour me parler ici : écrivez @{username} puis votre demande, ou répondez à l'un de mes messages. "
            f"Je ne réagis pas aux autres messages du groupe.")


def _accueillir(bot, msg):
    chat_id = msg["chat"]["id"]
    auteur = (msg.get("from") or {}).get("id")
    if auteur is None or not bot.donnees.membre_telegram(auteur):
        bot.log.info("groupe refusé : bot ajouté par un inconnu (id masqué), je le quitte")
        bot.telegram.quitter(chat_id)  # sans rien écrire
        return
    bot.donnees.maj_parametre(CLE_PARAMETRE, str(chat_id))
    bot.log.info("groupe enregistré pour les rappels")
    bot.telegram.envoyer(chat_id, accueil(bot.identite.username))


def _migrer(bot, msg):
    ancien, nouveau = msg["chat"]["id"], msg["migrate_to_chat_id"]
    if bot.donnees.parametre(CLE_PARAMETRE) != str(ancien):
        return  # pas le groupe des rappels : rien à suivre
    bot.donnees.maj_parametre(CLE_PARAMETRE, str(nouveau))
    bot.log.info("groupe devenu supergroupe : id des rappels mis à jour")


def gerer_evenement(bot, msg):
    """Traite l'ajout du bot à un groupe ou le changement d'id. True si le message était un tel événement."""
    nature = evenement(msg, bot.identite)
    if nature is None:
        return False
    try:
        (_accueillir if nature == "ajout" else _migrer)(bot, msg)
    except Exception:
        bot.log.exception("groupe : événement %s non traité", nature)
    return True
