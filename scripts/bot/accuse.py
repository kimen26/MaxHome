"""Accusé de lecture et de réflexion : 👀 sur le message, « écrit… » tant que le bot travaille,
et une phrase courte si ça dure (L-059, L-060). Un échec d'accusé est journalisé, jamais bloquant.
"""
import contextlib
import logging
import threading
import time

EMOJI = "👀"
DELAI_FRAPPE_S = 4
DELAI_MESSAGE_S = 15
PHRASE_DEFAUT = "Je regarde…"
PHRASES = {
    "lire_ecole": "Je lis les mails de l'école…",
    "ecole_nouvelles": "Je lis les mails de l'école…",
    "lire_agenda": "Je regarde l'agenda…",
    "agenda_lire": "Je regarde l'agenda…",
    "lire_budget": "Je fais les comptes…",
    "question": "Je fais les comptes…",
    "web_recherche": "Je cherche sur internet…",
    "lire_courses": "Je regarde la liste de courses…",
    "lire_taches": "Je regarde les tâches…",
    "reflexion": "Je réfléchis…",
}

log = logging.getLogger("bot")  # le seul logger écrit dans data/bot.log


def _tenter(action):
    """Exécute un geste d'accusé ; toute erreur est journalisée (sans contenu) et avalée."""
    try:
        action()
    except Exception as exc:  # y compris AttributeError : client sans ces méthodes
        log.warning("accusé : geste impossible (%s)", type(exc).__name__)


class Suivi:
    """Gestionnaire de contexte : réaction, typing relancé, message « Je regarde… » passé le seuil."""

    def __init__(self, telegram, chat_id, message_id, delai_frappe=DELAI_FRAPPE_S,
                 delai_message=DELAI_MESSAGE_S, horloge=time.monotonic):
        self._telegram = telegram
        self._chat_id = chat_id
        self._message_id = message_id
        self._delai_frappe = delai_frappe
        self._delai_message = delai_message
        self._horloge = horloge
        self._phrase = PHRASE_DEFAUT
        self._message_envoye = False
        self._stop = threading.Event()
        self._fil = None

    def etape(self, cle):
        """Change la phrase qui sera dite si le traitement dure ; clé inconnue : phrase par défaut."""
        self._phrase = PHRASES.get(cle, PHRASE_DEFAUT)

    def _frapper(self):
        _tenter(lambda: self._telegram.signaler_frappe(self._chat_id))

    def _boucle(self, debut):
        while not self._stop.wait(self._delai_frappe):
            self._frapper()
            if not self._message_envoye and self._horloge() - debut >= self._delai_message:
                self._message_envoye = True
                _tenter(lambda: self._telegram.envoyer(self._chat_id, self._phrase))

    def __enter__(self):
        if self._message_id is not None:
            _tenter(lambda: self._telegram.reagir(self._chat_id, self._message_id, EMOJI))
        self._frapper()
        self._fil = threading.Thread(target=self._boucle, args=(self._horloge(),), daemon=True)
        self._fil.start()
        return self

    def __exit__(self, type_exc, exc, trace):
        self._stop.set()
        if self._fil is not None:
            self._fil.join(timeout=2)
        return False


@contextlib.contextmanager
def suivre(bot, msg):
    """Suit le traitement d'un message ; expose le suivi dans `bot.suivi` le temps du bloc."""
    with Suivi(bot.telegram, msg["chat"]["id"], msg.get("message_id")) as suivi:
        bot.suivi = suivi
        try:
            yield suivi
        finally:
            bot.suivi = None


def signaler(bot, cle):
    """Annonce l'étape en cours (appelée avant chaque lecture) ; ne lève jamais."""
    try:
        suivi = getattr(bot, "suivi", None)
        if suivi is not None:
            suivi.etape(cle)
    except Exception as exc:
        log.warning("accusé : étape non signalée (%s)", type(exc).__name__)
