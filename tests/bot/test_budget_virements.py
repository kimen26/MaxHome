"""Tests d'intégration hors ligne : `valider`/`pas validé`/`dévalider` et `à virer` en passant
par le dispatch complet (bot.Bot.traiter_message), comme tests/bot/test_bot.py. Supabase mocké
par DonneesFausseLignes (tests/bot/mocks_lignes.py, superset du mock partagé mocks.py).
"""
import logging
from datetime import date

import bot as bot_mod
from mocks_lignes import DonneesFausseLignes

ANNEE, MOIS = date.today().year, date.today().month
TELEGRAM_ID = 6433455282

CHARGES = [
    {"id": 1, "libelle": "Électricité", "categorie": "Logement", "regle": "egales",
     "ponctuel": False, "actif": True},
    {"id": 2, "libelle": "Crédit immo", "categorie": "Logement", "regle": "egales",
     "ponctuel": False, "actif": True},
    {"id": 3, "libelle": "Vieil abonnement", "categorie": "Autre", "regle": "egales",
     "ponctuel": False, "actif": False},  # terminée (D-043)
]

COMPTES = [
    {"id": 1, "nom": "Commun", "commun": True, "iban": None},
    {"id": 2, "nom": "Caisse d'Épargne", "commun": False, "iban": "FR7630006000011234567890189"},
]

RECURRENT_CHARGE = {"id": 9, "titre": "Crédit immo → Caisse d'Épargne", "compte_de": 1, "compte_vers": 2,
                     "mode": "charge", "charge_id": 2, "montant_centimes": None, "prenom_part": None,
                     "qui": None, "jour": 5, "consigne": None, "ordre": 1, "actif": True}


def nouveau_bot(charges=None, comptes=None, recurrents=None, lignes=None):
    b = bot_mod.Bot.__new__(bot_mod.Bot)
    b.log = logging.getLogger("test-bot-virements")
    b.donnees = DonneesFausseLignes(charges=list(charges if charges is not None else CHARGES),
                                     comptes=list(comptes if comptes is not None else COMPTES),
                                     recurrents=recurrents if recurrents is not None else [])
    b.telegram = None
    b.charges = b.donnees.charges()
    b.membres = [m["prenom"] for m in b.donnees.membres()]
    b.etats = {}
    # Revenus posés pour éviter la proposition de copie de mois vide.
    b.donnees.maj_revenu(ANNEE, MOIS, "Yann", 612000)
    b.donnees.maj_revenu(ANNEE, MOIS, "Claudia", 454611)
    for cid, montant in (lignes or {}).items():
        b.donnees.maj_ligne(ANNEE, MOIS, cid, montant)
    return b


# ---------- valider pour soi / pour l'autre / prénom inconnu / sans montant / annuler / dévalider ----------
def test_valider_pour_soi_via_dispatch():
    b = nouveau_bot(lignes={1: -9000})
    rep = b.traiter_message(TELEGRAM_ID, "valider electricite")
    assert "validé pour Yann" in rep
    ligne = b.donnees.lignes_mois_validation(ANNEE, MOIS)[0]
    assert ligne["fait_par"] == "Yann"


def test_valider_pour_l_autre_via_dispatch():
    b = nouveau_bot(lignes={1: -9000})
    rep = b.traiter_message(TELEGRAM_ID, "valider electricite pour Claudia")
    assert "validé pour Claudia" in rep


def test_valider_prenom_inconnu_via_dispatch():
    b = nouveau_bot(lignes={1: -9000})
    rep = b.traiter_message(TELEGRAM_ID, "valider electricite pour Zorro")
    assert "inconnu" in rep.lower()


def test_valider_sans_montant_via_dispatch():
    b = nouveau_bot()
    rep = b.traiter_message(TELEGRAM_ID, "valider electricite")
    assert "Saisis d'abord le montant" in rep


def test_valider_puis_annuler_via_dispatch():
    b = nouveau_bot(lignes={1: -9000})
    b.traiter_message(TELEGRAM_ID, "valider electricite")
    rep = b.traiter_message(TELEGRAM_ID, "annuler")
    assert "annul" in rep.lower()
    ligne = b.donnees.lignes_mois_validation(ANNEE, MOIS)[0]
    assert ligne["fait_le"] is None and ligne["fait_par"] is None


