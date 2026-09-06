"""Tests hors ligne du dispatch (scripts/bot/bot.py) : Supabase et Telegram mockés.

bot.Bot.__init__ touche le réseau (lit_env, cles, Donnees, Telegram) : on construit
l'instance sans passer par __init__ et on injecte les doublures de mocks.py.
"""
import logging

import bot as bot_mod
from mocks import DonneesFausse

ANNEE, MOIS = 2026, 9

CHARGES = [
    {"id": 1, "libelle": "Crédit", "categorie": "Logement", "regle": "egales", "ponctuel": False, "actif": True},
    {"id": 2, "libelle": "Impôts", "categorie": "Autre", "regle": "proport", "ponctuel": False, "actif": True},
]


def nouveau_bot(charges=None, revenus_precedent=None, lignes_precedent=None):
    b = bot_mod.Bot.__new__(bot_mod.Bot)
    b.log = logging.getLogger("test-bot")
    b.donnees = DonneesFausse(charges=charges if charges is not None else list(CHARGES))
    b.telegram = None  # non utilisé par traiter_message
    b.charges = b.donnees.charges()
    b.membres = [m["prenom"] for m in b.donnees.membres()]
    b.etats = {}
    if revenus_precedent:
        for p, m in revenus_precedent.items():
            b.donnees.maj_revenu(ANNEE, MOIS - 1, p, m)
    if lignes_precedent:
        for cid, m in lignes_precedent.items():
            b.donnees.maj_ligne(ANNEE, MOIS - 1, cid, m)
    return b


def peupler_mois_courant(b, revenus=None, lignes=None):
    for p, m in (revenus or {}).items():
        b.donnees.maj_revenu(ANNEE, MOIS, p, m)
    for cid, m in (lignes or {}).items():
        b.donnees.maj_ligne(ANNEE, MOIS, cid, m)


def test_inconnu_ne_repond_rien_ecrit():
    b = nouveau_bot()
    rep = b.traiter_message(999999, "salaire 6120")
    assert "connais" in rep.lower() or "inscrire" in rep.lower()
    assert b.donnees.revenus_mois(ANNEE, MOIS) == []


def test_aide():
    b = nouveau_bot(revenus_precedent={"Yann": 1, "Claudia": 1})
    peupler_mois_courant(b, revenus={"Yann": 1, "Claudia": 1})
    rep = b.traiter_message(6433455282, "aide")
    assert "Commandes" in rep


def test_salaire_ecrit_et_confirme():
    b = nouveau_bot(revenus_precedent={"Yann": 1, "Claudia": 1})
    peupler_mois_courant(b, revenus={"Yann": 1, "Claudia": 1})
    rep = b.traiter_message(6433455282, "salaire 6120")
    assert "6 120,00" in rep
    assert "✔" in rep
    assert b.donnees.revenus_mois(ANNEE, MOIS)


def test_annuler_restaure_ancienne_valeur():
    b = nouveau_bot(revenus_precedent={"Yann": 1, "Claudia": 1})
    peupler_mois_courant(b, revenus={"Yann": 500000, "Claudia": 1})
    b.traiter_message(6433455282, "salaire 6120")
    assert b.donnees._revenus[(ANNEE, MOIS)]["Yann"] == 612000
    rep = b.traiter_message(6433455282, "annuler")
    assert "annul" in rep.lower()
    assert b.donnees._revenus[(ANNEE, MOIS)]["Yann"] == 500000


def test_annuler_sans_historique():
    b = nouveau_bot(revenus_precedent={"Yann": 1, "Claudia": 1})
    peupler_mois_courant(b, revenus={"Yann": 1, "Claudia": 1})
    rep = b.traiter_message(6433455282, "annuler")
    assert "rien" in rep.lower()


