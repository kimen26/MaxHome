"""Tests hors ligne du carnet de voyage (D-045) : Nominatim, Claude et Telegram bouchonnés.

Aucun appel réseau : geocoder, voyages._meilleure_requete, voyages.reecrire_topo,
libre.interpreter_resa et telegram.Telegram sont toujours monkeypatchés ou remplacés
par des doublures. Miroir de test_dispatch_modules.py pour le style.
"""
import logging

import commandes
import pytest
import voyages as voyages_mod

import bot as bot_mod
from mocks import DonneesFausse

YANN = 6433455282

VOYAGES = [
    {"id": 1, "titre": "Islande", "lieu": "Islande", "debut": "2027-07-01", "fin": "2027-07-10"},
    {"id": 2, "titre": "Malaga", "lieu": "Malaga, Espagne", "debut": "2027-04-10", "fin": "2027-04-17"},
]


@pytest.fixture(autouse=True)
def pas_de_nominatim(monkeypatch):
    """Filet de sécurité : si un test oublie de bouchonner, geocoder échoue fort plutôt
    que de taper le vrai réseau."""
    def _interdit(*a, **k):
        raise AssertionError("geocoder() appelé sans bouchon dans un test pytest")
    monkeypatch.setattr(voyages_mod, "geocoder", _interdit)


def nouveau_bot(voyages=None):
    b = bot_mod.Bot.__new__(bot_mod.Bot)
    b.log = logging.getLogger("test-voyages")
    b.donnees = DonneesFausse(voyages=voyages if voyages is not None else [dict(v) for v in VOYAGES])
    b.telegram = None
    b.charges = []
    b.membres = ["Yann", "Claudia"]
    b.etats = {}
    return b


# ---------- grammaire ----------
@pytest.mark.parametrize("texte, attendu", [
    ("voyages", "voyages"), ("Voyages", "voyages"),
    ("voyage Islande", "voyage"), ("Voyage islande", "voyage"),
    ("lieu Islande Geysir", "lieu"),
    ("localise Islande", "localise"), ("Localisé Islande", "localise"),
    ("topo Islande", "topo"),
    ("resa Malaga vol ABC123", "resa_libre"),
    ("résa Malaga vol ABC123", "resa_libre"),
    ("réservation hôtel Malaga", "resa_libre"),
])
def test_grammaire_reconnait_les_commandes_voyage(texte, attendu):
    a = commandes.interpreter(texte, ["Yann", "Claudia"], [], 2026, 9)
    assert a["action"] == attendu


def test_voyage_capture_un_nom_multi_mots():
    # La grammaire normalise tout le texte (minuscules, sans accents) avant extraction,
    # comme les autres commandes : le fuzzy voyage matche indépendamment de la casse.
    a = commandes.interpreter("voyage Test bot ZZZ", ["Yann", "Claudia"], [], 2026, 9)
    assert a == {"action": "voyage", "nom": "test bot zzz"}


def test_lieu_capture_tout_le_reste_brut():
    a = commandes.interpreter("lieu Islande Cercle d'or", ["Yann", "Claudia"], [], 2026, 9)
    assert a["action"] == "lieu"
    assert "cercle d'or" in a["reste"]


# ---------- fuzzy voyage ----------
def test_trouver_voyage_insensible_accents_et_casse():
    v, proches = voyages_mod.trouver_voyage("malaga", VOYAGES)
    assert v["id"] == 2
    assert proches is None


def test_trouver_voyage_aucune_correspondance_donne_des_proches():
    v, proches = voyages_mod.trouver_voyage("Kayzedbjfoo", VOYAGES)
    assert v is None
    assert len(proches) <= 3


def test_separer_voyage_et_reste_avec_titre_multi_mots():
    # « zzz musee des confluences » (3 derniers mots) matche déjà le voyage en fuzzy
    # (SequenceMatcher tolère l'écart) : separer_voyage_et_reste essaie le préfixe le plus
    # long d'abord, donc coupe correctement dès que le préfixe complet est reconnu.
    voyages = [{"id": 9, "titre": "Test bot ZZZ Central"}]
    v, suite = voyages_mod.separer_voyage_et_reste("test bot zzz central musee des confluences", voyages)
    assert v["id"] == 9
    assert suite == "musee des confluences"


