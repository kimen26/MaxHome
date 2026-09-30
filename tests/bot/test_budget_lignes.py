"""Tests hors ligne de scripts/bot/budget_lignes.py (D-046, D-048) : `valider`/`dévalider` une
ligne de charge, le lien avec le mouvement d'un récurrent en mode "charge", charges terminées
non proposées (D-043). Supabase mocké (DonneesFausseLignes, tests/bot/mocks_lignes.py).
"""
from mocks_lignes import DonneesFausseLignes

import budget_lignes

ANNEE, MOIS = 2026, 9
CHARGE = {"id": 1, "libelle": "Électricité", "categorie": "Logement", "ponctuel": False, "actif": True}
MEMBRES = ["Yann", "Claudia"]


def donnees_avec_ligne(montant=-9000, recurrents=None):
    d = DonneesFausseLignes(recurrents=recurrents if recurrents is not None else [])
    d.maj_ligne(ANNEE, MOIS, CHARGE["id"], montant)
    return d


# ---------- valider pour soi / pour l'autre / prénom inconnu / sans montant ----------
def test_valider_pour_soi():
    d = donnees_avec_ligne()
    texte, avant = budget_lignes.valider_ligne(d, ANNEE, MOIS, CHARGE, "Yann", True, MEMBRES)
    assert "validé pour Yann" in texte
    assert "✔" in texte
    ligne = d.lignes_mois_validation(ANNEE, MOIS)[0]
    assert ligne["fait_par"] == "Yann"
    assert ligne["fait_le"] is not None
    assert avant["ligne"] == {"fait_le": None, "fait_par": None}


def test_valider_pour_un_prenom_donne():
    d = donnees_avec_ligne()
    texte, _ = budget_lignes.valider_ligne(d, ANNEE, MOIS, CHARGE, "Claudia", True, MEMBRES)
    assert "validé pour Claudia" in texte
    ligne = d.lignes_mois_validation(ANNEE, MOIS)[0]
    assert ligne["fait_par"] == "Claudia"


def test_valider_prenom_inconnu_refuse_clairement():
    d = donnees_avec_ligne()
    texte, avant = budget_lignes.valider_ligne(d, ANNEE, MOIS, CHARGE, "Inconnu", True, MEMBRES)
    assert "inconnu" in texte.lower()
    assert avant is None
    ligne = d.lignes_mois_validation(ANNEE, MOIS)[0]
    assert ligne["fait_le"] is None, "rien n'a été écrit"


def test_valider_sans_montant_refuse_clairement():
    d = DonneesFausseLignes()  # aucune ligne saisie ce mois
    texte, avant = budget_lignes.valider_ligne(d, ANNEE, MOIS, CHARGE, "Yann", True, MEMBRES)
    assert "Saisis d'abord le montant" in texte
    assert avant is None


# ---------- annuler / dévalider ----------
def test_annuler_restaure_ligne():
    d = donnees_avec_ligne()
    _, avant = budget_lignes.valider_ligne(d, ANNEE, MOIS, CHARGE, "Yann", True, MEMBRES)
    budget_lignes.restaurer_validation(d, avant)
    ligne = d.lignes_mois_validation(ANNEE, MOIS)[0]
    assert ligne["fait_le"] is None and ligne["fait_par"] is None


def test_devalider_efface_fait_le_et_fait_par():
    d = donnees_avec_ligne()
    budget_lignes.valider_ligne(d, ANNEE, MOIS, CHARGE, "Yann", True, MEMBRES)
    texte, avant = budget_lignes.valider_ligne(d, ANNEE, MOIS, CHARGE, None, False, MEMBRES)
    assert "annulée" in texte
    ligne = d.lignes_mois_validation(ANNEE, MOIS)[0]
    assert ligne["fait_le"] is None and ligne["fait_par"] is None
    assert avant["ligne"]["fait_par"] == "Yann", "avant garde la trace pour re-annuler"


# ---------- lien avec le mouvement d'un récurrent en mode "charge" (D-046 §3) ----------
def _recurrent_charge():
    return [{"id": 9, "titre": "Électricité → Livret", "compte_de": 1, "compte_vers": 2,
             "mode": "charge", "charge_id": 1, "montant_centimes": None, "prenom_part": None,
             "qui": None, "jour": 5, "consigne": None, "ordre": 1, "actif": True}]


def test_valider_coche_aussi_le_mouvement_lie_montant_fige():
    d = donnees_avec_ligne(montant=-9000, recurrents=_recurrent_charge())
    m = d.creer_mouvements([{"annee": ANNEE, "mois": MOIS, "recurrent_id": 9, "titre": "Électricité → Livret",
                             "compte_de": 1, "compte_vers": 2, "montant_centimes": -9000, "qui": None}])[0]
    _, _ = budget_lignes.valider_ligne(d, ANNEE, MOIS, CHARGE, "Yann", True, MEMBRES)
    mouvement = d.maj_mouvement(m["id"], {})  # relit sans rien changer
    assert mouvement["fait_le"] is not None
    assert mouvement["fait_par"] == "Yann"
    assert mouvement["montant_centimes"] == -9000, "montant figé à la première coche"


def test_valider_puis_changement_recalcule_pas_montant_deja_fige():
    """Deuxième bascule (dévalider) : le montant du mouvement reste celui figé à la 1re coche,
    jamais recalculé — même règle que coche-ligne.js::champsMouvementLie."""
    d = donnees_avec_ligne(montant=-9000, recurrents=_recurrent_charge())
    m = d.creer_mouvements([{"annee": ANNEE, "mois": MOIS, "recurrent_id": 9, "titre": "Électricité → Livret",
                             "compte_de": 1, "compte_vers": 2, "montant_centimes": -9000, "qui": None}])[0]
    budget_lignes.valider_ligne(d, ANNEE, MOIS, CHARGE, "Yann", True, MEMBRES)
    # Le montant théorique change en base (simulateur d'un mois où la charge aurait varié) :
    # une dévalidation puis revalidation ne doit PAS aller le rechercher, il reste figé.
    d.maj_mouvement(m["id"], {"montant_centimes": -9000})
    budget_lignes.valider_ligne(d, ANNEE, MOIS, CHARGE, None, False, MEMBRES)
    texte, _ = budget_lignes.valider_ligne(d, ANNEE, MOIS, CHARGE, "Claudia", True, MEMBRES)
    assert "Claudia" in texte
    mouvement = d.maj_mouvement(m["id"], {})
    assert mouvement["montant_centimes"] == -9000


def test_annuler_restaure_aussi_le_mouvement_lie():
    d = donnees_avec_ligne(montant=-9000, recurrents=_recurrent_charge())
    m = d.creer_mouvements([{"annee": ANNEE, "mois": MOIS, "recurrent_id": 9, "titre": "Électricité → Livret",
                             "compte_de": 1, "compte_vers": 2, "montant_centimes": -9000, "qui": None}])[0]
    _, avant = budget_lignes.valider_ligne(d, ANNEE, MOIS, CHARGE, "Yann", True, MEMBRES)
    budget_lignes.restaurer_validation(d, avant)
    mouvement = d.maj_mouvement(m["id"], {})
    assert mouvement["fait_le"] is None and mouvement["fait_par"] is None


# ---------- D-043 : charge terminée non proposée ----------
def test_charges_actives_exclut_les_terminees():
    charges = [CHARGE, {"id": 2, "libelle": "Ancien abonnement", "actif": False, "ponctuel": False}]
    actives = budget_lignes.charges_actives(charges)
    assert [c["id"] for c in actives] == [1]
