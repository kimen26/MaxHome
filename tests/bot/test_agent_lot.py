"""Tests hors ligne des écritures groupées (agent_lot) : agenda et modèle simulés, jamais Google ni claude."""
from types import SimpleNamespace

import pytest

import agenda_bot
import agent_lot
import conversation
import dialogue_libre
import outils
import reponses
from outils import agenda, registre

JOUR = "2026-12-05"


@pytest.fixture
def agenda_faux(monkeypatch):
    """Registre d'agenda simulé : note les créations, `existants` = ce que l'agenda contient déjà."""
    avant = dict(registre._OUTILS)
    creations, existants = [], []
    registre.inscrire(agenda.NOM_LIRE, registre.LECTURE, lambda *a, **k: [], agenda.CHEMINS_AUTORISES)
    registre.inscrire(agenda.NOM_CREER, registre.ECRITURE, lambda **saisie: creations.append(saisie) or "Ajouté.")
    registre.inscrire(agenda.NOM_MODIFIER, registre.ECRITURE, lambda **s: "modifié")
    registre.inscrire(agenda.NOM_SUPPRIMER, registre.ECRITURE, lambda **s: "supprimé")
    monkeypatch.setattr(agenda_bot, "lire_periode", lambda debut, fin: existants)
    yield SimpleNamespace(creations=creations, existants=existants)
    registre._OUTILS.clear()
    registre._OUTILS.update(avant)


@pytest.fixture
def bot():
    def executer(telegram_id, prenom, action, texte):
        return outils.confirmer(action) if action["action"] == outils.ACTION_ECRITURE else "autre"
    return SimpleNamespace(etats={}, executer_action=executer)


def rdv(titre, debut=JOUR, **plus):
    return {"action": "agenda_creer", "titre": titre, "debut": debut, "fin": None, "heure_debut": "09:00",
            "heure_fin": "10:00", "personne": "Max", **plus}


def proposer(bot, liste, apres_tiers=False, etat=None):
    etat = bot.etats.setdefault(1, {}) if etat is None else etat
    return proposer_dans(bot, etat, liste, apres_tiers)


def proposer_dans(bot, etat, liste, apres_tiers=False):
    return agent_lot.proposer(bot, etat, 1, "Yann", "texte", liste, dialogue_libre._suite, 2026, 11,
                              apres_tiers=apres_tiers)


# ---------- AC1 ----------
def test_trois_rdv_un_seul_message_numerote_une_seule_confirmation(bot, agenda_faux):
    etat = bot.etats.setdefault(1, {})
    rep = proposer_dans(bot, etat, [rdv("Piscine"), rdv("Dentiste", "2026-12-06"), rdv("Judo", "2026-12-07")])
    lignes = rep.split("\n")
    assert lignes[0] == "Je propose :"
    assert [ligne[:3] for ligne in lignes[1:4]] == ["1. ", "2. ", "3. "]
    assert lignes[-1] == "OK pour tout ?" and "OK ?" not in rep
    assert len(conversation.en_attente(etat, conversation.CONFIRMATION)["action"]["actions"]) == 3
    assert agenda_faux.creations == []


def test_oui_execute_les_trois_par_le_registre_et_les_liste(bot, agenda_faux):
    proposer(bot, [rdv("Piscine"), rdv("Dentiste", "2026-12-06"), rdv("Judo", "2026-12-07")])
    rep = dialogue_libre.reprendre(bot, 1, "Yann", "oui")
    assert [c["titre"] for c in agenda_faux.creations] == ["Piscine", "Dentiste", "Judo"]
    assert rep == "1. Ajouté.\n2. Ajouté.\n3. Ajouté."
    assert conversation.en_attente(bot.etats[1], conversation.CONFIRMATION) is None


def test_non_ne_fait_rien(bot, agenda_faux):
    proposer(bot, [rdv("Piscine"), rdv("Judo", "2026-12-07")])
    assert dialogue_libre.reprendre(bot, 1, "Yann", "non") == "OK, rien fait."
    assert agenda_faux.creations == []


