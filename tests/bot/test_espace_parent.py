"""Tests hors ligne du lot 4 : l'espace parent de l'école (lecture seule). HTML fictif, réseau simulé.
Parseurs, garde (POST et chemins hors liste, Facturation), connexion (seul POST), outils du registre.
"""
import json
import logging
from datetime import date

import pytest

from mocks_ecole import (AUTRE_ENFANT, AUTRE_ENFANT_2, CHAT, DOCUMENTS, ENCAS, FLEURS, ORIGINE, PAGES, PHOTOS,
                         Reponse, SessionEcole)
from outils import ecole_pages as pages
from outils import espace_parent as ep
from outils import executer_lecture, registre
from outils.garde import ClientLecture, EcritureBloquee

AUJOURDHUI = date(2026, 11, 13)
NOMS_OUTILS = (ep.NOM_MESSAGES, ep.NOM_DOCUMENTS, ep.NOM_PHOTOS, ep.NOM_TOURS, ep.NOM_FICHIER)


@pytest.fixture(autouse=True)
def registre_propre(monkeypatch):
    avant = dict(registre._OUTILS)
    monkeypatch.setattr(ep, "aujourdhui", lambda: AUJOURDHUI)
    yield
    registre._OUTILS.clear()
    registre._OUTILS.update(avant)


def lire(session, nom, **args):
    ep.assurer_inscrit(ORIGINE)
    return executer_lecture(nom, session=session, origine=ORIGINE, **args)


# ---------- parseurs ----------
def test_photos_une_ligne_un_media_avec_date_titre_url_et_genre():
    medias = pages.parser_photos(PHOTOS, ORIGINE)
    assert [m["date"] for m in medias] == ["2026-11-05"] * 3 + ["2026-10-16", ""]
    assert medias[0] == {"date": "2026-11-05", "titre": "Les enfants peignent.", "genre": "photo",
                         "url": f"{ORIGINE}/upload/photo_video/peinture%201.jpg"}
    assert medias[2]["genre"] == "video"
    assert medias[4]["titre"] == "Sacs oubliés"  # sans date, le titre est dans la première colonne


def test_documents_datés_seulement_titre_sans_le_nom_de_l_enfant_le_plus_récent_d_abord():
    docs = pages.parser_documents(DOCUMENTS, ORIGINE)
    assert [d["titre"] for d in docs] == ["Calendrier annuel 2026/2027", "Liste de fournitures (2/2)"]
    assert docs[0]["date"] == "2026-11-06"
    assert docs[0]["url"] == f"{ORIGINE}/upload/document/Calendrier%202026%3A2027.pdf"
    assert "DUPONDT" not in json.dumps(docs, ensure_ascii=False)  # le formulaire généré (sans date) est écarté


def test_chats_et_messages_nous_nom_affiché_doublons_et_sans_nom_de_famille():
    assert pages.parser_chats(PAGES["/parent/messagerie"], ORIGINE) == [f"{ORIGINE}/parent/messagerie/7"]
    messages = pages.parser_messages(CHAT)
    assert [(m["date"], m["heure"], m["expediteur"]) for m in messages] == [
        ("2026-11-03", "21:53", "nous"), ("2026-11-02", "08:27", "nous"),  # un parent (nom de famille en capitales)
        ("2026-10-08", "18:54", "Hélène"), ("2026-07-01", "11:53", "l'école")]  # le doublon est écarté
    assert "DUPONDT" not in json.dumps(messages, ensure_ascii=False)


def test_fleurs_nous_libre_pris_jamais_un_prenom():
    tours = {t["date"]: t for t in pages.parser_fleurs(FLEURS)}
    assert (tours["2026-11-16"]["pris"], tours["2026-11-16"]["libres"], tours["2026-11-16"]["nous"]) == (2, 0, False)
    assert tours["2026-11-23"]["libres"] == 1
    assert tours["2026-12-07"]["nous"] is True       # « Se désinscrire » = notre tour
    assert tours["2026-12-14"]["nous"] is True       # notre prénom en clair
    texte = json.dumps(list(tours.values()), ensure_ascii=False)
    assert AUTRE_ENFANT not in texte and AUTRE_ENFANT_2 not in texte


