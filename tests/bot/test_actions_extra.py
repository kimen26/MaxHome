"""Action bot `extra` (charge ponctuelle créée par Telegram) — régression du bug où la ligne
était créée actif=False : invisible à l'écran Mois (ponctuelles() n'affiche que actif !== false,
cf. ui-mouvements.js/ui-extras.js) tout en comptant dans le total. L'app crée ses charges
ponctuelles avec actif=True (ponctuel suffit à ne pas la répéter, D-036 §4) ; le bot doit
s'aligner. Vérifie aussi que `type` est posé (charges.type reste NOT NULL en base, cf.
supabase/migrations/023_charges_type_defaut.sql qui lui donne un défaut/trigger côté serveur,
mais le bot ne doit pas en dépendre pour rester explicite).

Hors ligne : Supabase et Telegram sont des doublures (mocks.DonneesFausse).
"""
import bot as bot_mod
import pytest

from mocks import DonneesFausse

YANN = 6433455282


@pytest.fixture
def bot(monkeypatch):
    monkeypatch.setattr(bot_mod, "calculer", lambda *a, **k: {
        "aVerser": {"Yann": 0, "Claudia": 0}, "reste": {}, "totalCommun": 0,
        "ratio": {"Yann": 0.5, "Claudia": 0.5}, "parts": {}, "total": 0,
    })
    b = bot_mod.Bot.__new__(bot_mod.Bot)
    b.log = type("L", (), {"info": lambda *a: None, "exception": lambda *a: None})()
    b.donnees = DonneesFausse()
    b.charges = []
    b.membres = ["Yann", "Claudia"]
    b.etats = {}
    return b


def test_extra_cree_une_charge_active(bot):
    r = bot.traiter_message(YANN, "extra resto 25")
    assert "Extra resto" in r
    assert len(bot.donnees._charges) == 1
    c = bot.donnees._charges[0]
    assert c["ponctuel"] is True
    assert c["actif"] is True, "une charge ponctuelle inactive est invisible à l'écran Mois mais comptée dans le total"


def test_extra_pose_type_coherent_avec_regle(bot):
    bot.traiter_message(YANN, "extra resto 25")
    c = bot.donnees._charges[0]
    assert c["regle"] == "proport"
    assert c["type"] == c["regle"], "type doit rester cohérent avec regle (colonne héritée, encore NOT NULL en base)"


def test_extra_egales_pose_regle_et_type_egales(bot):
    bot.traiter_message(YANN, "extra resto 25 egales")
    c = bot.donnees._charges[0]
    assert c["regle"] == "egales"
    assert c["type"] == "egales"