def test_separer_voyage_et_reste_voyage_introuvable():
    voyages = [{"id": 9, "titre": "Test bot ZZZ"}]
    v, proches = voyages_mod.separer_voyage_et_reste("bidule truc machin", voyages)
    assert v is None
    assert isinstance(proches, list)


# ---------- validation résa ----------
MEMBRES = ["Yann", "Claudia"]


def test_valider_resa_prix_virgule_convertit_en_centimes():
    champs = {"voyage": "Malaga", "type": "vol", "titre": "Vueling ABC123",
              "prix_centimes": 578.35, "paye_par": "Yann"}
    resa, erreur = voyages_mod.valider_resa(champs, VOYAGES, MEMBRES)
    assert erreur is None
    assert resa["prix_centimes"] == 578  # round(578.35) — le message envoie déjà des centimes entiers


def test_valider_resa_payeur_inconnu_refuse():
    champs = {"voyage": "Malaga", "type": "vol", "titre": "Vol", "paye_par": "Bidule"}
    resa, erreur = voyages_mod.valider_resa(champs, VOYAGES, MEMBRES)
    assert resa is None
    assert "Payeur inconnu" in erreur


def test_valider_resa_type_inconnu_refuse():
    champs = {"voyage": "Malaga", "type": "fusée", "titre": "Vol"}
    resa, erreur = voyages_mod.valider_resa(champs, VOYAGES, MEMBRES)
    assert resa is None
    assert "Type de réservation inconnu" in erreur


def test_valider_resa_voyage_introuvable_refuse():
    champs = {"voyage": "Kazembourg", "type": "vol", "titre": "Vol"}
    resa, erreur = voyages_mod.valider_resa(champs, VOYAGES, MEMBRES)
    assert resa is None
    assert "Aucun voyage" in erreur


def test_valider_resa_titre_manquant_refuse():
    champs = {"voyage": "Malaga", "type": "vol"}
    resa, erreur = voyages_mod.valider_resa(champs, VOYAGES, MEMBRES)
    assert resa is None
    assert "Titre" in erreur


def test_valider_resa_prix_negatif_refuse():
    champs = {"voyage": "Malaga", "type": "vol", "titre": "Vol", "prix_centimes": -100}
    resa, erreur = voyages_mod.valider_resa(champs, VOYAGES, MEMBRES)
    assert resa is None
    assert "négatif" in erreur


def test_libre_sans_fences_retire_les_blocs_markdown():
    """Régression : `claude -p` encadre parfois sa réponse de ```json ... ``` malgré la
    consigne, et json.loads plantait alors silencieusement (repli sur {"action": "inconnu"})."""
    import libre
    assert libre._sans_fences('```json\n{"a": 1}\n```') == '{"a": 1}'
    assert libre._sans_fences('{"a": 1}') == '{"a": 1}'


def test_valider_resa_sans_prix_ni_payeur_accepte():
    champs = {"voyage": "Malaga", "type": "logement", "titre": "Hôtel"}
    resa, erreur = voyages_mod.valider_resa(champs, VOYAGES, MEMBRES)
    assert erreur is None
    assert resa["prix_centimes"] is None and resa["paye_par"] is None


def test_valider_resa_type_repas_accepte_et_deduit_le_poste():
    champs = {"voyage": "Malaga", "type": "repas", "titre": "Repas sur place", "prix_centimes": 4000}
    resa, erreur = voyages_mod.valider_resa(champs, VOYAGES, MEMBRES)
    assert erreur is None
    assert resa["type"] == "repas" and resa["poste"] == "repas"


def test_valider_resa_poste_explicite_prime_sur_la_deduction():
    champs = {"voyage": "Malaga", "type": "vol", "titre": "Vol", "poste": "sur_place"}
    resa, erreur = voyages_mod.valider_resa(champs, VOYAGES, MEMBRES)
    assert erreur is None
    assert resa["poste"] == "sur_place"


def test_valider_resa_poste_inconnu_refuse():
    champs = {"voyage": "Malaga", "type": "vol", "titre": "Vol", "poste": "loisirs"}
    resa, erreur = voyages_mod.valider_resa(champs, VOYAGES, MEMBRES)
    assert resa is None
    assert "Poste de budget inconnu" in erreur