def test_encas_fullcalendar_aliment_places_libres_et_notre_tour():
    tours = {t["date"]: t for t in pages.parser_encas(ENCAS)}
    assert tours["2026-11-17"] == {"date": "2026-11-17", "aliment": "Pommes", "nous": False, "libres": 0, "pris": 1}
    assert (tours["2026-11-24"]["libres"], tours["2026-11-24"]["pris"]) == (2, 0)
    assert tours["2026-11-26"]["nous"] is True and tours["2026-11-26"]["aliment"] == "Clémentines"
    assert AUTRE_ENFANT not in json.dumps(list(tours.values()), ensure_ascii=False)


def test_page_changee_rend_des_listes_vides_pas_une_erreur():
    for parser in (pages.parser_fleurs, pages.parser_encas, pages.parser_messages):
        assert parser("<html><body>rien</body></html>") == []
    assert pages.parser_photos("<html></html>", ORIGINE) == []


# ---------- les outils ----------
def test_messages_documents_photos_par_le_registre():
    session = SessionEcole()
    assert [m["expediteur"] for m in lire(session, ep.NOM_MESSAGES, maximum=2)] == ["nous", "nous"]
    assert lire(session, ep.NOM_DOCUMENTS, maximum=1)[0]["titre"] == "Calendrier annuel 2026/2027"
    assert len(lire(session, ep.NOM_PHOTOS)) == 5
    assert set(session.methodes()) == {"GET"}
    assert all(kwargs["allow_redirects"] is False for _, _, kwargs in session.requetes)  # aucune redirection suivie


def test_tours_seulement_a_partir_d_aujourd_hui_et_aucun_prenom():
    tours = lire(SessionEcole(), ep.NOM_TOURS)
    assert [t["date"] for t in tours["fleurs"]] == ["2026-11-16", "2026-11-23", "2026-12-07", "2026-12-14"]
    assert [t["date"] for t in tours["encas"]] == ["2026-11-17", "2026-11-24", "2026-11-26"]
    texte = json.dumps(tours, ensure_ascii=False)
    assert AUTRE_ENFANT not in texte and AUTRE_ENFANT_2 not in texte


def test_fichier_telecharge_et_trop_gros_rend_sans_contenu():
    session = SessionEcole()
    url = f"{ORIGINE}/upload/photo_video/dehors.JPG"
    assert lire(session, ep.NOM_FICHIER, url=url)["contenu"] == b"\xff\xd8photo2"
    assert lire(session, ep.NOM_FICHIER, url=url, octets_max=3)["contenu"] is None


def test_une_redirection_est_une_session_expirée_pas_une_page_suivie():
    session = SessionEcole(redirections={"/parent/documents"})
    with pytest.raises(ep.ErreurEspaceParent, match="session expirée"):
        lire(session, ep.NOM_DOCUMENTS)


# ---------- garde : POST, chemins hors liste, Facturation ----------
@pytest.mark.parametrize("nom", NOMS_OUTILS)
@pytest.mark.parametrize("methode", ["post", "put", "patch", "delete"])
def test_chaque_outil_refuse_une_ecriture_meme_sur_son_propre_chemin(nom, methode, caplog):
    ep.assurer_inscrit(ORIGINE)
    session = SessionEcole()
    client = ClientLecture(session, nom, registre._OUTILS[nom].chemins)
    chemin = "/upload/document/a.pdf" if nom == ep.NOM_FICHIER else "/parent/messagerie"
    with caplog.at_level(logging.INFO, logger="bot"), pytest.raises(EcritureBloquee):
        getattr(client, methode)(ORIGINE + chemin)
    assert session.requetes == [] and "garde : écriture bloquée" in caplog.text


@pytest.mark.parametrize("nom", NOMS_OUTILS)
@pytest.mark.parametrize("chemin", [
    "/parent/facturation", "/parent/facturation/12", "/parent/deconnexion", "/parent", "/parent/cantine",
    "/parent/messagerie/7/envoyer", "/parent/messagerie/abc", "/parent/tableau/rdv-bilans-semestriels",
    "/upload/document/../../parent/facturation", "/upload/photo_video/%2e%2e/facturation",
    "/upload/photo_video/..%2fparent%2ffacturation", "/upload/autre/x.pdf", "/upload/document/", "/upload/document/a/b.pdf",
])
def test_aucun_outil_n_atteint_la_facturation_ni_un_chemin_hors_liste(nom, chemin):
    ep.assurer_inscrit(ORIGINE)
    session = SessionEcole()
    client = ClientLecture(session, nom, registre._OUTILS[nom].chemins)
    autorise = (nom == ep.NOM_MESSAGES and chemin == "/parent/messagerie/7")
    if autorise:
        client.get(ORIGINE + chemin)
        return
    with pytest.raises(EcritureBloquee):
        client.get(ORIGINE + chemin)
    assert session.requetes == []


