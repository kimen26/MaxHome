"""Tests hors ligne de la veille de l'école (D-073) : nouveautés, premier passage, annonce, échecs, passage complet.
Données fictives : aucun nom, aucune adresse réels."""
from datetime import date, datetime

import pytest

import veille_ecole as ve
from mocks_ecole import ORIGINE, SessionEcole
from mocks_ecole import CHAT, DOCUMENTS, MESSAGERIE, PHOTOS
from outils import espace_parent as ep
from outils import registre

AUJ = date(2026, 11, 27)
MAINTENANT = datetime(2026, 11, 27, 12, 30)


@pytest.fixture(autouse=True)
def registre_propre():
    avant = dict(registre._OUTILS)
    yield
    registre._OUTILS.clear()
    registre._OUTILS.update(avant)


def mail(id_, jour="25/11/2026", objet="Sortie au parc"):
    return {"id": id_, "date": jour, "de": "Mme Fictive", "objet": objet, "texte": "Merci d'apporter des bottes."}


def message(jour="2026-11-26", texte="Max a bien mangé.", expediteur="Hélène"):
    return {"date": jour, "heure": "16:00", "expediteur": expediteur, "texte": texte}


def photo(nom, jour="2026-11-26"):
    return {"date": jour, "titre": "Atelier peinture", "url": f"{ORIGINE}/upload/photo_video/{nom}", "genre": "photo"}


# ---------- décision ----------
def test_premier_passage_annonce_la_derniere_semaine_et_marque_le_reste_vu():
    trouves = ve.elements([mail("a1", "25/11/2026"), mail("a0", "01/10/2026")], [], [], [photo("p.jpg", "")])
    nouveaux, vus = ve.decider({"vus": None}, trouves, AUJ)
    assert [e["objet"] for e in nouveaux] == ["Sortie au parc"] and len(nouveaux) == 1
    assert len(vus) == 3  # l'ancien mail et la photo sans date sont vus, pas annoncés


def test_un_element_deja_vu_n_est_pas_reannonce():
    trouves = ve.elements([mail("a1")], [message()], [], [])
    _, vus = ve.decider({"vus": None}, trouves, AUJ)
    nouveaux, vus2 = ve.decider({"vus": vus}, trouves, AUJ)
    assert nouveaux == [] and vus2 == vus


def test_apres_le_premier_passage_une_photo_sans_date_est_nouvelle():
    nouveaux, _ = ve.decider({"vus": []}, ve.elements([], [], [], [photo("sacs.jpg", "")]), AUJ)
    assert len(nouveaux) == 1


def test_nos_propres_messages_ne_sont_pas_des_nouveautes():
    assert ve.elements([], [message(expediteur="nous")], [], []) == []


def test_les_empreintes_ne_contiennent_aucun_texte_lu():
    trouves = ve.elements([mail("a1")], [message(texte="Secret fictif")], [], [photo("peinture.jpg")])
    _, vus = ve.decider({"vus": None}, trouves, AUJ)
    assert all(len(v) == 20 and "Secret" not in v and "peinture" not in v for v in vus)


def test_les_vus_restent_bornes():
    vieux = [f"x{i}" for i in range(ve.VUS_MAX)]
    _, vus = ve.decider({"vus": vieux}, ve.elements([mail("neuf")], [], [], []), AUJ)
    assert len(vus) == ve.VUS_MAX and vus[-1] != "x599" and "x0" not in vus


# ---------- annonce ----------
def test_annonce_resume_les_ecrits_et_compte_les_photos():
    nouveaux = ve.elements([mail("a1")], [], [], [photo("1.jpg"), photo("2.jpg")])
    vu = {}

    def resumer(contenu, question):
        vu["contenu"] = contenu
        return "Sortie au parc vendredi : bottes."
    texte = ve.texte_annonce(nouveaux, resumer)
    assert texte.startswith(ve.TITRE) and "bottes" in texte and "2 nouvelles photos" in texte
    assert "Objet : Sortie au parc" in vu["contenu"]


def test_si_le_resume_echoue_la_liste_brute_part_quand_meme():
    from outils.resume import ECHEC
    texte = ve.texte_annonce(ve.elements([mail("a1")], [message()], [], []), lambda c, q: ECHEC)
    assert "• Mail du 25/11 (Mme Fictive) : Sortie au parc" in texte and "• Message du 26/11 (Hélène)" in texte


