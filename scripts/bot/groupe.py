"""Le bot dans le groupe Telegram « Maison » (D-060).

Le mode confidentialité du bot est désactivé dans BotFather : Telegram lui livre TOUS les messages du
groupe. C'est donc ici que le bot décide lesquels le concernent. Sinon il ignore, en silence, et ne
journalise jamais le contenu. En conversation privée rien ne change.

Tout message texte d'un membre du foyer est traité, comme en privé (« si on parle ici, c'est pour le
bot », 08/11). Il est « adressé » s'il (a) mentionne le bot, (b) répond à l'un de ses messages, ou
(c) vient de quelqu'un à qui le bot attend encore une réponse, dans ce même groupe. Un message adressé
garde toutes ses réponses, « je n'ai pas compris » compris. Un message NON adressé reçoit lui aussi une
réponse, « je n'ai pas compris » compris : le bot ne se tait que sur le bruit, un message court sans
verbe d'action (« ok », « mdr », un émoji) écarté avant même d'appeler le modèle (`sans_suite_evident`)
ou une réponse de `ACTIONS_MUETTES` (bot.py). Une pièce jointe non adressée est ignorée, sauf un PDF ou une pièce légendée (document de voyage, lot A).

Des fonctions sur des dicts (messages Telegram, bot.etats) ; seules `gerer_evenement` et
`noter_chat` touchent au bot, et par ses ports (donnees, telegram, log).
"""
import re
import time
from dataclasses import dataclass

import conversation
from reponses import normaliser

TYPES_GROUPE = frozenset({"group", "supergroup"})
CLE_PARAMETRE = "telegram_groupe"  # table parametres (migration 016) ; dupliquée dans rappel-virements/index.ts
CLE_CHAT = "chat_dernier"          # etats[personne][CLE_CHAT] : le chat où elle a parlé en dernier
AVERTISSEMENT_CONFIDENTIALITE = (
    "mode confidentialité actif : en groupe je ne vois que les mentions et réponses")
MOTS_MAX_SANS_SUITE = 3  # au-delà, une phrase peut être une demande : le modèle la lit
# Radicaux (texte normalisé : minuscules, sans accents) des verbes d'action et des mots de demande que
# la grammaire (commandes.py) ou le modèle (libre.py) savent agir. Un message court qui en contient un
# part au traitement ; sans eux, « ok », « mdr », « merci », « a ce soir » sont du bavardage.
RADICAUX_ACTION = (
    "ajout", "rajout", "achet", "pay", "vir", "valid", "fait", "fais", "fini", "termin", "coch", "note",
    "mets", "met ", "prend", "depens", "rembours", "annul", "cherch", "trouv", "compar", "surveill",
    "cree", "creer", "change", "renomm", "supprim", "enlev", "retir", "combien", "quel", "qui ", "quand",
    "bilan", "charge", "course", "tache", "liste", "voyage", "lieu", "topo", "resa", "reserv", "salaire",
    "extra", "libelle", "balance", "aide", "agenda", "vacances", "mois", "doit", "reste", "mon ", "montre",
)
MOT_DEFAUT = "aide"  # une mention seule (« @bot ») : le bot montre ce qu'il sait faire, sans appeler le modèle

_RE_ESPACES = re.compile(r"[ \t]+")
# Réponses de la grammaire qui, à un message non adressé, ne sont que du bruit (« 50/50 » pris pour une
# charge, « Claudia prend les enfants » pour un ajustement, « moi je veux des pâtes ») : le bot se tait.
ACTIONS_MUETTES = frozenset({"erreur", "ambigu", "moi", "confirmation"})  # confirmation : « oui » sans attente

_DEBUT_PARASITE = ",:;"
_RE_NON_MOT = re.compile(r"[^\w\s]|_")


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
    - `attente_voyage` seulement si elle porte une échéance non dépassée (récap d'une résa lue dans un
      document, documents_voyage.py) ; celle d'un topo n'expire pas, rien ne prouve qu'elle soit valide.
    """
    if conversation.en_attente(etat, conversation.QUESTION):
        return True
    if conversation.verdict(texte) is None:
        return False
    if conversation.en_attente(etat, conversation.CONFIRMATION):
        return True
    voyage = etat.get("attente_voyage") or {}
    if "expire" in voyage and time.time() <= voyage["expire"]:
        return True
    copie = etat.get("attente")
    return bool(copie) and time.time() <= copie["expire"]


def _attendu(etats, msg, texte):
    etat = etats.get((msg.get("from") or {}).get("id"))
    return bool(etat) and etat.get(CLE_CHAT) == msg["chat"]["id"] and attente_en_cours(etat, texte)


def sans_suite_evident(texte):
    """Vrai si ce message de groupe, court et sans verbe d'action, n'a aucune chance de demander quoi que ce soit.

    Évite un appel au modèle pour chaque « ok » ou « mdr ». Sans lettre (émoji seul) : toujours vrai. Avec
    un chiffre, ou un radical de RADICAUX_ACTION, ou plus de MOTS_MAX_SANS_SUITE mots : faux, le modèle tranche.
    """
    mots = _RE_NON_MOT.sub(" ", normaliser(texte)).split()
    if not any(c.isalnum() for c in texte):
        return True
    if len(mots) > MOTS_MAX_SANS_SUITE or any(c.isdigit() for c in texte):
        return False
    phrase = " ".join(mots) + " "
    return not any(r in phrase for r in RADICAUX_ACTION)


def _piece_de_voyage_possible(msg):
    """Pièce non adressée qui peut être un document de voyage : un PDF, ou une photo/un document légendé
    (le bot.traiter_piece vérifie que la légende nomme un voyage). Une photo sans légende : ignorée."""
    pdf = (msg.get("document") or {}).get("mime_type") == "application/pdf"
    return pdf or bool((msg.get("caption") or "").strip())


def filtrer(msg, ident, etats):
    """(message à traiter, adressé). Message None = à ignorer en silence. Privé : (msg, True), inchangé.

    En groupe, la mention est retirée du texte. Un message non adressé n'est gardé que s'il est du texte.
    """
    if not est_groupe(msg.get("chat") or {}):
        return msg, True
    if ident is None:  # identité du bot inconnue : on ne sait pas reconnaître une mention, donc on se tait
        return None, False
    champ = "text" if "text" in msg else "caption"
    brut = msg.get(champ) or ""
    mentionne, propre = retirer_mention(brut, ident.username)
    adresse = mentionne or repond_au_bot(msg, ident.bot_id) or _attendu(etats, msg, brut)
    if not adresse:
        return (msg if champ == "text" or _piece_de_voyage_possible(msg) else None), False
    if champ not in msg:  # photo ou PDF sans légende, en réponse au bot
        return msg, True
    return {**msg, champ: propre or (MOT_DEFAUT if champ == "text" else "")}, True


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
            f"Pour me parler ici : écrivez votre demande comme en privé (écrivez @{username} ou répondez à l'un de mes messages pour être sûr que je réponde). "
            f"Je lis tout ce qui s'écrit ici : si je n'ai rien compris d'utile à un message qui ne m'est pas adressé, je me tais.")


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
