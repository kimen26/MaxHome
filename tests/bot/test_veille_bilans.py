"""Tests hors ligne de la veille des RDV bilans : lecteur de page, outil, décision pure, passage complet."""
import logging
from datetime import datetime

import pytest

import veille_bilans as vb
from mocks_ecole import ORIGINE, SessionEcole
from outils import ecole_pages as pages
from outils import espace_parent as ep
from outils import registre
from outils.garde import ClientLecture, EcritureBloquee

URL = ORIGINE + ep.CHEMIN_BILANS
MAINTENANT = datetime(2026, 11, 14, 9, 0, 0)

_SECTION = ('<div class="section section-contactform" style="padding:50px;"><div class="container"><div class="row">'
            '<div class="col-sm-12 col-md-8 col-md-offset-2">{contenu}</div></div></div></div>')
FERMEE = _SECTION.format(contenu='<div class="equipe-title"><strong>Le tableau des rendez-vous semestriel est '
                                 'fermé pour le moment.</strong></div>')
OUVERTE = _SECTION.format(contenu='<table class="table"><tr><th>Date</th><th>Créneau</th></tr><tr><td>05/12/2026</td>'
                                  '<td><button type="submit">Inscription</button></td></tr></table>')
INCONNUE = "<html><body><h1>Connexion</h1></body></html>"


@pytest.fixture(autouse=True)
def registre_propre():
    avant = dict(registre._OUTILS)
    yield
    registre._OUTILS.clear()
    registre._OUTILS.update(avant)


def connexion_vers(html):
    def ouvrir():
        ep.assurer_inscrit(ORIGINE)
        return SessionEcole(pages={ep.CHEMIN_BILANS: html}), ORIGINE
    return ouvrir


# ---------- le parseur ----------
@pytest.mark.parametrize("html,attendu", [(FERMEE, "ferme"), (OUVERTE, "ouvert"), (INCONNUE, "inconnu")])
def test_etat_bilans(html, attendu):
    assert pages.etat_bilans(html) == attendu


def test_etat_bilans_ferme_sans_accent_ni_casse():
    assert pages.etat_bilans(_SECTION.format(contenu="<p>Tableau FERME</p>")) == "ferme"


# ---------- l'outil ----------
def test_l_outil_rend_l_etat_et_l_url():
    session, origine = connexion_vers(OUVERTE)()
    from outils import executer_lecture
    assert executer_lecture(ep.NOM_BILANS, session=session, origine=origine) == {"etat": "ouvert", "url": URL}


@pytest.mark.parametrize("chemin", ["/parent/facturation", "/parent/tableau/fleurs-plantes-lundi", "/parent/messagerie"])
def test_l_outil_bilans_refuse_un_autre_chemin(chemin):
    ep.assurer_inscrit(ORIGINE)
    session = SessionEcole()
    client = ClientLecture(session, ep.NOM_BILANS, registre._OUTILS[ep.NOM_BILANS].chemins)
    with pytest.raises(EcritureBloquee):
        client.get(ORIGINE + chemin)
    assert session.requetes == []


def test_les_autres_outils_ne_lisent_pas_la_page_des_bilans():
    ep.assurer_inscrit(ORIGINE)
    for nom in (ep.NOM_MESSAGES, ep.NOM_DOCUMENTS, ep.NOM_PHOTOS, ep.NOM_TOURS, ep.NOM_FICHIER):
        client = ClientLecture(SessionEcole(), nom, registre._OUTILS[nom].chemins)
        with pytest.raises(EcritureBloquee):
            client.get(URL)


# ---------- la décision pure ----------
def etat(valeur, echecs=0):
    return {"etat": valeur, "verifie": None, "echecs": echecs}


def tourner(ancien, lectures):
    """Enchaîne les lectures ; rend (état final, messages envoyés dans l'ordre)."""
    envoyes = []
    for lecture in lectures:
        ancien, messages = vb.decider(ancien, lecture, URL, MAINTENANT)
        envoyes += messages
    return ancien, envoyes


def test_ferme_puis_ouvert_envoie_le_lien():
    final, envoyes = tourner(etat("ferme"), ["ouvert"])
    assert envoyes == [f"Les inscriptions aux RDV bilans semestriels sont ouvertes sur l'espace parent : {URL}"]
    assert final["etat"] == "ouvert"


def test_ouvert_reste_ouvert_n_envoie_rien_de_plus():
    _, envoyes = tourner(etat("ferme"), ["ouvert", "ouvert", "ouvert"])
    assert len(envoyes) == 1


