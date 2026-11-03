"""Une longue demande au bot ne doit pas être lue comme une commande courte, et une demande de
recherche sur internet (hors de portée du bot : L-057, aucun outil) est reconnue et notée.

Bug réel (prod, 03/11) : dans le groupe, une phrase de ~120 mots avec un lien et « 2 adulte » a
été prise par le dernier recours grammatical pour « <libellé de charge> <montant> » et le bot a
répondu « Aucune charge ne correspond assez à « …toute la phrase… » ».

Fixtures (bot, modèle bouchonné, évolution redirigée vers tmp_path) : celles de test_dialogue_libre.py.
"""
import re

import pytest

import commandes
import dialogue_libre
import evolution
import libre
import reponses
from test_dialogue_libre import ANNEE, CHARGES, CLAUDIA, MOIS, YANN, bot, isole, modele  # noqa: F401

PRENOMS = ["Yann", "Claudia"]
LIEN = "https://www.sowell.fr/hotel"
# Raccourci du message réel (~60 mots), mais avec le lien et le « 2 adulte » qui ont trompé la grammaire.
TEXTE_LONG = (
    "salut, avec Claudia on pense partir au ski cet hiver, tu peux regarder pour le ski "
    f"{LIEN} 2 adulte un enfant de six ans, en pension complète si possible, pas trop loin "
    "des pistes, avec piscine ou spa, compare-moi les stations selon notre budget "
    "et fais-moi des fiches pour chaque offre avec le prix, les dates et ce qui est inclus"
)
TEXTE_VOYAGE_LONG = f"voyage tu peux regarder pour le ski {LIEN} 2 adulte un enfant"
REPONSE_RECHERCHE = ("Je ne navigue pas sur internet moi-même. J'ai noté la recherche : Claude la fera "
                     "lors de la prochaine session de Yann, et la réponse arrivera ici.")


def grammaire(texte):
    return commandes.interpreter(texte, PRENOMS, CHARGES, ANNEE, MOIS)


# ---------- correctif 1 : une longue phrase n'est pas une commande ----------
def test_la_grammaire_prend_toujours_la_longue_phrase_pour_une_charge_ambigue():
    """Précondition : c'est bien le dernier recours grammatical qui se trompe ; le relais le rattrape."""
    assert grammaire(TEXTE_LONG)["action"] == "ambigu"
    assert len(TEXTE_LONG.split()) > 50


def test_la_longue_demande_avec_lien_est_relayee_au_langage_libre(bot, modele):
    faux = modele({"action": "inconnu"})
    rep = bot.traiter_message(YANN, TEXTE_LONG)
    assert len(faux.appels) == 1 and faux.appels[0]["message"] == TEXTE_LONG
    assert "Aucune charge ne correspond" not in rep
    assert rep == reponses.non_compris()


def test_voyage_suivi_d_une_longue_phrase_est_relaye(bot, modele):
    assert grammaire(TEXTE_VOYAGE_LONG)["action"] == "voyage"
    faux = modele({"action": "inconnu"})
    rep = bot.traiter_message(YANN, TEXTE_VOYAGE_LONG)
    assert len(faux.appels) == 1
    assert rep == reponses.non_compris()


@pytest.mark.parametrize("texte, attendu", [
    ("crédit 850", "charge"),
    ("crèche 45,20", "charge"),
    ("voyage Malaga", "voyage"),
    ("voyage Test bot ZZZ", "voyage"),
    ("ajoute lait", "course_ajout"),
    ("resa vol Paris Malaga 120", "resa_libre"),
])
def test_une_commande_courte_n_est_pas_relayee(texte, attendu):
    action = grammaire(texte)
    assert action["action"] == attendu
    assert dialogue_libre.relayer(action, texte) is False


def test_une_confirmation_de_resa_collee_reste_sur_son_chemin():
    texte = "reservation " + "mot " * 80 + f"{LIEN} 2 adultes"
    action = grammaire(texte)
    assert action["action"] == "resa_libre"
    assert dialogue_libre.relayer(action, texte) is False


def test_ajoute_lait_reste_une_course_sans_appeler_le_modele(bot, modele):
    faux = modele()
    rep = bot.traiter_message(YANN, "ajoute lait")
    assert faux.appels == []
    assert "lait" in rep.lower()


# ---------- correctif 2 : une recherche sur internet est notée, pas improvisée ----------
def test_le_prompt_du_langage_libre_connait_la_recherche():
    prompt = libre.construire_prompt("trouve-moi des hôtels", "Yann", PRENOMS, ["Crédit"], "2026-11")
    assert '"action":"recherche"' in prompt
    assert '"demande_evolution"' in prompt, "la recherche s'ajoute à l'évolution, elle ne la remplace pas"


def test_une_recherche_est_notee_avec_son_etiquette_et_yann_est_prevenu_si_claudia(bot, modele):
    resume = f"Comparer les offres d'hôtel au ski sur {LIEN}, 2 adultes et un enfant, une fiche par offre"
    modele({"action": "recherche", "texte": resume})
    rep = bot.traiter_message(CLAUDIA, "trouve-moi des hôtels pour le ski et compare les stations")
    assert rep == REPONSE_RECHERCHE
    ligne = evolution.FICHIER.read_text(encoding="utf-8").splitlines()[-1]
    assert re.fullmatch(r"- \d{4}-\d\d-\d\d \d\d:\d\d — Claudia \[Recherche\] : .+", ligne)
    assert ligne.endswith(resume)
    assert bot.telegram.envoyes == [(YANN, f"Recherche de Claudia pour MaxHome : {resume}")]


def test_une_recherche_de_yann_ne_previent_personne(bot, modele):
    modele({"action": "recherche", "texte": "Surveiller les prix des vols Paris-Malaga"})
    assert bot.traiter_message(YANN, "regarde ce site pour les vols") == REPONSE_RECHERCHE
    assert "Yann [Recherche] : Surveiller les prix des vols Paris-Malaga" in evolution.FICHIER.read_text(encoding="utf-8")
    assert bot.telegram.envoyes == []


def test_la_longue_demande_de_recherche_va_jusqu_a_la_note(bot, modele):
    """Bout en bout : la phrase du bug, relayée, reconnue comme recherche, notée."""
    modele({"action": "recherche", "texte": f"Fiches des offres de ski sur {LIEN}, 2 adultes un enfant"})
    assert bot.traiter_message(YANN, TEXTE_LONG) == REPONSE_RECHERCHE
    assert evolution.FICHIER.read_text(encoding="utf-8").splitlines()[-1].endswith(
        f"Yann [Recherche] : Fiches des offres de ski sur {LIEN}, 2 adultes un enfant")


def test_une_evolution_garde_son_format_et_sa_reponse(bot, modele):
    modele({"action": "demande_evolution", "texte": "Renommer l'onglet Courses"})
    assert bot.traiter_message(YANN, "change le nom de l'onglet Courses") == "Noté pour Yann."
    ligne = evolution.FICHIER.read_text(encoding="utf-8").splitlines()[-1]
    assert re.fullmatch(r"- \d{4}-\d\d-\d\d \d\d:\d\d — Yann : Renommer l'onglet Courses", ligne)
