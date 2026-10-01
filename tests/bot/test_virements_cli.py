"""Confrontation JS/Python (L-014) du pont scripts/bot/virements_cli.mjs : sa sortie doit être
identique à un appel direct de frontend/budget/groupes-virements.js en Node, comme
test_taches.py::test_echeances_identiques_au_frontend. Le pont ne réimplémente rien — ce test
prouve qu'il se contente de relayer construireGroupes + preparerBasculeGroupe sans les déformer.
"""
import json
import subprocess
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent.parent

ETAT = {
    "membres": [{"prenom": "Yann"}, {"prenom": "Claudia"}],
    "comptes": [
        {"id": 1, "nom": "Commun", "commun": True},
        {"id": 2, "nom": "Caisse d'Épargne"},
        {"id": 3, "nom": "Commun épargne", "commun": True},
    ],
    "charges": [
        {"id": 1, "libelle": "Crédit immo", "categorie": "Logement", "regle": "egales",
         "actif": True, "ponctuel": False},
        {"id": 2, "libelle": "Loyer", "categorie": "Logement", "regle": "egales",
         "actif": True, "ponctuel": False},
    ],
    "recurrents": [{"id": 9, "mode": "charge", "charge_id": 1, "actif": True, "compte_de": 1, "compte_vers": 2}],
    "lignes": {
        "1": {"montant_centimes": -125000, "fait_le": None, "fait_par": None},
        "2": {"montant_centimes": -80000, "fait_le": None, "fait_par": None},
    },
    "mouvements": [
        {"id": 100, "recurrent_id": None, "titre": "Virement Yann", "compte_de": None, "qui": "Yann",
         "compte_vers": 1, "montant_centimes": -30000, "fait_le": None, "fait_par": None},
        {"id": 101, "recurrent_id": None, "titre": "Virement Claudia", "compte_de": None, "qui": "Claudia",
         "compte_vers": 3, "montant_centimes": -20000, "fait_le": "2026-09-29T10:00:00Z", "fait_par": "Claudia"},
        {"id": 102, "recurrent_id": 9, "titre": "Crédit immo → Caisse d'Épargne", "compte_de": 1,
         "compte_vers": 2, "montant_centimes": -125000, "fait_le": None, "fait_par": None},
    ],
}


def _via_pont(etat):
    entree = json.dumps({"etat": etat})
    r = subprocess.run(["node", str(RACINE / "scripts" / "bot" / "virements_cli.mjs")],
                       input=entree, capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr[:400]
    return json.loads(r.stdout)


def _via_js_direct(etat):
    """Reproduit exactement ce que fait virements_cli.mjs (y compris l'ajout de fait_le par
    ligne et du libellé de virement par groupe, D-050 — calculés ici de la même façon plutôt
    que dans groupes-virements.js/libelle-virement.js, voir le commentaire du pont) : ce test
    confronte le PONT dans son ensemble, pas juste le moteur."""
    module_groupes = "file:///" + str(RACINE / "frontend" / "budget" / "groupes-virements.js").replace("\\", "/")
    module_libelle = "file:///" + str(RACINE / "frontend" / "budget" / "libelle-virement.js").replace("\\", "/")
    script = (
        f"Promise.all([import('{module_groupes}'), import('{module_libelle}')]).then(([m, l]) => {{"
        f"const etat = {json.dumps(etat)};"
        f"const faitLeDe = (x) => x.type === 'ligne' ? (etat.lignes[x.id]?.fait_le ?? null) "
        f": (etat.mouvements.find((mv) => mv.id === x.id)?.fait_le ?? null);"
        f"const mvtDuGroupe = (g) => etat.mouvements.find((mv) => mv.compte_vers === g.vers "
        f"&& (mv.compte_de ?? (mv.qui ? ('perso:' + mv.qui) : null)) === g.de);"
        f"const groupes = m.construireGroupes(etat).map(g => {{"
        f"const compteVers = etat.comptes.find((c) => c.id === g.vers) ?? null;"
        f"const mouvement = mvtDuGroupe(g);"
        f"return {{...g, bascule: m.preparerBasculeGroupe(g, etat.membres),"
        f"libelle: l.libelleEffectif(mouvement, compteVers),"
        f"libelleACompleter: l.libelleACompleter(mouvement, compteVers),"
        f"libelleModele: l.modeleLibelle(compteVers),"
        f"lignes: g.lignes.map((x) => ({{...x, fait_le: faitLeDe(x)}}))}};"
        f"}});"
        f"console.log(JSON.stringify({{groupes}}));"
        f"}})"
    )
    r = subprocess.run(["node", "--input-type=module", "-e", script],
                       capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr[:400]
    return json.loads(r.stdout)


def test_virements_cli_identique_a_l_appel_direct_du_frontend():
    du_pont = _via_pont(ETAT)
    du_direct = _via_js_direct(ETAT)
    assert du_pont == du_direct


def test_virements_cli_groupe_fait_en_dernier_logique_coherente():
    """Non-régression : un groupe entièrement fait garde son prénom commun et un cycle qui avance."""
    du_pont = _via_pont(ETAT)
    g_claudia = next(g for g in du_pont["groupes"] if g["vers"] == 3)
    assert g_claudia["fait"] is True
    assert g_claudia["prenom"] == "Claudia"
    # Cycle [null, Yann, Claudia] (blocs-cycle.js::suivante) : depuis "Claudia", le tour boucle à
    # "rien" — un 3e tap décoche le groupe, il ne saute pas directement à Yann.
    assert g_claudia["bascule"]["valeurCible"] is None, "cycle du groupe déjà fait par le dernier membre : reboucle à rien"
