"""Tests du module Tâches côté bot : échéances, occurrences, coche, balance, dispatch.

Hors ligne : Supabase et Telegram sont des doublures (mocks.py).
"""
from datetime import date, datetime, timedelta, timezone

import pytest

import taches as taches_mod
from mocks import DonneesFausse

# 2026-09-06 est un dimanche, 2026-09-07 un lundi.
DIMANCHE = date(2026, 9, 6)
LUNDI = date(2026, 9, 7)


# ---------- échéances ----------
def test_echeance_par_frequence():
    assert taches_mod.echeance("quotidien", LUNDI) == LUNDI
    assert taches_mod.echeance("hebdo", DIMANCHE) == DIMANCHE, "un dimanche est sa propre fin de semaine"
    assert taches_mod.echeance("hebdo", LUNDI) == date(2026, 9, 13)
    assert taches_mod.echeance("mensuel", date(2026, 2, 10)) == date(2026, 2, 28)
    assert taches_mod.echeance("mensuel", date(2028, 2, 10)) == date(2028, 2, 29), "année bissextile"
    assert taches_mod.echeance("au_besoin", LUNDI) is None


def test_echeances_identiques_au_frontend():
    """Le bot et le navigateur doivent générer exactement les mêmes échéances (même clé unique)."""
    import json
    import subprocess
    from pathlib import Path
    racine = Path(__file__).resolve().parent.parent.parent
    jours = ["2026-09-06", "2026-09-07", "2026-12-31", "2028-02-10", "2026-02-28"]
    script = (
        "import('file:///" + str(racine / "frontend" / "taches.js").replace("\\", "/") + "')"
        ".then(m => console.log(JSON.stringify(" + json.dumps(jours) + ".flatMap(j => "
        "['quotidien','hebdo','mensuel'].map(f => m.echeance(f, j))))))"
    )
    r = subprocess.run(["node", "--input-type=module", "-e", script],
                       capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr[:300]
    attendu = [taches_mod.echeance(f, date.fromisoformat(j)).isoformat()
               for j in jours for f in ("quotidien", "hebdo", "mensuel")]
    assert json.loads(r.stdout) == attendu


# ---------- occurrences ----------
def test_occurrences_manquantes_respecte_fois_et_au_besoin():
    d = DonneesFausse()
    manquantes = taches_mod.occurrences_manquantes(d.taches_recurrentes(), [], LUNDI)
    # Biberons : 2 par jour ; linge : 1 pour la semaine ; poubelle : jamais générée.
    assert [(t["recurrent_id"], t["rang"]) for t in manquantes] == [(1, 1), (1, 2), (2, 1)]
    assert all(t["echeance"] == "2026-09-07" for t in manquantes if t["recurrent_id"] == 1)
    assert [t["echeance"] for t in manquantes if t["recurrent_id"] == 2] == ["2026-09-13"]
    assert [t["qui"] for t in manquantes if t["recurrent_id"] == 2] == ["Claudia"], "attribution par défaut"


def test_du_jour_est_idempotent():
    d = DonneesFausse()
    premier, _ = taches_mod.du_jour(d, LUNDI)
    second, _ = taches_mod.du_jour(d, LUNDI)
    assert len(premier) == len(second) == 3
    assert {t["id"] for t in premier} == {t["id"] for t in second}, "aucune occurrence dupliquée"


def test_perimees_purge_avant_hier_seulement():
    taches = [
        {"id": 1, "recurrent_id": 1, "echeance": "2026-09-04", "fait_le": None},
        {"id": 2, "recurrent_id": 1, "echeance": "2026-09-05", "fait_le": None},
        {"id": 3, "recurrent_id": 1, "echeance": "2026-09-01", "fait_le": "2026-09-01T10:00:00+00:00"},
        {"id": 4, "recurrent_id": None, "echeance": "2026-09-01", "fait_le": None},
    ]
    assert [t["id"] for t in taches_mod.perimees(taches, DIMANCHE)] == [1], \
        "hier reste en retard, les faites et les hors-liste ne se purgent jamais"


def test_du_jour_supprime_les_perimees():
    d = DonneesFausse()
    taches_mod.du_jour(d, date(2026, 9, 1))
    restantes, _ = taches_mod.du_jour(d, date(2026, 9, 10))
    assert all(t["echeance"] >= "2026-09-09" for t in restantes), "les biberons du 1er ont disparu"


# ---------- coche ----------
def test_basculer_fige_les_points_et_l_auteur():
    d = DonneesFausse()
    cible, champs, erreur = taches_mod.basculer(d, "Yann", "linge", True, LUNDI)
    assert erreur is None
    assert cible["titre"] == "Étendre et plier le linge"
    assert champs["points"] == 4, "points = pénibilité du récurrent"
    assert champs["qui"] == "Yann", "les points vont à qui coche, pas à qui est attribué"
    assert champs["fait_le"] is not None


def test_basculer_puis_annuler_revient_a_zero():
    d = DonneesFausse()
    _, champs, _ = taches_mod.basculer(d, "Yann", "biberons", True, LUNDI)
    assert champs["points"] == 1
    cible, champs2, erreur = taches_mod.basculer(d, "Yann", "biberons", False, LUNDI)
    assert erreur is None
    assert champs2 == {"fait_le": None, "qui": None, "points": 0}


def test_basculer_titre_inconnu_n_ecrit_rien():
    d = DonneesFausse()
    taches_mod.du_jour(d, LUNDI)
    avant = [dict(t) for t in d.taches(depuis="2026-01-01")]
    cible, champs, erreur = taches_mod.basculer(d, "Yann", "réparer la fusée", True, LUNDI)
    assert cible is None and champs is None
    assert "Aucune tâche ne correspond" in erreur
    assert d.taches(depuis="2026-01-01") == avant


def test_restantes_trie_par_importance_puis_echeance():
    d = DonneesFausse()
    liste, recurrents = taches_mod.du_jour(d, LUNDI)
    restantes = taches_mod.restantes(liste, recurrents, LUNDI)
    # Le linge (échéance dimanche prochain) n'est pas dû aujourd'hui.
    assert [t["titre"] for t in restantes] == ["Laver les biberons", "Laver les biberons"]
    assert [t["rang"] for t in restantes] == [1, 2]


# ---------- balance ----------
def test_balance_compte_la_fenetre_seulement():
    maintenant = datetime.now(timezone.utc)
    taches = [
        {"qui": "Yann", "points": 3, "categorie": "Cuisine", "fait_le": maintenant.isoformat()},
        {"qui": "Claudia", "points": 5, "categorie": "Linge", "fait_le": (maintenant - timedelta(days=2)).isoformat()},
        {"qui": "Yann", "points": 9, "categorie": "Ménage", "fait_le": (maintenant - timedelta(days=40)).isoformat()},
        {"qui": "Yann", "points": 9, "categorie": "Ménage", "fait_le": None},
        {"qui": "Inconnu", "points": 9, "categorie": "Ménage", "fait_le": maintenant.isoformat()},
    ]
    auj = date.today()
    b = taches_mod.balance(taches, ["Yann", "Claudia"], auj - timedelta(days=6), auj)
    assert b["points"] == {"Yann": 3, "Claudia": 5}
    assert b["nombre"] == {"Yann": 1, "Claudia": 1}
    assert b["total"] == 8
    assert b["ratio"]["Claudia"] == pytest.approx(0.625)
    assert b["parCategorie"] == {"Cuisine": {"Yann": 3, "Claudia": 0},
                                "Linge": {"Yann": 0, "Claudia": 5}}, "même forme de retour qu'en JS"


def test_balance_vide_partage_a_moitie():
    auj = date.today()
    b = taches_mod.balance([], ["Yann", "Claudia"], auj - timedelta(days=6), auj)
    assert b["ratio"] == {"Yann": 0.5, "Claudia": 0.5}
    assert b["total"] == 0