def test_pas_valide_devalide_via_dispatch():
    b = nouveau_bot(lignes={1: -9000})
    b.traiter_message(TELEGRAM_ID, "valider electricite")
    rep = b.traiter_message(TELEGRAM_ID, "pas validé electricite")
    assert "annulée" in rep
    ligne = b.donnees.lignes_mois_validation(ANNEE, MOIS)[0]
    assert ligne["fait_le"] is None


def test_devalider_alias_via_dispatch():
    b = nouveau_bot(lignes={1: -9000})
    b.traiter_message(TELEGRAM_ID, "valider electricite")
    rep = b.traiter_message(TELEGRAM_ID, "dévalider electricite")
    assert "annulée" in rep


# ---------- fait sur un mouvement en mode 'charge' : valide aussi la ligne (§2 du brief) ----------
def test_fait_sur_mouvement_mode_charge_valide_la_ligne_liee():
    b = nouveau_bot(recurrents=[RECURRENT_CHARGE], lignes={2: -125000})
    b.donnees.creer_mouvements([{"annee": ANNEE, "mois": MOIS, "recurrent_id": 9,
                                 "titre": "Crédit immo → Caisse d'Épargne", "compte_de": 1,
                                 "compte_vers": 2, "montant_centimes": -125000, "qui": None}])
    b.traiter_message(TELEGRAM_ID, "fait credit immo")
    ligne = next(l for l in b.donnees.lignes_mois_validation(ANNEE, MOIS) if l["charge_id"] == 2)
    assert ligne["fait_le"] is not None, "l'app ne montre plus ce mouvement (D-046) : la ligne doit être validée aussi"
    assert ligne["fait_par"] == "Yann"


# ---------- charge terminée non proposée (D-043) ----------
def test_charge_terminee_non_proposee_par_valider():
    b = nouveau_bot(lignes={3: -1000})
    rep = b.traiter_message(TELEGRAM_ID, "valider vieil abonnement")
    assert "correspond" in rep.lower(), "une charge actif:false ne doit pas être trouvée par le fuzzy"


def test_charge_terminee_non_proposee_par_saisie_montant():
    b = nouveau_bot()
    rep = b.traiter_message(TELEGRAM_ID, "vieil abonnement 10")
    assert "correspond" in rep.lower()


# ---------- à virer : groupes, IBAN formaté, faits en dernier ----------
def test_a_virer_liste_les_groupes_avec_iban():
    b = nouveau_bot(recurrents=[RECURRENT_CHARGE], lignes={2: -125000})
    rep = b.traiter_message(TELEGRAM_ID, "a virer")
    assert "Caisse d'Épargne" in rep
    assert "FR76 3000 6000 0112 3456 7890 189" in rep
    assert "125,00" in rep or "1 250,00" in rep


def test_virements_alias_de_a_virer():
    b = nouveau_bot(recurrents=[RECURRENT_CHARGE], lignes={2: -125000})
    rep = b.traiter_message(TELEGRAM_ID, "virements")
    assert "Caisse d'Épargne" in rep


def test_a_virer_sans_rien_a_virer():
    b = nouveau_bot()
    rep = b.traiter_message(TELEGRAM_ID, "a virer")
    assert "aucun virement" in rep.lower()


def test_aide_mentionne_valider_et_a_virer():
    b = nouveau_bot()
    rep = b.traiter_message(TELEGRAM_ID, "aide")
    assert "valider <charge>" in rep
    assert "à virer" in rep
    assert "virements" in rep


def test_a_virer_range_les_faits_a_la_fin():
    b = nouveau_bot(recurrents=[RECURRENT_CHARGE], lignes={2: -125000})
    b.donnees.creer_mouvements([{"annee": ANNEE, "mois": MOIS, "recurrent_id": 9,
                                 "titre": "Crédit immo → Caisse d'Épargne", "compte_de": 1,
                                 "compte_vers": 2, "montant_centimes": -125000, "qui": None}])
    b.traiter_message(TELEGRAM_ID, "valider credit immo")
    rep = b.traiter_message(TELEGRAM_ID, "a virer")
    idx_faits = rep.index("Déjà faits")
    idx_ligne = rep.index("Caisse d'Épargne")
    assert idx_ligne > idx_faits, "un groupe entièrement validé apparaît sous « Déjà faits »"
