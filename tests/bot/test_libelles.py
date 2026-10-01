"""Libellé de virement (D-050) côté bot : affichage dans `à virer` et commande
`libellé <charge|compte> <texte>` / `libelle`. Passe par le dispatch complet
(bot.Bot.traiter_message, comme test_budget_virements.py) ; `à virer` appelle pour de vrai
virements_cli.mjs (node), confrontation JS/Python (L-014) — pas de réécriture de la règle ici.
Exemples factices (invariant 1) : comptes « Syndic » (libellé fixe) et « École » (variable).
"""
import logging
from datetime import date

import bot as bot_mod
from mocks_lignes import DonneesFausseLignes

ANNEE, MOIS = date.today().year, date.today().month
TELEGRAM_ID = 6433455282

CHARGES = [
    {"id": 1, "libelle": "Copropriété", "categorie": "Logement", "regle": "egales",
     "ponctuel": False, "actif": True},
    {"id": 2, "libelle": "École", "categorie": "Enfant", "regle": "egales",
     "ponctuel": False, "actif": True},
]

COMPTES = [
    {"id": 1, "nom": "Commun", "commun": True, "iban": None,
     "libelle_virement": None, "libelle_variable": False},
    {"id": 2, "nom": "Syndic", "commun": False, "iban": None,
     "libelle_virement": "CL-0001", "libelle_variable": False},
    {"id": 3, "nom": "École Max", "commun": False, "iban": None,
     "libelle_virement": "Enfant Dupont Facture n°", "libelle_variable": True},
]

RECURRENT_SYNDIC = {"id": 9, "titre": "Copropriété → Syndic", "compte_de": 1, "compte_vers": 2,
                    "mode": "charge", "charge_id": 1, "montant_centimes": None, "prenom_part": None,
                    "qui": None, "jour": 5, "consigne": None, "ordre": 1, "actif": True}
RECURRENT_ECOLE = {"id": 10, "titre": "École → École Max", "compte_de": 1, "compte_vers": 3,
                   "mode": "charge", "charge_id": 2, "montant_centimes": None, "prenom_part": None,
                   "qui": None, "jour": 5, "consigne": None, "ordre": 2, "actif": True}


def nouveau_bot(charges=None, comptes=None, recurrents=None, lignes=None):
    b = bot_mod.Bot.__new__(bot_mod.Bot)
    b.log = logging.getLogger("test-bot-libelles")
    b.donnees = DonneesFausseLignes(charges=list(charges if charges is not None else CHARGES),
                                     comptes=list(comptes if comptes is not None else COMPTES),
                                     recurrents=recurrents if recurrents is not None else [])
    b.telegram = None
    b.charges = b.donnees.charges()
    b.membres = [m["prenom"] for m in b.donnees.membres()]
    b.etats = {}
    b.donnees.maj_revenu(ANNEE, MOIS, "Yann", 612000)
    b.donnees.maj_revenu(ANNEE, MOIS, "Claudia", 454611)
    for cid, montant in (lignes or {}).items():
        b.donnees.maj_ligne(ANNEE, MOIS, cid, montant)
    return b


# ---------- affichage dans « à virer » ----------
def test_a_virer_affiche_le_libelle_fixe():
    b = nouveau_bot(recurrents=[RECURRENT_SYNDIC], lignes={1: -4500})
    b.donnees.creer_mouvements([{"annee": ANNEE, "mois": MOIS, "recurrent_id": 9,
                                 "titre": "Copropriété → Syndic", "compte_de": 1,
                                 "compte_vers": 2, "montant_centimes": -4500, "qui": None}])
    rep = b.traiter_message(TELEGRAM_ID, "a virer")
    assert "Libellé : CL-0001" in rep


def test_a_virer_affiche_a_completer_quand_variable_sans_valeur():
    b = nouveau_bot(recurrents=[RECURRENT_ECOLE], lignes={2: -91000})
    b.donnees.creer_mouvements([{"annee": ANNEE, "mois": MOIS, "recurrent_id": 10,
                                 "titre": "École → École Max", "compte_de": 1,
                                 "compte_vers": 3, "montant_centimes": -91000, "qui": None}])
    rep = b.traiter_message(TELEGRAM_ID, "a virer")
    assert "Libellé à compléter (modèle : Enfant Dupont Facture n°)" in rep


def test_a_virer_affiche_la_valeur_du_mois_quand_saisie():
    b = nouveau_bot(recurrents=[RECURRENT_ECOLE], lignes={2: -91000})
    b.donnees.creer_mouvements([{"annee": ANNEE, "mois": MOIS, "recurrent_id": 10,
                                 "titre": "École → École Max", "compte_de": 1,
                                 "compte_vers": 3, "montant_centimes": -91000, "qui": None,
                                 "libelle_virement": "Enfant Dupont Facture n°12"}])
    rep = b.traiter_message(TELEGRAM_ID, "a virer")
    assert "Libellé : Enfant Dupont Facture n°12" in rep
    assert "à compléter" not in rep