def test_un_autre_hote_est_refuse():
    ep.assurer_inscrit(ORIGINE)
    client = ClientLecture(SessionEcole(), ep.NOM_PHOTOS, registre._OUTILS[ep.NOM_PHOTOS].chemins)
    with pytest.raises(EcritureBloquee):
        client.get("https://autre-site.test/parent/photos-videos")


def test_les_outils_sont_inscrits_en_lecture_et_une_ecriture_n_existe_pas():
    ep.assurer_inscrit(ORIGINE)
    assert {registre._OUTILS[n].genre for n in NOMS_OUTILS} == {registre.LECTURE}
    assert not any("facturation" in n for n in registre._OUTILS)
    ep.assurer_inscrit("https://nouvel-hote.test")  # réinscription sans erreur
    assert registre._OUTILS[ep.NOM_PHOTOS].chemins[0].pattern.startswith("https://nouvel\\-hote")


# ---------- connexion : le seul POST, hors outil ----------
class HttpEcole:
    def __init__(self, session, url_finale=f"{ORIGINE}/parent"):
        self._session, self._finale = session, url_finale

    def Session(self):
        faux = self._session
        faux.get = lambda url, **kw: Reponse(status_code=200, text=PAGES["/parent/connexion"], url=f"{ORIGINE}/parent/connexion",
                                             content=b"", headers={})
        faux.post = lambda url, **kw: (faux.requetes.append(("POST", url, kw)) or
                                       Reponse(status_code=200, text="", url=self._finale, content=b"", headers={}))
        return faux


@pytest.fixture
def variables(monkeypatch):
    valeurs = {ep.VAR_URL: f"{ORIGINE}/connexion", ep.VAR_IDENTIFIANT: "parent@exemple.test", ep.VAR_MDP: "mdp-fictif"}
    monkeypatch.setattr(ep.variables_utilisateur, "lire_variable", valeurs.get)
    return valeurs


def test_connexion_un_seul_post_avec_le_jeton_puis_la_session_est_rendue(variables):
    faux = SessionEcole()
    session, origine = ep.connecter(HttpEcole(faux))
    assert origine == ORIGINE and session is faux
    posts = [(u, kw) for m, u, kw in faux.requetes if m == "POST"]
    assert len(posts) == 1 and posts[0][0] == f"{ORIGINE}/parent/connexion"
    assert posts[0][1]["data"] == {"_token": "jeton-fictif", "email": "parent@exemple.test", "password": "mdp-fictif"}


def test_connexion_refusee_quand_le_site_renvoie_la_page_de_connexion(variables):
    with pytest.raises(ep.ErreurEspaceParent, match="refusée") as exc:
        ep.connecter(HttpEcole(SessionEcole(), url_finale=f"{ORIGINE}/parent/connexion"))
    assert "mdp-fictif" not in str(exc.value) and "ecole-fictive" not in str(exc.value)


def test_connexion_refusee_sans_https_et_sans_variables(variables, monkeypatch):
    variables[ep.VAR_URL] = "http://ecole-fictive.test/connexion"
    with pytest.raises(ep.ErreurEspaceParent, match="https"):
        ep.connecter(HttpEcole(SessionEcole()))
    monkeypatch.setattr(ep.variables_utilisateur, "lire_variable", lambda nom: None)
    with pytest.raises(ep.EspaceParentNonConfigure):
        ep.connecter(HttpEcole(SessionEcole()))


def test_connexion_refuse_un_formulaire_qui_pointe_ailleurs(variables):
    faux = SessionEcole()
    http = HttpEcole(faux)
    session = http.Session()
    session.get = lambda url, **kw: Reponse(status_code=200, url=f"{ORIGINE}/connexion", content=b"", headers={},
                                            text=PAGES["/parent/connexion"].replace(ORIGINE, "https://pirate.test"))
    http.Session = lambda: session
    with pytest.raises(ep.ErreurEspaceParent, match="ailleurs"):
        ep.connecter(http)
    assert "POST" not in faux.methodes()
