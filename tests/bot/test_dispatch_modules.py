"""Dispatch du bot sur les modules Tâches et Courses : grammaire, écriture, annulation.

Hors ligne : Supabase et Telegram sont des doublures, `calculer` est neutralisé quand la
réponse ne dépend pas du budget (les tâches et les courses ne consultent aucun montant).
"""
import commandes
import pytest

from mocks import DonneesFausse

YANN = 6433455282


@pytest.fixture
def bot(monkeypatch):
    """Bot réel, données en mémoire, sans réseau ni node."""
    import bot as bot_mod
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


# ---------- grammaire ----------
@pytest.mark.parametrize("texte, attendu", [
    ("taches", "taches"), ("Tâches", "taches"), ("todo", "taches"),
    ("balance", "balance"), ("balance 30", "balance"), ("balance 30 jours", "balance"),
    ("courses", "courses_liste"), ("liste", "courses_liste"),
    ("ajoute lait", "course_ajout"), ("ajouter du pain", "course_ajout"),
])
def test_grammaire_reconnait_les_modules(texte, attendu):
    a = commandes.interpreter(texte, ["Yann", "Claudia"], [], 2026, 9)
    assert a["action"] == attendu


def test_balance_borne_le_nombre_de_jours():
    assert commandes.interpreter("balance 999", [], [], 2026, 9)["jours"] == 365
    assert commandes.interpreter("balance 0", [], [], 2026, 9)["jours"] == 1


def test_ajoute_refuse_un_libelle_trop_long():
    a = commandes.interpreter("ajoute " + "x" * 100, [], [], 2026, 9)
    assert a["action"] == "erreur"


# ---------- tâches ----------
def test_taches_liste_les_restantes(bot):
    r = bot.traiter_message(YANN, "taches")
    assert "À faire aujourd'hui" in r
    assert "Laver les biberons" in r


def test_fait_titre_de_tache_coche_une_tache_pas_un_virement(bot):
    r = bot.traiter_message(YANN, "fait biberons")
    assert "fait par Yann" in r and "+1 part" in r
    faites = [t for t in bot.donnees.taches(depuis="2026-01-01") if t["fait_le"]]
    assert len(faites) == 1 and faites[0]["qui"] == "Yann"
    assert not any(m["fait_le"] for m in bot.donnees._mouvements), "aucun virement touché"


def test_fait_a_deux_credite_les_deux_membres(bot):
    r = bot.traiter_message(YANN, "fait linge a deux")
    assert "fait par Yann" in r
    faites = [t for t in bot.donnees.taches(depuis="2026-01-01") if t["fait_le"]]
    assert len(faites) == 1
    assert faites[0]["qui"] == "Yann" and faites[0]["qui2"] == "Claudia"


def test_fait_sans_titre_vise_toujours_le_virement(bot):
    """Sans titre on ne devine pas : c'est le virement au commun, jamais une tâche au hasard."""
    r = bot.traiter_message(YANN, "fait")
    assert "Virement au commun" in r
    assert not any(t["fait_le"] for t in bot.donnees.taches(depuis="2026-01-01"))


def test_annuler_apres_une_tache_remet_les_parts_a_zero(bot):
    bot.traiter_message(YANN, "fait biberons")
    assert bot.traiter_message(YANN, "annuler") == "Dernière écriture annulée."
    taches = bot.donnees.taches(depuis="2026-01-01")
    assert all(t["fait_le"] is None and t["parts_quart"] == 0 for t in taches)


def test_balance_apres_une_coche(bot):
    bot.traiter_message(YANN, "fait linge")   # 20 quarts = 5 parts
    r = bot.traiter_message(YANN, "balance")
    assert "Balance sur 7 jours" in r
    assert "Yann : 100 %" in r and "5 parts" in r


def test_balance_vide_ne_divise_pas_par_zero(bot):
    r = bot.traiter_message(YANN, "balance")
    assert "50 %" in r and "Aucune tâche cochée" in r


# ---------- courses ----------
def test_ajoute_puis_liste_puis_annule(bot):
    r = bot.traiter_message(YANN, "ajoute lait")
    assert "lait" in r
    assert "lait" in bot.traiter_message(YANN, "courses")
    assert bot.traiter_message(YANN, "annuler") == "Dernière écriture annulée."
    assert bot.donnees.courses() == [], "l'article ajouté a bien été retiré"


def test_liste_de_courses_vide(bot):
    assert bot.traiter_message(YANN, "courses") == "Liste de courses vide."


# ---------- langage libre : toutes les actions annoncées sont traduites ----------
@pytest.mark.parametrize("interp, action_attendue", [
    ({"action": "tache_faite", "titre": "biberons", "fait": True}, "mouvement"),
    ({"action": "mouvement_fait", "titre": None, "fait": True}, "mouvement"),
    ({"action": "taches"}, "taches"),
    ({"action": "balance", "jours": 30}, "balance"),
    ({"action": "course_ajout", "libelle": "lait"}, "course_ajout"),
    ({"action": "courses_liste"}, "courses_liste"),
    ({"action": "bilan", "mois": None}, "bilan"),
    ({"action": "charges", "mois": None}, "charges"),
])
def test_langage_libre_traduit_ce_qu_il_annonce(bot, interp, action_attendue):
    """Le prompt de libre.py annonce ces actions : chacune doit avoir sa traduction."""
    assert bot._traduire_action_libre(interp, 2026, 9)["action"] == action_attendue


def test_langage_libre_action_inventee_donne_une_erreur_lisible(bot):
    r = bot._traduire_action_libre({"action": "lancer_une_fusee"}, 2026, 9)
    assert r["action"] == "erreur" and "non prise en charge" in r["message"]
