"""Financement d'un extra (colonne lignes.financement, migration 038).

Invariant 7 : la règle vit en JS (frontend/budget/calc.js) ; le bot passe par calc_cli.mjs et ne la
réimplémente pas. Ces tests exécutent donc le VRAI pont Node (pas de doublure de `calculer`) et
confrontent : un mois avec un extra « à financer » donne EXACTEMENT le résultat du même mois sans
cet extra. Données factices (aucun montant ni libellé réel). Hors ligne : mocks.DonneesFausse.
"""
from datetime import date

import bot as bot_mod
import pytest

from mocks import DonneesFausse
from mocks_lignes import DonneesFausseLignes

YANN = 6433455282
ANNEE, MOIS = date.today().year, date.today().month

CHARGES = [
    {"id": 1, "libelle": "Loyer test", "categorie": "Logement", "regle": "egales", "ponctuel": False, "actif": True},
    {"id": 2, "libelle": "Assurance test", "categorie": "Logement", "regle": "proport", "ponctuel": False, "actif": True},
    {"id": 3, "libelle": "Gadget test", "categorie": "Autre", "regle": "proport", "ponctuel": True, "actif": True},
]
REVENUS = {"Yann": 280000, "Claudia": 250000}
LIGNES = {1: -100000, 2: -30000}
EXTRA = -20000


def fabriquer_bot(avec_extra=None, classe=DonneesFausse):
    """Bot hors ligne sur un mois factice ; `avec_extra` : financement de l'extra (None = pas d'extra)."""
    b = bot_mod.Bot.__new__(bot_mod.Bot)
    b.log = type("L", (), {"info": lambda *a: None, "exception": lambda *a: None})()
    b.donnees = classe(charges=[dict(c) for c in CHARGES])
    b.charges = b.donnees.charges()
    b.membres = ["Yann", "Claudia"]
    b.etats = {}
    for prenom, m in REVENUS.items():
        b.donnees.maj_revenu(ANNEE, MOIS, prenom, m)
    for cid, m in LIGNES.items():
        b.donnees.maj_ligne(ANNEE, MOIS, cid, m)
    if avec_extra is not None:
        b.donnees.maj_ligne(ANNEE, MOIS, 3, EXTRA, financement=avec_extra)
    return b


def resultat(b):
    return b.charger_r(ANNEE, MOIS)[0]


def test_extra_a_financer_ne_change_rien_au_calcul():
    sans = resultat(fabriquer_bot())
    avec = resultat(fabriquer_bot("a_financer"))
    for cle in ("totaux", "total", "totalCommun", "parts", "aVerser", "reste", "parCategorie"):
        assert avec[cle] == sans[cle], f"{cle} change à cause d'un extra à financer"
    assert avec["aFinancer"] == EXTRA
    assert sans["aFinancer"] == 0


def test_extra_joint_ne_fait_pas_virer_plus():
    sans = resultat(fabriquer_bot())
    joint = resultat(fabriquer_bot("joint"))
    assert joint["aVerser"] == sans["aVerser"]
    assert joint["totalCommun"] == sans["totalCommun"]
    assert joint["parJoint"] == EXTRA


def test_extra_chacun_ou_sans_financement_est_compte_comme_avant():
    chacun = resultat(fabriquer_bot("chacun"))
    assert chacun["totalCommun"] == sum(LIGNES.values()) + EXTRA
    # Un extra sans financement (anciens extras, avant la migration) : mêmes chiffres que « chacun ».
    b = fabriquer_bot()
    b.donnees.maj_ligne(ANNEE, MOIS, 3, EXTRA)  # financement jamais écrit
    ancien = resultat(b)
    assert ancien["aVerser"] == chacun["aVerser"]
    assert ancien["aFinancer"] == 0


def test_la_regle_du_mois_n_est_plus_perdue_par_le_bot(monkeypatch):
    """Avant, charger_r aplatissait les lignes en nombres et perdait `regle` : le moteur du bot
    ignorait la règle propre au mois. Les lignes lues portent désormais leur règle jusqu'à calc.js."""
    b = fabriquer_bot()
    base = resultat(b)
    lignes = b.donnees.lignes_mois(ANNEE, MOIS)
    for l in lignes:
        if l["charge_id"] == 2:
            l["regle"] = "egales"
    monkeypatch.setattr(b.donnees, "mois", lambda a, m: (lignes, b.donnees.revenus_mois(a, m)))
    assert resultat(b)["aVerser"] != base["aVerser"]


def test_extra_cree_par_le_bot_nait_a_financer():
    b = fabriquer_bot()
    r = b.traiter_message(YANN, "extra gadget 25")
    assert "À financer" in r
    c = b.donnees._charges[-1]
    assert c["libelle"].lower().startswith("gadget")
    assert b.donnees._financements[(ANNEE, MOIS, c["id"])] == "a_financer"
    # Et il n'entre pas dans le calcul tant qu'il est à financer.
    b.charges = b.donnees.charges()
    assert resultat(b)["totalCommun"] == sum(LIGNES.values())


def test_bilan_affiche_les_extras_a_financer():
    b = fabriquer_bot("a_financer")
    texte = b.traiter_message(YANN, "bilan")
    assert "Extras à financer : 200,00 € (Gadget test)" in texte


def test_bilan_sans_extra_a_financer_ne_dit_rien():
    for financement in (None, "joint", "chacun"):
        assert "Extras à financer" not in fabriquer_bot(financement).traiter_message(YANN, "bilan")


def _totaux_groupes(financement):
    import budget_virements
    b = fabriquer_bot(financement, classe=DonneesFausseLignes)
    groupes, _ = budget_virements._construire_groupes(b, ANNEE, MOIS)
    assert all(l["libelle"] != "Gadget test" for g in groupes for l in g["lignes"])
    return sorted((g["libelleVers"], g["total"]) for g in groupes)


@pytest.mark.parametrize("financement", ["a_financer", "joint"])
def test_virements_cli_ne_recompte_pas_les_extras(financement):
    """Les groupes de virements ignorent les ponctuelles (groupes-virements.js) et lisent `aVerser`
    du moteur pour les virements au commun : un extra à financer ou absorbé par le joint donne les
    mêmes totaux de groupe que le mois sans cet extra."""
    assert _totaux_groupes(financement) == _totaux_groupes(None)