# ---------- géocodage et Claude bouchonnés ----------
def test_ajouter_lieu_avec_position(monkeypatch):
    monkeypatch.setattr(voyages_mod, "geocoder",
                         lambda requete: {"lat": 39.0, "lng": -0.5, "adresse": "Malaga, Espagne"})
    donnees = DonneesFausse(voyages=[dict(VOYAGES[1])])
    lieu = voyages_mod.ajouter_lieu(donnees, VOYAGES[1], "Alcazaba", "Yann")
    assert lieu["lat"] == 39.0 and lieu["adresse"] == "Malaga, Espagne"
    assert lieu["cree_par"] == "Yann" and lieu["statut"] == "idee" and lieu["categorie"] == "a_voir"


def test_ajouter_lieu_sans_position(monkeypatch):
    monkeypatch.setattr(voyages_mod, "geocoder", lambda requete: None)
    donnees = DonneesFausse(voyages=[dict(VOYAGES[1])])
    lieu = voyages_mod.ajouter_lieu(donnees, VOYAGES[1], "Zzqx introuvable", "Yann")
    assert lieu["lat"] is None


def test_localiser_manquants_reussit_au_premier_essai(monkeypatch):
    monkeypatch.setattr(voyages_mod, "geocoder",
                         lambda requete: {"lat": 1.0, "lng": 2.0, "adresse": "Trouvé"})
    donnees = DonneesFausse(voyages=[dict(VOYAGES[1])])
    donnees.creer_lieu({"voyage_id": 2, "nom": "Alcazaba", "categorie": "a_voir", "statut": "idee"})
    n, restants = voyages_mod.localiser_manquants(donnees, VOYAGES[1])
    assert n == 1 and restants == []


def test_localiser_manquants_repli_claude_puis_reessai(monkeypatch):
    """Nominatim échoue toujours en direct ; la requête reformulée par Claude, elle, trouve."""
    def geocoder_faux(requete):
        return {"lat": 5.0, "lng": 6.0, "adresse": "Trouvé via Claude"} if "officiel" in requete else None
    monkeypatch.setattr(voyages_mod, "geocoder", geocoder_faux)
    monkeypatch.setattr(voyages_mod, "_meilleure_requete", lambda nom, voyage: "nom officiel, ville, pays")
    donnees = DonneesFausse(voyages=[dict(VOYAGES[1])])
    donnees.creer_lieu({"voyage_id": 2, "nom": "Truc", "categorie": "a_voir", "statut": "idee"})
    n, restants = voyages_mod.localiser_manquants(donnees, VOYAGES[1])
    assert n == 1 and restants == []


def test_localiser_manquants_rien_trouve_meme_apres_claude(monkeypatch):
    monkeypatch.setattr(voyages_mod, "geocoder", lambda requete: None)
    monkeypatch.setattr(voyages_mod, "_meilleure_requete", lambda nom, voyage: None)
    donnees = DonneesFausse(voyages=[dict(VOYAGES[1])])
    donnees.creer_lieu({"voyage_id": 2, "nom": "Zzqx introuvable", "categorie": "a_voir", "statut": "idee"})
    n, restants = voyages_mod.localiser_manquants(donnees, VOYAGES[1])
    assert n == 0 and restants == ["Zzqx introuvable"]


# ---------- précision Nominatim (L-042) ----------
def test_lieu_assez_precis_rejette_un_resultat_ville():
    """addresstype 'city' : Nominatim n'a retourné que la ville, pas le lieu cherché."""
    trouve = {"lat": 1.0, "lng": 2.0, "adresse": "Lyon, France", "addresstype": "city",
              "place_rank": 16, "nom": "Lyon"}
    assert voyages_mod._lieu_assez_precis(trouve, "Zzqx introuvable") is False


def test_lieu_assez_precis_rejette_sur_place_rank_bas():
    trouve = {"lat": 1.0, "lng": 2.0, "adresse": "Rhône, France", "addresstype": "county",
              "place_rank": 12, "nom": "Rhône"}
    assert voyages_mod._lieu_assez_precis(trouve, "Un lieu quelconque") is False


