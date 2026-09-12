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


# ---------- liste_taches groupée par moment (012_moment.sql) ----------
def _tache(id_, recurrent_id, titre, echeance="2026-09-07", rang=1, qui=None):
    return {"id": id_, "recurrent_id": recurrent_id, "titre": titre, "echeance": echeance,
            "rang": rang, "qui": qui, "parts_quart": 0}


def test_liste_taches_vide():
    assert reponses.liste_taches([], {}, "2026-09-07") == "Rien à faire aujourd'hui ✔"


def test_liste_taches_groupe_matin_avant_soir():
    recurrents = {1: {"parts_quart": 4, "moment": "soir"}, 2: {"parts_quart": 8, "moment": "matin"}}
    restantes = [_tache(10, 2, "Habiller"), _tache(11, 1, "Coucher")]
    txt = reponses.liste_taches(restantes, recurrents, "2026-09-07")
    lignes = txt.splitlines()
    assert lignes[0] == "À faire aujourd'hui :"
    assert lignes.index("Matin :") < lignes.index("Soir :")
    assert any("Habiller" in l for l in lignes[lignes.index("Matin :"):lignes.index("Soir :")])
    assert any("Coucher" in l for l in lignes[lignes.index("Soir :"):])


def test_liste_taches_sans_moment_pas_perdue_et_apres_matin_soir():
    recurrents = {1: {"parts_quart": 4, "moment": "matin"}, 2: {"parts_quart": 20, "moment": None},
                  3: {"parts_quart": 12}}  # pas de clé "moment" du tout (récurrent hors quotidien ancien)
    restantes = [_tache(10, 1, "Biberons"), _tache(11, 2, "Linge"), _tache(12, 3, "Poubelle")]
    txt = reponses.liste_taches(restantes, recurrents, "2026-09-07")
    assert "Linge" in txt and "Poubelle" in txt, "les tâches sans moment ne disparaissent pas"
    lignes = txt.splitlines()
    i_matin = lignes.index("Matin :")
    i_autres = lignes.index("Autres tâches :")
    assert i_matin < i_autres
    assert any("Biberons" in l for l in lignes[i_matin:i_autres])
    assert all("Linge" in l or "Poubelle" in l or l == "Autres tâches :" for l in lignes[i_autres:])


def test_liste_taches_uniquement_sans_moment_pas_de_bloc_matin_soir():
    recurrents = {2: {"parts_quart": 20, "moment": None}}
    restantes = [_tache(11, 2, "Linge")]
    txt = reponses.liste_taches(restantes, recurrents, "2026-09-07")
    assert "Matin :" not in txt and "Soir :" not in txt
    assert "Autres tâches :" in txt and "Linge" in txt


def test_liste_taches_garde_le_format_de_ligne():
    recurrents = {1: {"parts_quart": 8, "moment": "matin"}}
    restantes = [_tache(10, 1, "Vaisselle", echeance="2026-09-06", qui="Yann")]
    txt = reponses.liste_taches(restantes, recurrents, "2026-09-07")
    assert "  Vaisselle — 2 parts (Yann) ⚠️ en retard" in txt.splitlines()


# ---------- regroupement des occurrences à `fois` > 1 (D-023 étendu au bot) ----------
def test_liste_taches_fois_1_sans_compteur():
    """Une tâche prévue une seule fois garde son format exact, sans « (x/y) » parasite."""
    recurrents = {1: {"parts_quart": 4, "moment": "matin", "fois": 1}}
    restantes = [_tache(10, 1, "Petit déjeuner du petit")]
    txt = reponses.liste_taches(restantes, recurrents, "2026-09-07")
    assert "  Petit déjeuner du petit — 1 part" in txt.splitlines()


def test_liste_taches_fois_2_une_ligne_avec_compte():
    """Deux occurrences non faites du même récurrent/échéance : UNE ligne, compte 0/2."""
    recurrents = {1: {"parts_quart": 4, "moment": "matin", "fois": 2}}
    restantes = [_tache(10, 1, "Laver les biberons", rang=1), _tache(11, 1, "Laver les biberons", rang=2)]
    txt = reponses.liste_taches(restantes, recurrents, "2026-09-07")
    lignes = txt.splitlines()
    assert sum(1 for l in lignes if "Laver les biberons" in l) == 1, "pas de doublon"
    assert "  Laver les biberons — 1 part (0/2)" in lignes


def test_liste_taches_fois_2_partiellement_faite_affiche_1_sur_2():
    """Une seule occurrence restante sur les deux prévues : le compte lit 1 fait sur 2."""
    recurrents = {1: {"parts_quart": 4, "moment": "matin", "fois": 2}}
    restantes = [_tache(11, 1, "Brosser les dents du petit", rang=2)]
    txt = reponses.liste_taches(restantes, recurrents, "2026-09-07")
    assert "  Brosser les dents du petit — 1 part (1/2)" in txt.splitlines()


def test_liste_taches_fois_2_ne_touche_pas_qui_ni_retard():
    """Le compte se glisse entre le prénom et le marqueur de retard, sans les remplacer."""
    recurrents = {1: {"parts_quart": 8, "moment": "matin", "fois": 2}}
    restantes = [_tache(10, 1, "Faire à manger", echeance="2026-09-06", rang=1, qui="Yann")]
    txt = reponses.liste_taches(restantes, recurrents, "2026-09-07")
    assert "  Faire à manger — 2 parts (Yann) (1/2) ⚠️ en retard" in txt.splitlines()
