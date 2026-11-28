"""Tests hors ligne de l'accusé de lecture et de réflexion (accuse.py) : aucun vrai Telegram, délais injectés."""
import logging
import time
from types import SimpleNamespace

import accuse
import boucle_bot


class TelegramEspion:
    def __init__(self, echec=None):
        self.appels = []
        self.echec = echec

    def reagir(self, chat_id, message_id, emoji):
        if self.echec:
            raise self.echec
        self.appels.append(("reagir", chat_id, message_id, emoji))

    def signaler_frappe(self, chat_id):
        if self.echec:
            raise self.echec
        self.appels.append(("frappe", chat_id))

    def envoyer(self, chat_id, texte):
        self.appels.append(("envoyer", chat_id, texte))

    def noms(self, nom):
        return [a for a in self.appels if a[0] == nom]


def attendre(condition, delai=2):
    fin = time.monotonic() + delai
    while time.monotonic() < fin and not condition():
        time.sleep(0.005)
    return condition()


def test_reaction_et_typing_relance():
    tg = TelegramEspion()
    with accuse.Suivi(tg, 5, 77, delai_frappe=0.01, delai_message=99):
        assert tg.appels[0] == ("reagir", 5, 77, "👀")
        assert tg.appels[1] == ("frappe", 5)
        assert attendre(lambda: len(tg.noms("frappe")) >= 3)
    assert tg.noms("envoyer") == []


def test_message_une_seule_fois_apres_le_seuil_avec_la_phrase_de_l_etape():
    tg = TelegramEspion()
    t = {"v": 0.0}
    with accuse.Suivi(tg, 5, 77, delai_frappe=0.01, delai_message=15, horloge=lambda: t["v"]) as s:
        assert attendre(lambda: len(tg.noms("frappe")) >= 3)
        assert tg.noms("envoyer") == []  # seuil pas atteint
        s.etape("lire_agenda")
        t["v"] = 16.0
        assert attendre(lambda: tg.noms("envoyer"))
        assert attendre(lambda: len(tg.noms("frappe")) >= 6)
    assert tg.noms("envoyer") == [("envoyer", 5, "Je regarde l'agenda…")]


def test_phrase_par_defaut():
    tg = TelegramEspion()
    t = {"v": 0.0}
    with accuse.Suivi(tg, 5, 77, delai_frappe=0.01, delai_message=1, horloge=lambda: t["v"]) as s:
        s.etape("inconnue")
        t["v"] = 2.0
        assert attendre(lambda: tg.noms("envoyer"))
    assert tg.noms("envoyer")[0][2] == accuse.PHRASE_DEFAUT


def test_echec_telegram_avale_et_journalise(caplog):
    tg = TelegramEspion(echec=RuntimeError("boum"))
    execute = []
    with caplog.at_level(logging.WARNING, logger="bot"):
        with accuse.Suivi(tg, 5, 77, delai_frappe=0.01, delai_message=99):
            execute.append(True)
    assert execute
    assert "geste impossible (RuntimeError)" in caplog.text
    assert "boum" not in caplog.text


def test_client_sans_methodes_tolere():
    tg = SimpleNamespace()
    with accuse.Suivi(tg, 5, 77, delai_frappe=0.01, delai_message=99):
        pass


def test_exception_du_bloc_non_masquee():
    tg = TelegramEspion()
    try:
        with accuse.Suivi(tg, 5, 77, delai_frappe=0.01, delai_message=99):
            raise ValueError("x")
    except ValueError:
        return
    raise AssertionError("exception masquée")


def test_suivre_pose_et_retire_bot_suivi_et_signaler():
    tg = TelegramEspion()
    bot = SimpleNamespace(telegram=tg)
    msg = {"chat": {"id": 5}, "message_id": 9}
    accuse.signaler(bot, "reflexion")  # sans suivi : ne lève pas
    with accuse.suivre(bot, msg):
        assert bot.suivi is not None
        accuse.signaler(bot, "reflexion")
        assert bot.suivi._phrase == "Je réfléchis…"
    assert bot.suivi is None
    assert tg.noms("reagir") == [("reagir", 5, 9, "👀")]


def test_message_sans_id_pas_de_reaction():
    tg = TelegramEspion()
    with accuse.suivre(SimpleNamespace(telegram=tg), {"chat": {"id": 5}}):
        pass
    assert tg.noms("reagir") == []
    assert tg.noms("frappe")


def test_boucle_bot_accuse_le_message_puis_repond():
    tg = TelegramEspion()
    log = logging.getLogger("test")
    bot = SimpleNamespace(
        telegram=tg, log=log, identite=None, etats={},
        traiter_message=lambda tid, texte: "ok")
    u = {"update_id": 1, "message": {"message_id": 3, "chat": {"id": 5, "type": "private"},
                                       "from": {"id": 5}, "text": "salut"}}
    boucle_bot.traiter_update(bot, u)
    assert tg.noms("reagir") == [("reagir", 5, 3, "👀")]
    assert tg.noms("envoyer")[-1] == ("envoyer", 5, "ok")