def test_lieu_assez_precis_exception_nom_designe_la_ville():
    """Le voyage cherche « Annecy » et Nominatim renvoie la ville Annecy elle-même :
    le nom cherché EST ce lieu, le centroïde est donc le bon point."""
    trouve = {"lat": 45.90, "lng": 6.12, "adresse": "Annecy, France", "addresstype": "town",
              "place_rank": 16, "nom": "Annecy"}
    assert voyages_mod._lieu_assez_precis(trouve, "Annecy") is True


def test_lieu_assez_precis_accepte_un_resultat_precis():
    trouve = {"lat": 1.0, "lng": 2.0, "adresse": "Musée, Malaga", "addresstype": "museum",
              "place_rank": 30, "nom": "Musée"}
    assert voyages_mod._lieu_assez_precis(trouve, "Musée") is True


def test_ajouter_lieu_rejette_un_resultat_trop_vague(monkeypatch):
    """Nominatim ne renvoie que la ville : le lieu est inséré sans position plutôt que sur
    un point faux (L-042 : un point faux sur la carte est pire que sans position)."""
    monkeypatch.setattr(voyages_mod, "geocoder", lambda requete: {
        "lat": 45.75, "lng": 4.85, "adresse": "Lyon, France", "addresstype": "city",
        "place_rank": 16, "nom": "Lyon",
    })
    donnees = DonneesFausse(voyages=[dict(VOYAGES[1])])
    lieu = voyages_mod.ajouter_lieu(donnees, VOYAGES[1], "Zzqx introuvable", "Yann")
    assert lieu["lat"] is None


def test_localiser_manquants_repli_claude_vide_laisse_sans_position(monkeypatch):
    """Claude ne reconnaît pas le lieu : il répond une chaîne vide (traduite en None par
    _meilleure_requete) -> on s'arrête, le lieu reste sans position (jamais replié sur la
    ville/le pays de destination)."""
    monkeypatch.setattr(voyages_mod, "geocoder", lambda requete: None)
    monkeypatch.setattr(voyages_mod, "_meilleure_requete", lambda nom, voyage: None)
    donnees = DonneesFausse(voyages=[dict(VOYAGES[1])])
    donnees.creer_lieu({"voyage_id": 2, "nom": "Zzqx introuvable", "categorie": "a_voir", "statut": "idee"})
    n, restants = voyages_mod.localiser_manquants(donnees, VOYAGES[1])
    assert n == 0 and restants == ["Zzqx introuvable"]


def test_localiser_manquants_resultat_trop_vague_le_dit(monkeypatch):
    """Nominatim (direct puis via Claude) ne renvoie que la ville : compté comme un échec,
    et le message distingue ce cas de « rien trouvé du tout »."""
    def geocoder_faux(requete):
        return {"lat": 45.75, "lng": 4.85, "adresse": "Lyon, France", "addresstype": "city",
                "place_rank": 16, "nom": "Lyon"}
    monkeypatch.setattr(voyages_mod, "geocoder", geocoder_faux)
    monkeypatch.setattr(voyages_mod, "_meilleure_requete", lambda nom, voyage: "Lyon, France")
    donnees = DonneesFausse(voyages=[dict(VOYAGES[1])])
    donnees.creer_lieu({"voyage_id": 2, "nom": "Zzqx introuvable", "categorie": "a_voir", "statut": "idee"})
    n, restants = voyages_mod.localiser_manquants(donnees, VOYAGES[1])
    assert n == 0
    assert len(restants) == 1
    assert "Zzqx introuvable" in restants[0]
    assert "trouvé seulement la ville" in restants[0]


# ---------- dispatch bot (actions.voyages) : Claude et Nominatim bouchonnés ----------
def test_action_voyage_liste_resas_et_lieux_du_jour(monkeypatch):
    b = nouveau_bot()
    b.donnees.creer_resa({"voyage_id": 2, "type": "vol", "titre": "Vueling",
                           "debut": "2026-04-10T12:10:00", "code": "ABC123",
                           "prix_centimes": 57835, "paye_par": "Yann", "statut": "reserve"})
    r = b.traiter_message(YANN, "voyage Malaga")
    assert "Malaga" in r and "ABC123" in r and "57" in r.replace(",", "") and "Yann" in r