def test_resume_qui_plante_ne_bloque_pas_l_annonce():
    def plante(c, q):
        raise RuntimeError("claude absent")
    assert "Sortie au parc" in ve.texte_annonce(ve.elements([mail("a1")], [], [], []), plante)


def test_rien_de_neuf_rien_a_dire():
    assert ve.texte_annonce([], lambda c, q: "x") is None


def test_alerte_une_seule_fois_apres_trois_echecs():
    etat, alertes_vues = {"echecs": {}}, []
    for _ in range(5):
        echecs, alertes = ve.compter_echecs(etat, {ve.MAILS: False, ve.ESPACE: True})
        etat, alertes_vues = {"echecs": echecs}, alertes_vues + alertes
    assert len(alertes_vues) == 1 and "boîte mail" in alertes_vues[0]
    assert ve.compter_echecs(etat, {ve.MAILS: True})[0][ve.MAILS] == 0


# ---------- passage complet (faux espace parent) ----------
def ouvrir_faux():
    ep.assurer_inscrit(ORIGINE)
    pages = {ep.CHEMIN_MESSAGERIE: MESSAGERIE, ep.CHEMIN_MESSAGERIE + "/7": CHAT,
             ep.CHEMIN_DOCUMENTS: DOCUMENTS, ep.CHEMIN_PHOTOS: PHOTOS}
    return SessionEcole(pages=pages), ORIGINE


def lancer(tmp_path, envoyer=None, lire_mails=lambda: [mail("a1", "07/11/2026")], quand=datetime(2026, 11, 8, 12, 30)):
    postes, fichiers = [], []
    code = ve.passer(lire_mails,
                     lambda: ve.lire_espace(ouvrir_faux),
                     envoyer or postes.append, fichiers.append, lambda c, q: "Résumé fictif.",
                     lambda medias, s, o: [{"nom": "f.jpg", "contenu": b"x", "genre": "photo", "legende": ""}],
                     quand, chemin_etat=tmp_path / "etat.json")
    return code, postes, fichiers


def test_passage_complet_poste_puis_se_tait_au_passage_suivant(tmp_path):
    code, postes, fichiers = lancer(tmp_path)
    assert code == 0 and postes[0].startswith(ve.TITRE) and "photo" in postes[0] and fichiers
    code, postes, fichiers = lancer(tmp_path)
    assert code == 0 and postes == [] and fichiers == []


def test_envoi_rate_rien_n_est_marque_vu(tmp_path):
    def casse(texte):
        raise RuntimeError("réseau")
    assert lancer(tmp_path, envoyer=casse)[0] == 2
    assert not (tmp_path / "etat.json").exists()
    code, postes, _ = lancer(tmp_path)
    assert code == 0 and postes  # retenté : la nouveauté part enfin


def test_mails_illisibles_l_espace_parent_est_quand_meme_annonce(tmp_path):
    code, postes, _ = lancer(tmp_path, lire_mails=lambda: None)  # boîte mail illisible
    assert code == 0 and postes and ve.lire_etat(tmp_path / "etat.json")["echecs"][ve.MAILS] == 1


def test_espace_non_configure_n_est_pas_une_panne(tmp_path):
    etat = {"vus": [], "echecs": {}}
    ve.ecrire_etat(tmp_path / "etat.json", etat)

    def non_configure():
        raise ep.EspaceParentNonConfigure("absent")
    code = ve.passer(lambda: [], lambda: ve.lire_espace(non_configure), lambda t: None, lambda f: None,
                     lambda c, q: "", lambda m, s, o: [], MAINTENANT, chemin_etat=tmp_path / "etat.json")
    assert code == 0 and ve.lire_etat(tmp_path / "etat.json")["echecs"][ve.ESPACE] == 0


def test_destination_groupe_sinon_yann():
    class D:
        def __init__(self, groupe):
            self.groupe = groupe

        def parametre(self, cle):
            return self.groupe if cle == ve.CLE_GROUPE else None

        def telegram_id_de(self, prenom):
            return 42 if prenom == "Yann" else None
    assert ve.destination(D("-1001")) == -1001
    assert ve.destination(D(None)) == 42
