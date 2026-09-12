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
        "import('file:///" + str(racine / "frontend" / "taches" / "taches.js").replace("\\", "/") + "')"
        ".then(m => console.log(JSON.stringify(" + json.dumps(jours) + ".flatMap(j => "
        "['quotidien','hebdo','mensuel'].map(f => m.echeance(f, j))))))"
    )
    r = subprocess.run(["node", "--input-type=module", "-e", script],
                       capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr[:300]
    attendu = [taches_mod.echeance(f, date.fromisoformat(j)).isoformat()
               for j in jours for f in ("quotidien", "hebdo", "mensuel")]
    assert json.loads(r.stdout) == attendu


# ---------- confrontation JS/Python : partsDe et creditDe (L-014) ----------
# Cas limites du tableau logique-metier.md §10 : c'est là que deux implémentations
# divergent, jamais sur le cas normal.
CAS_PARTS_DE = [
    # (recurrent, qui)
    ({"parts_quart": 8, "ecart_prenom": None}, "Yann"),
    ({"parts_quart": 8, "ecart_prenom": "Claudia"}, "Claudia"),
    ({"parts_quart": 8, "ecart_prenom": "Claudia"}, "Yann"),
    ({"parts_quart": 32, "ecart_prenom": "Yann"}, "Yann"),  # plafond de l'échelle
    ({"parts_quart": 4, "ecart_prenom": None}, None),       # non cochée
]
CAS_CREDIT_DE = [
    # (recurrent, tache)
    ({"parts_quart": 8, "ecart_prenom": None}, {"qui": "Yann", "qui2": "Claudia"}),
    ({"parts_quart": 2, "ecart_prenom": None}, {"qui": "Yann", "qui2": "Claudia"}),  # 0,5 en quarts
    # l'écart ne s'applique pas à deux : Claudia reste créditée de la moitié de la base
    ({"parts_quart": 8, "ecart_prenom": "Claudia"}, {"qui": "Claudia", "qui2": "Yann"}),
    ({"parts_quart": 32, "ecart_prenom": "Yann"}, {"qui": "Yann", "qui2": None}),  # plafond, seul
]


def test_partsde_creditde_identiques_au_frontend():
    """Le bot et le navigateur doivent créditer exactement les mêmes parts (L-014)."""
    import json
    import subprocess
    from pathlib import Path
    racine = Path(__file__).resolve().parent.parent.parent
    module_url = "file:///" + str(racine / "frontend" / "taches" / "taches.js").replace("\\", "/")
    script = (
        f"import('{module_url}').then(m => console.log(JSON.stringify({{"
        f"partsDe: {json.dumps(CAS_PARTS_DE)}.map(([r, qui]) => m.partsDe(r, qui)), "
        f"creditDe: {json.dumps(CAS_CREDIT_DE)}.map(([r, t]) => m.creditDe(r, t)), "
        f"}})))"
    )
    r = subprocess.run(["node", "--input-type=module", "-e", script],
                       capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr[:300]
    du_js = json.loads(r.stdout)

    attendu_parts_de = [taches_mod.parts_de(r, qui) for r, qui in CAS_PARTS_DE]
    assert du_js["partsDe"] == attendu_parts_de

    attendu_credit_de = [taches_mod.credit_de(r, t) for r, t in CAS_CREDIT_DE]
    assert du_js["creditDe"] == attendu_credit_de

    # `4.0 == 4` est vrai en Python : l'égalité ci-dessus ne verrait PAS un crédit devenu
    # flottant, alors qu'il partirait tel quel dans une colonne int. On vérifie donc le TYPE.
    for credit in attendu_credit_de:
        for q in credit.values():
            assert isinstance(q, int), f"les quarts restent entiers, reçu {q!r} ({type(q).__name__})"


def test_parts_de_hors_echelle_ne_plante_pas():
    """Une base hors échelle (donnée héritée) dégrade comme le JS au lieu de lever.

    `list.index()` lève là où `indexOf` rend -1 : sans garde, le bot tombait sur une tâche
    dont `parts_quart` n'était pas un cran valide.
    """
    assert taches_mod.parts_de({"parts_quart": 7, "ecart_prenom": "Yann"}, "Yann") == 2
    assert taches_mod.parts_de({"parts_quart": 7, "ecart_prenom": None}, "Yann") == 7


def test_partsde_plafond_et_ecart_a_deux_valeurs_attendues():
    """Doublon explicite des cas limites, en clair : un cas non testé littéralement dort (L-007)."""
    assert taches_mod.parts_de({"parts_quart": 8, "ecart_prenom": None}, "Yann") == 8
    assert taches_mod.parts_de({"parts_quart": 8, "ecart_prenom": "Claudia"}, "Claudia") == 12
    assert taches_mod.parts_de({"parts_quart": 8, "ecart_prenom": "Claudia"}, "Yann") == 8
    assert taches_mod.parts_de({"parts_quart": 32, "ecart_prenom": "Yann"}, "Yann") == 32, "plafond"
    assert taches_mod.credit_de({"parts_quart": 8}, {"qui": "Yann", "qui2": "Claudia"}) == \
        {"Yann": 4, "Claudia": 4}
    assert taches_mod.credit_de({"parts_quart": 2}, {"qui": "Yann", "qui2": "Claudia"}) == \
        {"Yann": 1, "Claudia": 1}, "0,5 part divisée en quarts : exact"
    assert taches_mod.credit_de({"parts_quart": 8, "ecart_prenom": "Claudia"},
                                {"qui": "Claudia", "qui2": "Yann"}) == {"Claudia": 4, "Yann": 4}, \
        "l'écart ne s'applique pas à deux"


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
def test_basculer_fige_les_parts_et_l_auteur():
    d = DonneesFausse()
    cible, champs, erreur = taches_mod.basculer(d, "Yann", "linge", True, LUNDI)
    assert erreur is None
    assert cible["titre"] == "Étendre et plier le linge"
    assert champs["parts_quart"] == 20, "parts_quart = parts_quart du récurrent (5 parts)"
    assert champs["qui"] == "Yann", "les parts vont à qui coche, pas à qui est attribué"
    assert champs["qui2"] is None
    assert champs["fait_le"] is not None


def test_basculer_a_deux_credite_qui2():
    d = DonneesFausse()
    cible, champs, erreur = taches_mod.basculer(d, "Yann", "linge", True, LUNDI, qui2="Claudia")
    assert erreur is None
    assert champs["qui"] == "Yann" and champs["qui2"] == "Claudia"
    assert champs["parts_quart"] == 20, "la base se fige entière ; c'est creditDe qui divise"


def test_basculer_puis_annuler_revient_a_zero():
    d = DonneesFausse()
    _, champs, _ = taches_mod.basculer(d, "Yann", "biberons", True, LUNDI)
    assert champs["parts_quart"] == 4
    cible, champs2, erreur = taches_mod.basculer(d, "Yann", "biberons", False, LUNDI)
    assert erreur is None
    assert champs2 == {"fait_le": None, "qui": None, "qui2": None, "parts_quart": 0}


def test_basculer_puis_bareme_change_ne_reecrit_pas_l_historique():
    """Le crédit figé sur l'occurrence ne bouge pas si le récurrent change ensuite (§5)."""
    d = DonneesFausse()
    _, champs, _ = taches_mod.basculer(d, "Yann", "biberons", True, LUNDI)
    assert champs["parts_quart"] == 4
    for r in d._taches_rec:
        if r["id"] == 1:
            r["parts_quart"] = 32
    tache = next(t for t in d.taches(depuis="2026-01-01") if t["titre"] == "Laver les biberons")
    assert tache["parts_quart"] == 4, "figé à la coche, jamais recalculé depuis le récurrent"


def test_basculer_titre_inconnu_n_ecrit_rien():
    d = DonneesFausse()
    taches_mod.du_jour(d, LUNDI)
    avant = [dict(t) for t in d.taches(depuis="2026-01-01")]
    cible, champs, erreur = taches_mod.basculer(d, "Yann", "réparer la fusée", True, LUNDI)
    assert cible is None and champs is None
    assert "Aucune tâche ne correspond" in erreur
    assert d.taches(depuis="2026-01-01") == avant


def test_basculer_biberons_ne_coche_qu_une_occurrence():
    """Non-régression D-023 étendu au bot : le regroupement change l'AFFICHAGE, jamais la
    coche. « fait biberons » doit cocher UNE occurrence (la suivante non faite, rang 1),
    laisser l'autre (rang 2) intacte — jamais les deux d'un coup."""
    d = DonneesFausse()
    taches_mod.du_jour(d, LUNDI)
    avant = [dict(t) for t in d.taches(depuis="2026-01-01") if t["titre"] == "Laver les biberons"]
    assert len(avant) == 2 and all(t["fait_le"] is None for t in avant)

    cible, champs, erreur = taches_mod.basculer(d, "Yann", "biberons", True, LUNDI)
    assert erreur is None
    assert cible["rang"] == 1, "la première occurrence non faite est ciblée"

    apres = [dict(t) for t in d.taches(depuis="2026-01-01") if t["titre"] == "Laver les biberons"]
    faites = [t for t in apres if t["fait_le"]]
    restantes = [t for t in apres if not t["fait_le"]]
    assert len(faites) == 1 and faites[0]["rang"] == 1, "une seule occurrence cochée"
    assert len(restantes) == 1 and restantes[0]["rang"] == 2, "l'autre occurrence reste à faire"


# ---------- regrouper_pour_affichage (D-023 étendu au bot) : AFFICHAGE seulement ----------
def test_regrouper_pour_affichage_fusionne_une_seule_ligne():
    d = DonneesFausse()
    liste, recurrents = taches_mod.du_jour(d, LUNDI)
    restantes = taches_mod.restantes(liste, recurrents, LUNDI)
    groupes = taches_mod.regrouper_pour_affichage(restantes, recurrents)
    biberons = [g for g in groupes if g["tache"]["titre"] == "Laver les biberons"]
    assert len(biberons) == 1, "les deux occurrences de biberons fusionnent en un seul groupe"
    assert biberons[0]["total"] == 2 and biberons[0]["restantes"] == 2


def test_regrouper_pour_affichage_fois_1_total_1():
    d = DonneesFausse()
    liste, recurrents = taches_mod.du_jour(d, LUNDI)
    restantes = taches_mod.restantes(liste, recurrents, LUNDI)
    groupes = taches_mod.regrouper_pour_affichage(restantes, recurrents)
    assert all(g["total"] == 1 for g in groupes if g["tache"]["titre"] != "Laver les biberons")


def test_restantes_trie_par_obligatoire_puis_echeance():
    d = DonneesFausse()
    liste, recurrents = taches_mod.du_jour(d, LUNDI)
    restantes = taches_mod.restantes(liste, recurrents, LUNDI)
    # Le linge (échéance dimanche prochain) n'est pas dû aujourd'hui.
    assert [t["titre"] for t in restantes] == ["Laver les biberons", "Laver les biberons"]
    assert [t["rang"] for t in restantes] == [1, 2]


# ---------- tri par moment (012_moment.sql) ----------
def _tache(id_, recurrent_id, echeance=None, rang=1):
    return {"id": id_, "recurrent_id": recurrent_id, "echeance": echeance or LUNDI.isoformat(),
            "rang": rang, "fait_le": None}


def test_restantes_trie_matin_avant_soir():
    recurrents = {1: {"obligatoire": False, "moment": "soir"},
                  2: {"obligatoire": False, "moment": "matin"}}
    taches = [_tache(10, 1), _tache(11, 2)]
    restantes = taches_mod.restantes(taches, recurrents, LUNDI)
    assert [t["id"] for t in restantes] == [11, 10], "le matin passe avant le soir à obligatoire égal"


def test_restantes_moment_n_ecrase_pas_obligatoire():
    """Obligatoire reste le premier critère : un « soir » obligatoire passe avant un « matin » qui ne l'est pas."""
    recurrents = {1: {"obligatoire": True, "moment": "soir"},
                  2: {"obligatoire": False, "moment": "matin"}}
    taches = [_tache(10, 2), _tache(11, 1)]
    restantes = taches_mod.restantes(taches, recurrents, LUNDI)
    assert [t["id"] for t in restantes] == [11, 10]


def test_restantes_sans_moment_ne_sont_pas_perdues_et_passent_apres():
    """Hebdo/mensuelle/au besoin/quotidienne non réglée : rangées après matin et soir, jamais absentes."""
    recurrents = {1: {"obligatoire": False, "moment": "matin"},
                  2: {"obligatoire": False, "moment": None},
                  3: {"obligatoire": False}}  # `moment` absent de la fiche récurrente
    taches = [_tache(10, 2), _tache(11, 1), _tache(12, 3)]
    restantes = taches_mod.restantes(taches, recurrents, LUNDI)
    ids = [t["id"] for t in restantes]
    assert set(ids) == {10, 11, 12}, "aucune tâche perdue"
    assert ids[0] == 11, "le moment réglé (matin) vient en premier"
    assert ids.index(11) < ids.index(10) and ids.index(11) < ids.index(12)


# ---------- balance ----------
def test_balance_compte_la_fenetre_seulement():
    maintenant = datetime.now(timezone.utc)
    taches = [
        {"qui": "Yann", "qui2": None, "recurrent_id": None, "parts_quart": 3,
         "categorie": "Cuisine", "fait_le": maintenant.isoformat()},
        {"qui": "Claudia", "qui2": None, "recurrent_id": None, "parts_quart": 5,
         "categorie": "Linge", "fait_le": (maintenant - timedelta(days=2)).isoformat()},
        {"qui": "Yann", "qui2": None, "recurrent_id": None, "parts_quart": 9,
         "categorie": "Ménage", "fait_le": (maintenant - timedelta(days=40)).isoformat()},
        {"qui": "Yann", "qui2": None, "recurrent_id": None, "parts_quart": 9,
         "categorie": "Ménage", "fait_le": None},
        {"qui": "Inconnu", "qui2": None, "recurrent_id": None, "parts_quart": 9,
         "categorie": "Ménage", "fait_le": maintenant.isoformat()},
    ]
    auj = date.today()
    b = taches_mod.balance(taches, [], ["Yann", "Claudia"], auj - timedelta(days=6), auj)
    assert b["parts"] == {"Yann": 3, "Claudia": 5}
    assert b["nombre"] == {"Yann": 1, "Claudia": 1}
    assert b["total"] == 8
    assert b["ratio"]["Claudia"] == pytest.approx(0.625)
    assert b["parCategorie"] == {"Cuisine": {"Yann": 3, "Claudia": 0},
                                "Linge": {"Yann": 0, "Claudia": 5}}, "même forme de retour qu'en JS"


def test_balance_occurrence_a_deux_credite_les_deux_total_conserve():
    maintenant = datetime.now(timezone.utc)
    taches = [
        {"qui": "Yann", "qui2": "Claudia", "recurrent_id": None, "parts_quart": 8,
         "categorie": "Salle de bain", "fait_le": maintenant.isoformat()},
    ]
    auj = date.today()
    b = taches_mod.balance(taches, [], ["Yann", "Claudia"], auj - timedelta(days=6), auj)
    assert b["parts"] == {"Yann": 4, "Claudia": 4}
    assert b["nombre"] == {"Yann": 1, "Claudia": 1}, "une participation chacun, pas une tâche chacun"
    assert b["total"] == 8, "le total ne double pas quand une tâche est faite à deux"


def test_balance_obligatoire_seul_n_agrege_que_les_obligatoires():
    maintenant = datetime.now(timezone.utc)
    recurrents = [
        {"id": 1, "obligatoire": True},
        {"id": 2, "obligatoire": False},
    ]
    taches = [
        {"qui": "Yann", "qui2": None, "recurrent_id": 1, "parts_quart": 12,
         "categorie": "Enfant", "fait_le": maintenant.isoformat()},
        {"qui": "Claudia", "qui2": None, "recurrent_id": 2, "parts_quart": 32,
         "categorie": "Ménage", "fait_le": maintenant.isoformat()},
    ]
    auj = date.today()
    b = taches_mod.balance(taches, recurrents, ["Yann", "Claudia"], auj - timedelta(days=6), auj,
                           obligatoire_seul=True)
    assert b["parts"] == {"Yann": 12, "Claudia": 0}
    assert b["total"] == 12


def test_balance_vide_partage_a_moitie():
    auj = date.today()
    b = taches_mod.balance([], [], ["Yann", "Claudia"], auj - timedelta(days=6), auj)
    assert b["ratio"] == {"Yann": 0.5, "Claudia": 0.5}
    assert b["total"] == 0


def test_credit_de_tache_non_cochee_retourne_objet_vide():
    recurrent = {"parts_quart": 8, "ecart_prenom": None}
    assert taches_mod.credit_de(recurrent, {"qui": None, "qui2": None}) == {}