def test_action_voyage_commence_par_le_resume_puis_le_budget():
    """V2 (D-047) : la fiche bot ouvre sur le résumé, puis « Budget : engagé / prévu »."""
    b = nouveau_bot()
    b.donnees.creer_bloc({"voyage_id": 2, "type": "resume", "texte": "Séjour à Malaga en famille.", "ordre": -1})
    b.donnees._enveloppes.append({"voyage_id": 2, "poste": "transport", "prevu_centimes": 30000})
    b.donnees.creer_resa({"voyage_id": 2, "type": "vol", "titre": "Vueling",
                           "prix_centimes": 20000, "statut": "reserve"})
    r = b.traiter_message(YANN, "voyage Malaga")
    lignes = r.split("\n")
    assert lignes[0].startswith("Malaga")
    assert lignes[1] == "Séjour à Malaga en famille."
    assert "Budget" in lignes[2] and "200,00" in lignes[2] and "300,00" in lignes[2]


def test_action_voyage_sans_resume_ni_budget_ne_les_affiche_pas():
    b = nouveau_bot()
    r = b.traiter_message(YANN, "voyage Malaga")
    assert "Budget" not in r


def test_action_voyages_liste_a_venir():
    b = nouveau_bot()
    r = b.traiter_message(YANN, "voyages")
    assert "Islande" in r or "Malaga" in r


def test_action_lieu_ajoute_avec_geocodage(monkeypatch):
    monkeypatch.setattr(voyages_mod, "geocoder",
                         lambda requete: {"lat": 39.0, "lng": -0.5, "adresse": "Musée, Malaga"})
    b = nouveau_bot()
    r = b.traiter_message(YANN, "lieu Malaga Musée")
    assert "Musée, Malaga" in r
    assert len(b.donnees.lieux_voyage(2)) == 1


def test_action_lieu_sans_position_le_dit(monkeypatch):
    monkeypatch.setattr(voyages_mod, "geocoder", lambda requete: None)
    b = nouveau_bot()
    r = b.traiter_message(YANN, "lieu Malaga Zzqx introuvable")
    assert "sans position" in r


def test_action_localise_annonce_le_resultat(monkeypatch):
    monkeypatch.setattr(voyages_mod, "geocoder",
                         lambda requete: {"lat": 1.0, "lng": 2.0, "adresse": "Trouvé"})
    b = nouveau_bot()
    b.donnees.creer_lieu({"voyage_id": 2, "nom": "Alcazaba", "categorie": "a_voir", "statut": "idee"})
    r = b.traiter_message(YANN, "localise Malaga")
    assert "localisé" in r


def test_action_topo_demande_confirmation_avant_ecriture(monkeypatch):
    """V2 (D-047) : `topo` réécrit désormais le SEUL bloc `resume`, jamais voyages.topo."""
    monkeypatch.setattr(voyages_mod, "reecrire_topo", lambda donnees, voyage: "Résumé\n- alerte")
    b = nouveau_bot()
    r = b.traiter_message(YANN, "topo Malaga")
    assert "oui/non" in r.lower()
    assert b.donnees.bloc_resume(2) is None, "rien écrit avant confirmation"
    r2 = b.traiter_message(YANN, "oui")
    assert "enregistré" in r2.lower()
    bloc = b.donnees.bloc_resume(2)
    assert bloc["texte"] == "Résumé\n- alerte"
    assert bloc["type"] == "resume"


def test_action_topo_reecrit_le_bloc_resume_existant(monkeypatch):
    """Un second `topo` met à jour le même bloc plutôt que d'en créer un second (au plus un
    resume par voyage, D-047)."""
    monkeypatch.setattr(voyages_mod, "reecrire_topo", lambda donnees, voyage: "Nouveau résumé")
    b = nouveau_bot()
    b.donnees.creer_bloc({"voyage_id": 2, "type": "resume", "texte": "Ancien résumé", "ordre": -1})
    b.traiter_message(YANN, "topo Malaga")
    b.traiter_message(YANN, "oui")
    blocs_resume = [x for x in b.donnees._blocs if x["voyage_id"] == 2 and x["type"] == "resume"]
    assert len(blocs_resume) == 1
    assert blocs_resume[0]["texte"] == "Nouveau résumé"