# ---------- commande libellé <charge|compte> <texte> ----------
# BLOQUANT : la VALEUR du libellé (après la cible) doit rester EXACTEMENT ce qui a été tapé —
# casse, accents, tirets, espaces. Seule la CIBLE (compte ou charge) se normalise pour être
# trouvée en flou (commandes.py::interpreter matche désormais sur texte_brut, jamais sur le
# texte normalisé, pour la commande libellé — contrairement à `lieu <voyage> <...>` qui, lui,
# perd bien la casse, cf. le commentaire resté sur `lieu` dans commandes.py).
def test_libelle_garde_le_texte_exact_majuscules_accents_tiret():
    b = nouveau_bot(recurrents=[RECURRENT_ECOLE], lignes={2: -91000})
    b.donnees.creer_mouvements([{"annee": ANNEE, "mois": MOIS, "recurrent_id": 10,
                                 "titre": "École → École Max", "compte_de": 1,
                                 "compte_vers": 3, "montant_centimes": -91000, "qui": None}])
    rep = b.traiter_message(TELEGRAM_ID, "libellé École DUPONT Léo Facture-École n°1234-56")
    assert "DUPONT Léo Facture-École n°1234-56" in rep
    m = b.donnees.mouvements(ANNEE, MOIS)[0]
    assert m["libelle_virement"] == "DUPONT Léo Facture-École n°1234-56"


def test_libelle_par_nom_de_compte():
    b = nouveau_bot(recurrents=[RECURRENT_ECOLE], lignes={2: -91000})
    b.donnees.creer_mouvements([{"annee": ANNEE, "mois": MOIS, "recurrent_id": 10,
                                 "titre": "École → École Max", "compte_de": 1,
                                 "compte_vers": 3, "montant_centimes": -91000, "qui": None}])
    rep = b.traiter_message(TELEGRAM_ID, "libellé École Max Facture12")
    assert "Facture12" in rep
    m = b.donnees.mouvements(ANNEE, MOIS)[0]
    assert m["libelle_virement"] == "Facture12"


def test_libelle_par_nom_de_charge():
    b = nouveau_bot(recurrents=[RECURRENT_ECOLE], lignes={2: -91000})
    b.donnees.creer_mouvements([{"annee": ANNEE, "mois": MOIS, "recurrent_id": 10,
                                 "titre": "École → École Max", "compte_de": 1,
                                 "compte_vers": 3, "montant_centimes": -91000, "qui": None}])
    rep = b.traiter_message(TELEGRAM_ID, "libelle ecole Facture12")
    assert "Facture12" in rep


def test_libelle_alias_sans_accent():
    b = nouveau_bot(recurrents=[RECURRENT_ECOLE], lignes={2: -91000})
    b.donnees.creer_mouvements([{"annee": ANNEE, "mois": MOIS, "recurrent_id": 10,
                                 "titre": "École → École Max", "compte_de": 1,
                                 "compte_vers": 3, "montant_centimes": -91000, "qui": None}])
    rep = b.traiter_message(TELEGRAM_ID, "libelle ecole max Facture12")
    assert "Facture12" in rep


def test_libelle_charge_restee_sur_le_commun():
    b = nouveau_bot()  # aucun récurrent "charge" : Copropriété reste sur le commun.
    rep = b.traiter_message(TELEGRAM_ID, "libellé copropriete CL-9999")
    assert "ne part pas vers un autre compte" in rep


def test_libelle_aucun_virement_en_attente():
    b = nouveau_bot(recurrents=[RECURRENT_ECOLE], lignes={2: -91000})
    # Pas de mouvement créé pour ce mois : rien à libeller.
    rep = b.traiter_message(TELEGRAM_ID, "libellé École Max Enfant Dupont Facture n°12")
    assert "aucun virement en attente" in rep.lower()


def test_libelle_cible_introuvable():
    b = nouveau_bot()
    rep = b.traiter_message(TELEGRAM_ID, "libellé Zorro CL-1")
    assert "correspond" in rep.lower()


def test_libelle_puis_annuler():
    b = nouveau_bot(recurrents=[RECURRENT_ECOLE], lignes={2: -91000})
    b.donnees.creer_mouvements([{"annee": ANNEE, "mois": MOIS, "recurrent_id": 10,
                                 "titre": "École → École Max", "compte_de": 1,
                                 "compte_vers": 3, "montant_centimes": -91000, "qui": None}])
    b.traiter_message(TELEGRAM_ID, "libellé École Max Enfant Dupont Facture n°12")
    rep = b.traiter_message(TELEGRAM_ID, "annuler")
    assert "annul" in rep.lower()
    m = b.donnees.mouvements(ANNEE, MOIS)[0]
    assert m["libelle_virement"] is None