def test_une_erreur_n_arrete_pas_les_suivantes(bot, agenda_faux):
    lot = {"action": agent_lot.ACTION, "actions": [{"action": "a"}, {"action": "b"}], "recaps": []}
    bot.executer_action = lambda t, p, a, texte: "Erreur interne, réessaie." if a["action"] == "a" else "fait"
    assert agent_lot.executer(bot, 1, "Yann", lot, "oui") == "1. Erreur interne, réessaie.\n2. fait"


# ---------- AC2 ----------
def test_un_doublon_est_ecarte_et_annonce(bot, agenda_faux):
    agenda_faux.existants.append({"titre": "Piscine Max", "debut": JOUR, "heure_debut": "09:00"})
    rep = proposer(bot, [rdv("Piscine"), rdv("Judo", "2026-12-07"), rdv("Dentiste", "2026-12-08")])
    assert "déjà dans l'agenda" in rep and "« Piscine »" in rep
    assert len(bot.etats[1][conversation.CONFIRMATION]["action"]["actions"]) == 2


def test_un_element_invalide_est_annonce_sans_bloquer_les_autres(bot, agenda_faux):
    rep = proposer(bot, [rdv("Piscine"), rdv("Judo", "2026-13-45"), rdv("Dentiste", "2026-12-08")])
    assert "La date de début n'existe pas" in rep
    assert rep.startswith("Je propose :") and rep.endswith("OK pour tout ?")
    assert len(bot.etats[1][conversation.CONFIRMATION]["action"]["actions"]) == 2


def test_aucun_element_valide_pas_de_confirmation(bot, agenda_faux):
    rep = proposer(bot, [rdv("Piscine", "2026-13-45"), rdv("Judo", "pas une date")])
    assert rep.count("La date de début n'existe pas") == 2
    assert conversation.CONFIRMATION not in bot.etats[1]


def test_lecture_de_l_agenda_ratee_pas_de_filtre(bot, agenda_faux, monkeypatch):
    def casse(debut, fin):
        raise agenda.ErreurAgenda("panne")
    monkeypatch.setattr(agenda_bot, "lire_periode", casse)
    assert proposer(bot, [rdv("Piscine"), rdv("Judo", "2026-12-07")]).startswith("Je propose :")


# ---------- AC3 ----------
def test_une_action_hors_liste_est_refusee(bot, agenda_faux):
    for nom in ("ecole_message", "proche_echange", "valider_x"):
        bot.etats.clear()
        rep = proposer(bot, [{"action": nom}])
        assert f"« {nom} »" in rep and conversation.CONFIRMATION not in bot.etats[1]


def test_apres_une_lecture_tiers_seuls_agenda_creer_et_course_ajout(bot, agenda_faux):
    rep = proposer(bot, [{"action": "valider", "charge": "Crèche"}, {"action": "agenda_supprimer", "cherche": "x"}],
                   apres_tiers=True)
    assert "« valider »" in rep and "« agenda_supprimer »" in rep and conversation.CONFIRMATION not in bot.etats[1]
    assert proposer(bot, [rdv("A"), rdv("B", "2026-12-06")], apres_tiers=True).startswith("Je propose :")


def test_au_plus_huit_elements(bot, agenda_faux):
    liste = [rdv(f"Sortie {i}", f"2026-12-{i + 1:02d}") for i in range(1, 11)]
    rep = proposer(bot, liste)
    assert len(bot.etats[1][conversation.CONFIRMATION]["action"]["actions"]) == agent_lot.LOT_MAX == 8
    assert rep.count("Au plus 8 à la fois") == 2


def test_un_seul_element_valide_rend_la_proposition_simple(bot, agenda_faux):
    simple_etat = {}
    attendu = dialogue_libre._suite(bot, simple_etat, 1, "Yann", "texte", rdv("Piscine"), 2026, 11)
    rep = proposer(bot, [rdv("Piscine")])
    assert rep == attendu and rep.endswith(" OK ?")
    assert bot.etats[1][conversation.CONFIRMATION]["action"] == simple_etat[conversation.CONFIRMATION]["action"]
    assert reponses.non_compris() not in rep