def test_action_topo_refuse_sur_non(monkeypatch):
    monkeypatch.setattr(voyages_mod, "reecrire_topo", lambda donnees, voyage: "Résumé")
    b = nouveau_bot()
    b.traiter_message(YANN, "topo Malaga")
    r = b.traiter_message(YANN, "non")
    assert "rien fait" in r.lower()
    assert b.donnees.bloc_resume(2) is None


def test_resa_libre_confirmation_puis_insertion(monkeypatch):
    interp = {"voyage": "Malaga", "type": "vol", "titre": "Vueling ABC123",
              "debut": "2026-04-10 12:10", "prix_centimes": 57835, "paye_par": "Yann"}
    monkeypatch.setattr(voyages_mod, "extraire_resa", lambda message, voyages, membres, timeout=60: interp)
    b = nouveau_bot()
    r = b.traiter_message(YANN, "resa Malaga vol Vueling ABC123 578,35 payé Yann 10/04 12h10")
    assert "oui/non" in r.lower()
    assert b.donnees.resas_voyage(2) == []
    r2 = b.traiter_message(YANN, "oui")
    assert "enregistrée" in r2.lower()
    resas = b.donnees.resas_voyage(2)
    assert len(resas) == 1 and resas[0]["prix_centimes"] == 57835 and resas[0]["paye_par"] == "Yann"


def test_resa_libre_payeur_invalide_ne_propose_pas_de_confirmation(monkeypatch):
    interp = {"voyage": "Malaga", "type": "vol", "titre": "Vol", "paye_par": "Fantome"}
    monkeypatch.setattr(voyages_mod, "extraire_resa", lambda message, voyages, membres, timeout=60: interp)
    b = nouveau_bot()
    r = b.traiter_message(YANN, "resa Malaga vol payé par Fantome")
    assert "Payeur inconnu" in r
    assert "attente_voyage" not in b.etats.get(YANN, {})


def test_annuler_apres_ajout_de_lieu_le_supprime(monkeypatch):
    monkeypatch.setattr(voyages_mod, "geocoder",
                         lambda requete: {"lat": 1.0, "lng": 2.0, "adresse": "X"})
    b = nouveau_bot()
    b.traiter_message(YANN, "lieu Malaga Alcazaba")
    assert len(b.donnees.lieux_voyage(2)) == 1
    assert b.traiter_message(YANN, "annuler") == "Dernière écriture annulée."
    assert b.donnees.lieux_voyage(2) == []


# ---------- pièce jointe : Telegram bouchonné ----------
class TelegramAvecFichier:
    def __init__(self, contenu=b"donnees-binaires", chemin="photos/file_1.jpg"):
        self._contenu = contenu
        self._chemin = chemin

    def telecharger_fichier(self, file_id, timeout=60):
        return self._contenu, self._chemin


def test_traiter_piece_photo_avec_legende_reconnue():
    b = nouveau_bot()
    b.telegram = TelegramAvecFichier()
    msg = {"chat": {"id": 1}, "from": {"id": YANN}, "caption": "Malaga",
           "photo": [{"file_id": "small"}, {"file_id": "big"}]}
    r = b.traiter_piece(YANN, msg)
    assert "Malaga" in r
    assert len(b.donnees._pieces) == 1
    assert b.donnees._pieces[0]["voyage_id"] == 2


def test_traiter_piece_sans_legende_ne_range_rien():
    b = nouveau_bot()
    b.telegram = TelegramAvecFichier()
    msg = {"chat": {"id": 1}, "from": {"id": YANN}, "photo": [{"file_id": "big"}]}
    r = b.traiter_piece(YANN, msg)
    assert "quel voyage" in r.lower()
    assert b.donnees._pieces == []


def test_traiter_piece_upload_echoue_efface_l_objet(monkeypatch):
    b = nouveau_bot()
    b.telegram = TelegramAvecFichier()

    def creer_piece_qui_echoue(champs):
        raise RuntimeError("insert échoué")
    monkeypatch.setattr(b.donnees, "creer_piece", creer_piece_qui_echoue)
    with pytest.raises(RuntimeError):
        b.traiter_piece(YANN, {"chat": {"id": 1}, "from": {"id": YANN}, "caption": "Malaga",
                                "photo": [{"file_id": "big"}]})
    assert b.donnees._stockage == {}, "l'objet uploadé a bien été supprimé après l'échec de l'insert"
