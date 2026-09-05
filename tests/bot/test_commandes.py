"""Tests hors ligne de la grammaire déterministe (scripts/bot/commandes.py).

Aucun réseau : commandes.interpreter() est pur, testable directement.
"""
import commandes

PRENOMS = ["Yann", "Claudia"]
CHARGES = [
    {"id": 1, "libelle": "Impôts", "categorie": "Autre", "regle": "proport"},
    {"id": 2, "libelle": "Taxe foncière", "categorie": "Autre", "regle": "proport"},
    {"id": 3, "libelle": "Crédit", "categorie": "Logement", "regle": "egales"},
]
ANNEE, MOIS = 2026, 9


def interp(texte):
    return commandes.interpreter(texte, PRENOMS, CHARGES, ANNEE, MOIS)


def test_salaire_simple():
    a = interp("salaire 6120")
    assert a == {"action": "salaire", "prenom": None, "montant_centimes": 612000, "annee": ANNEE, "mois": MOIS}


def test_salaire_prenom():
    a = interp("salaire claudia 4300")
    assert a["action"] == "salaire"
    assert a["prenom"] == "Claudia"
    assert a["montant_centimes"] == 430000


def test_salaire_avec_virgule_et_espace():
    a = interp("salaire 4 300,50")
    assert a["montant_centimes"] == 430050


def test_charge_fuzzy_accents_et_casse():
    a = interp("IMPOTS 345")
    assert a["action"] == "charge"
    assert a["charge_id"] == 1
    assert a["montant_centimes"] == -34500


def test_charge_libelle_partiel_taxe_fonciere():
    a = interp("taxe fonciere 215")
    assert a["action"] == "charge"
    assert a["charge_id"] == 2
    assert a["montant_centimes"] == -21500


def test_charge_ambigue_sous_seuil():
    a = interp("kjqzxwvb 100")
    assert a["action"] == "ambigu"
    assert len(a["proches"]) <= 3


def test_charge_remboursement_positif():
    a = interp("rembours impots 100")
    assert a["action"] == "charge"
    assert a["montant_centimes"] == 10000


def test_extra_proport_par_defaut():
    a = interp("extra plaque de cuisson 150")
    assert a == {"action": "extra", "libelle": "plaque de cuisson", "montant_centimes": -15000,
                 "regle": "proport", "annee": ANNEE, "mois": MOIS}


def test_extra_egales():
    a = interp("extra volet 600 egales")
    assert a["regle"] == "egales"
    assert a["montant_centimes"] == -60000


def test_ajustement_prend():
    a = interp("yann prend 200 resto")
    assert a == {"action": "ajustement", "beneficiaire": "Yann", "montant_centimes": 20000,
                 "motif": "resto", "annee": ANNEE, "mois": MOIS}


def test_ajustement_mot_cle():
    a = interp("ajustement claudia 120 courses")
    assert a["action"] == "ajustement"
    assert a["beneficiaire"] == "Claudia"
    assert a["montant_centimes"] == 12000


def test_ajustement_prenom_inconnu():
    a = interp("marc prend 50 truc")
    assert a["action"] == "erreur"


def test_mois_suffixe_en_mois():
    a = interp("impots 345 en aout")
    assert a["annee"] == 2026 and a["mois"] == 8


def test_mois_suffixe_sans_en():
    a = interp("impots 345 aout 2026")
    assert a["annee"] == 2026 and a["mois"] == 8


def test_mois_suffixe_numerique():
    a = interp("impots 345 08/2026")
    assert a["annee"] == 2026 and a["mois"] == 8


def test_mois_defaut_est_mois_courant():
    a = interp("impots 345")
    assert a["annee"] == ANNEE and a["mois"] == MOIS


def test_bilan_charges_mois_aide():
    assert interp("bilan")["action"] == "bilan"
    assert interp("charges")["action"] == "charges"
    assert interp("mois")["action"] == "mois"
    assert interp("aide")["action"] == "aide"
    assert interp("?")["action"] == "aide"


def test_annuler():
    assert interp("annuler") == {"action": "annuler"}


def test_virement_fait_et_pas_fait():
    assert interp("fait") == {"action": "virement", "fait": True}
    assert interp("virement fait") == {"action": "virement", "fait": True}
    assert interp("pas fait") == {"action": "virement", "fait": False}


def test_montant_borne_basse_refusee():
    a = interp("salaire 0")
    assert a["action"] == "erreur"


def test_montant_borne_haute_refusee():
    a = interp("salaire 60000")
    assert a["action"] == "erreur"


def test_montant_borne_haute_acceptee_a_50000():
    a = interp("salaire 50000")
    assert a["action"] == "salaire"
    assert a["montant_centimes"] == 5000000


def test_texte_libre_non_matche_retourne_none():
    a = interp("bonjour comment vas-tu")
    assert a["action"] is None


def test_inscrire():
    a = interp("inscrire 123456 claudia")
    assert a == {"action": "inscrire", "telegram_id": 123456, "prenom": "Claudia"}


def test_moi():
    a = interp("moi claudia")
    assert a == {"action": "moi", "prenom": "Claudia"}


def test_meilleur_libelle_direct():
    charge, proches = commandes.meilleur_libelle("impots", CHARGES)
    assert charge["id"] == 1
    assert proches is None


def test_meilleur_libelle_sous_seuil_retourne_trois_proches():
    charge, proches = commandes.meilleur_libelle("zzzzzzzz", CHARGES)
    assert charge is None
    assert len(proches) == 3