def test_ouvert_ferme_ouvert_renvoie_un_message():
    _, envoyes = tourner(etat("ferme"), ["ouvert", "ferme", "ouvert"])
    assert len(envoyes) == 2


def test_premier_lancement_deja_ouvert_previent():
    _, envoyes = tourner(vb.etat_initial(), ["ouvert"])
    assert len(envoyes) == 1


def test_premier_lancement_ferme_ne_dit_rien():
    final, envoyes = tourner(vb.etat_initial(), ["ferme"])
    assert envoyes == [] and final["etat"] == "ferme"


def test_trois_echecs_de_suite_donnent_une_seule_alerte_et_l_etat_est_conserve():
    final, envoyes = tourner(etat("ferme"), ["inconnu", None, "inconnu", None, "inconnu"])
    assert envoyes == [vb.MESSAGE_ILLISIBLE]
    assert final["etat"] == "ferme" and final["echecs"] == 5


def test_deux_echecs_ne_disent_rien():
    _, envoyes = tourner(etat("ferme"), ["inconnu", None])
    assert envoyes == []


def test_un_succes_remet_le_compteur_a_zero_et_l_alerte_peut_revenir():
    final, envoyes = tourner(etat("ferme"), ["inconnu", "inconnu", "ferme", "inconnu", "inconnu", "inconnu"])
    assert envoyes == [vb.MESSAGE_ILLISIBLE]
    final, envoyes = tourner(etat("ferme", 2), ["ferme"])
    assert final["echecs"] == 0 and envoyes == []


def test_un_echec_au_milieu_n_efface_pas_l_etat_ouvert_donc_pas_de_second_message():
    _, envoyes = tourner(etat("ferme"), ["ouvert", "inconnu", "ouvert"])
    assert len(envoyes) == 1


# ---------- la vérification complète (fichier, envoi, journal) ----------
def lancer(tmp_path, connexion, envoyes, envoyer=None):
    return vb.verifier(connexion, envoyer or envoyes.append, MAINTENANT, tmp_path / "veille.json")


def test_page_ouverte_envoie_et_memorise(tmp_path):
    envoyes = []
    assert lancer(tmp_path, connexion_vers(OUVERTE), envoyes) == 0
    assert envoyes == [vb.MESSAGE_OUVERT.format(url=URL)]
    assert vb.lire_etat(tmp_path / "veille.json") == {"etat": "ouvert", "verifie": "2026-11-14T09:00:00", "echecs": 0}
    assert lancer(tmp_path, connexion_vers(OUVERTE), envoyes) == 0
    assert len(envoyes) == 1


def test_page_fermee_ne_dit_rien(tmp_path):
    envoyes = []
    assert lancer(tmp_path, connexion_vers(FERMEE), envoyes) == 0
    assert envoyes == [] and vb.lire_etat(tmp_path / "veille.json")["etat"] == "ferme"


def test_connexion_en_erreur_compte_un_echec_sans_hote_dans_le_journal(tmp_path, caplog):
    def casse():
        raise ep.ErreurEspaceParent(f"panne sur {ORIGINE}")
    envoyes = []
    with caplog.at_level(logging.INFO, logger="veille_bilans"):
        assert [lancer(tmp_path, casse, envoyes) for _ in range(3)] == [0, 0, 0]
    assert envoyes == [vb.MESSAGE_ILLISIBLE]
    assert ORIGINE not in caplog.text and "ErreurEspaceParent" in caplog.text
    assert vb.lire_etat(tmp_path / "veille.json")["etat"] is None


def test_variables_non_posees_sortie_1_sans_message_ni_fichier(tmp_path):
    def non_configure():
        raise ep.EspaceParentNonConfigure("absentes")
    envoyes = []
    assert lancer(tmp_path, non_configure, envoyes) == 1
    assert envoyes == [] and not (tmp_path / "veille.json").exists()


def test_envoi_en_echec_garde_l_ancien_etat_pour_reessayer(tmp_path):
    def telegram_hs(_texte):
        raise RuntimeError("sendMessage échoué")
    assert lancer(tmp_path, connexion_vers(OUVERTE), [], envoyer=telegram_hs) == 2
    assert not (tmp_path / "veille.json").exists()
    envoyes = []
    assert lancer(tmp_path, connexion_vers(OUVERTE), envoyes) == 0 and len(envoyes) == 1