def test_mois_vide_propose_copie_puis_copie_sur_oui():
    b = nouveau_bot(revenus_precedent={"Yann": 500000, "Claudia": 400000},
                     lignes_precedent={1: -10000})
    rep = b.traiter_message(6433455282, "salaire 6120")
    assert "vide" in rep.lower()
    assert "oui/non" in rep.lower()
    rep2 = b.traiter_message(6433455282, "oui")
    assert "copi" in rep2.lower()
    # le revenu Claudia du mois précédent doit avoir été copié
    assert b.donnees._revenus[(ANNEE, MOIS)].get("Claudia") == 400000
    # et le salaire demandé doit avoir été appliqué par-dessus
    assert b.donnees._revenus[(ANNEE, MOIS)].get("Yann") == 612000


def test_mois_vide_refuse_sur_non():
    b = nouveau_bot(revenus_precedent={"Yann": 500000, "Claudia": 400000},
                     lignes_precedent={1: -10000})
    b.traiter_message(6433455282, "salaire 6120")
    rep2 = b.traiter_message(6433455282, "non")
    assert "rien" in rep2.lower()
    assert b.donnees._revenus.get((ANNEE, MOIS), {}) == {}


def test_bilan_calcule_via_calc_cli():
    b = nouveau_bot(revenus_precedent={"Yann": 1, "Claudia": 1})
    peupler_mois_courant(b, revenus={"Yann": 612000, "Claudia": 454611}, lignes={1: -159207, 2: -425271})
    rep = b.traiter_message(6433455282, "bilan")
    assert "Bilan" in rep
    assert "Yann verse" in rep
    assert "Claudia verse" in rep


def test_charge_montant_hors_bornes_refuse():
    b = nouveau_bot(revenus_precedent={"Yann": 1, "Claudia": 1})
    peupler_mois_courant(b, revenus={"Yann": 1, "Claudia": 1})
    rep = b.traiter_message(6433455282, "salaire 0")
    assert "born" in rep.lower()


def test_charge_ambigue_ne_repond_pas_par_ecriture():
    b = nouveau_bot(revenus_precedent={"Yann": 1, "Claudia": 1})
    peupler_mois_courant(b, revenus={"Yann": 1, "Claudia": 1})
    rep = b.traiter_message(6433455282, "zzzzzzzzz 100")
    assert "correspond" in rep.lower() or "proche" in rep.lower()
    assert b.donnees.lignes_mois(ANNEE, MOIS) == []


# ---------- mouvements (coche, bilan, annulation) ----------

def bot_avec_mois_peuple(charges=None, recurrents=None):
    """Bot dont le mois courant est peuplé : le calcul tourne, pas de proposition de copie."""
    b = nouveau_bot(charges=charges, revenus_precedent={"Yann": 1, "Claudia": 1})
    if recurrents is not None:
        b.donnees._recurrents = recurrents
    peupler_mois_courant(b, revenus={"Yann": 612000, "Claudia": 454611}, lignes={1: -159207, 2: -425271})
    return b


def test_fait_coche_le_mouvement_part_de_l_expediteur():
    b = bot_avec_mois_peuple()
    rep = b.traiter_message(6433455282, "fait")
    assert "fait" in rep.lower()
    faits = [m for m in b.donnees.mouvements(ANNEE, MOIS) if m["fait_le"]]
    assert len(faits) == 1
    # Yann est l'expéditeur : c'est SON virement au commun qui est coché.
    assert "Yann" in faits[0]["titre"]
    # Le montant est figé, non nul, et entier (centimes).
    assert isinstance(faits[0]["montant_centimes"], int)
    assert faits[0]["montant_centimes"] != 0


def test_fait_genere_les_occurrences_manquantes():
    b = bot_avec_mois_peuple()
    assert b.donnees.mouvements(ANNEE, MOIS) == []
    b.traiter_message(6433455282, "fait")
    # Un mouvement par récurrent actif (les deux « part » issus de la migration).
    assert len(b.donnees.mouvements(ANNEE, MOIS)) == 2


