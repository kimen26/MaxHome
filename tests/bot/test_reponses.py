"""Tests hors ligne du formatage (scripts/bot/reponses.py)."""
import reponses


def test_normaliser_accents_et_casse():
    assert reponses.normaliser("Impôts") == "impots"
    assert reponses.normaliser("Août") == "aout"
    assert reponses.normaliser("ÉGALES") == "egales"


def test_euros_positif():
    assert reponses.euros(612000) == "6 120,00 €"


def test_euros_negatif():
    assert reponses.euros(-323616) == "-3 236,16 €"


def test_euros_zero():
    assert reponses.euros(0) == "0,00 €"


def test_nom_mois():
    assert reponses.nom_mois(2026, 2) == "février 2026"
    assert reponses.nom_mois(2026, 8) == "août 2026"


def test_confirmation_ecriture():
    txt = reponses.confirmation_ecriture("Salaire Yann", 612000, 2026, 9)
    assert txt == "Salaire Yann septembre 2026 : 6 120,00 € ✔"


def test_confirmation_ajustement_avec_motif():
    txt = reponses.confirmation_ajustement("Yann", "Claudia", 20000, "resto")
    assert txt == "Yann prend 200,00 € en plus : Claudia verse 200,00 € de moins (resto)"


def test_confirmation_ajustement_sans_motif():
    txt = reponses.confirmation_ajustement("Yann", "Claudia", 20000, "")
    assert "resto" not in txt
    assert txt.startswith("Yann prend 200,00 € en plus")


def test_proposer_copie():
    txt = reponses.proposer_copie("septembre 2026", "août 2026")
    assert txt == "Septembre 2026 est vide. Démarrer depuis août 2026 ? oui/non"


def test_inconnu_et_non_compris():
    assert "inscrire" in reponses.inconnu().lower() or "connais" in reponses.inconnu().lower()
    assert "aide" in reponses.non_compris().lower()


def test_liste_charges_vide():
    assert reponses.liste_charges([], {}) == "Aucune charge ce mois."


def test_parts_texte_virgule_francaise_sans_zero_inutile():
    assert reponses.parts_texte(2) == "0,5"
    assert reponses.parts_texte(4) == "1"
    assert reponses.parts_texte(6) == "1,5"
    assert reponses.parts_texte(32) == "8"


def test_parts_mot_pluriel_a_partir_de_2_parts():
    assert reponses.parts_mot(2) == "0,5 part"
    assert reponses.parts_mot(4) == "1 part"
    assert reponses.parts_mot(6) == "1,5 part", "1,5 reste au singulier en français"
    assert reponses.parts_mot(8) == "2 parts"


def test_balance_taches_affiche_la_ligne_obligatoire():
    b = {"ratio": {"Yann": 0.4, "Claudia": 0.6}, "parts": {"Yann": 8, "Claudia": 12},
         "nombre": {"Yann": 2, "Claudia": 3}, "total": 20}
    txt = reponses.balance_taches(b, ["Yann", "Claudia"], 7, obligatoire={"Yann": 0.42, "Claudia": 0.58})
    assert "Obligatoire · Claudia en assure 58 %" in txt