def test_fait_par_titre_coche_un_autre_mouvement():
    recurrents = [{"id": 1, "titre": "Virement au commun — Yann", "compte_de": None, "compte_vers": 10,
                   "mode": "part", "montant_centimes": None, "charge_id": None, "prenom_part": "Yann",
                   "qui": "Yann", "jour": 5, "consigne": None, "ordre": 1, "actif": True},
                  {"id": 2, "titre": "Épargne Livret A", "compte_de": None, "compte_vers": 11,
                   "mode": "fixe", "montant_centimes": -20000, "charge_id": None, "prenom_part": None,
                   "qui": "Claudia", "jour": 10, "consigne": None, "ordre": 2, "actif": True}]
    b = bot_avec_mois_peuple(recurrents=recurrents)
    # Sans accent ni majuscule : la recherche floue doit retrouver « Épargne Livret A ».
    rep = b.traiter_message(6433455282, "fait epargne livret a")
    assert "Épargne" in rep
    faits = [m for m in b.donnees.mouvements(ANNEE, MOIS) if m["fait_le"]]
    assert [m["titre"] for m in faits] == ["Épargne Livret A"]
    assert faits[0]["montant_centimes"] == -20000


def test_fait_par_titre_inconnu_n_ecrit_rien():
    b = bot_avec_mois_peuple()
    rep = b.traiter_message(6433455282, "fait zzzzzzzzzz")
    assert "correspond" in rep.lower()
    assert [m for m in b.donnees.mouvements(ANNEE, MOIS) if m["fait_le"]] == []


def test_pas_fait_decoche_le_mouvement():
    b = bot_avec_mois_peuple()
    b.traiter_message(6433455282, "fait")
    assert [m for m in b.donnees.mouvements(ANNEE, MOIS) if m["fait_le"]]
    rep = b.traiter_message(6433455282, "pas fait")
    assert "annul" in rep.lower()
    assert [m for m in b.donnees.mouvements(ANNEE, MOIS) if m["fait_le"]] == []


def test_annuler_une_coche_restaure_l_etat_precedent():
    b = bot_avec_mois_peuple()
    # État des occurrences juste avant la coche (elles sont créées à la volée).
    b.traiter_message(6433455282, "bilan")
    avant = {m["id"]: (m["fait_le"], m["montant_centimes"]) for m in b.donnees.mouvements(ANNEE, MOIS)}
    b.traiter_message(6433455282, "fait")
    coche = [m for m in b.donnees.mouvements(ANNEE, MOIS) if m["fait_le"]]
    assert len(coche) == 1
    rep = b.traiter_message(6433455282, "annuler")
    assert "annul" in rep.lower()
    apres = {m["id"]: (m["fait_le"], m["montant_centimes"]) for m in b.donnees.mouvements(ANNEE, MOIS)}
    assert apres == avant


def test_bilan_liste_les_mouvements_restants():
    b = bot_avec_mois_peuple()
    rep = b.traiter_message(6433455282, "bilan")
    assert "Reste à faire" in rep
    assert "Virement au commun — Yann" in rep
    assert "Virement au commun — Claudia" in rep


def test_bilan_signale_quand_tout_est_fait():
    recurrents = [{"id": 1, "titre": "Virement au commun — Yann", "compte_de": None, "compte_vers": 10,
                   "mode": "part", "montant_centimes": None, "charge_id": None, "prenom_part": "Yann",
                   "qui": "Yann", "jour": 5, "consigne": None, "ordre": 1, "actif": True}]
    b = bot_avec_mois_peuple(recurrents=recurrents)
    b.traiter_message(6433455282, "fait")
    rep = b.traiter_message(6433455282, "bilan")
    assert "Tous les mouvements sont faits" in rep
    assert "Reste à faire" not in rep


def test_fait_sans_recurrent_part_pour_l_expediteur():
    recurrents = [{"id": 2, "titre": "Épargne", "compte_de": None, "compte_vers": 11, "mode": "fixe",
                   "montant_centimes": -20000, "charge_id": None, "prenom_part": None, "qui": "Claudia",
                   "jour": 10, "consigne": None, "ordre": 1, "actif": True}]
    b = bot_avec_mois_peuple(recurrents=recurrents)
    rep = b.traiter_message(6433455282, "fait")
    assert "Aucun virement au commun" in rep
    assert [m for m in b.donnees.mouvements(ANNEE, MOIS) if m["fait_le"]] == []
