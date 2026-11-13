"""Lecture de l'espace parent de l'école (brief bot-ecole-agenda, lot 4, D-061).

Deux étages, comme gmail.py :
  - l'AUTHENTIFICATION (`connecter`) lit les variables utilisateur MAXHOME_ECOLE_*, charge la page de connexion et
    poste le formulaire (jeton `_token`). C'est le SEUL POST du lot, fait hors du client de lecture ;
  - les OUTILS `ecole_messages`, `ecole_documents`, `ecole_photos`, `ecole_tours`, `ecole_fichier` ne reçoivent qu'un
    ClientLecture (GET seul) limité à leurs pages : tout autre chemin (Facturation, formulaires d'inscription,
    envoi de message, déconnexion...) lève EcritureBloquee. Aucune redirection n'est suivie dans un outil.
L'hôte du site vient de la variable : les motifs de chemins sont compilés à l'inscription (`assurer_inscrit`).
Aucune valeur (hôte, identifiant, mot de passe) n'est journalisée ni mise dans une exception.
"""
import re
from datetime import date
from urllib.parse import urljoin, urlsplit

import variables_utilisateur
from outils import ecole_pages, registre

VAR_URL, VAR_IDENTIFIANT, VAR_MDP = "MAXHOME_ECOLE_URL", "MAXHOME_ECOLE_IDENTIFIANT", "MAXHOME_ECOLE_MDP"
NOM_MESSAGES, NOM_DOCUMENTS, NOM_PHOTOS = "ecole_messages", "ecole_documents", "ecole_photos"
NOM_TOURS, NOM_FICHIER = "ecole_tours", "ecole_fichier"
CHEMIN_MESSAGERIE, CHEMIN_DOCUMENTS, CHEMIN_PHOTOS = "/parent/messagerie", "/parent/documents", "/parent/photos-videos"
CHEMIN_FLEURS, CHEMIN_ENCAS = "/parent/tableau/fleurs-plantes-lundi", "/parent/tableau/agenda-du-gouter"
# un seul segment de fichier : pas de « / », pas de point en tête, pas de %2e/%2f/%5c (aucune remontée possible)
_FICHIER = r"(?!\.)(?:[^/%\\?#]|%(?!2[eEfF]|5[cC]))+"
DELAI_S = 30
CHATS_MAX = 3
MESSAGES_MAX = 5
DOCUMENTS_MAX = 5
PHOTOS_LISTE_MAX = 30
TEXTE_MAX = 600
OCTETS_MAX = 20 * 1024 * 1024
USER_AGENT = "Mozilla/5.0 (MaxHome, lecture parent)"


class ErreurEspaceParent(Exception):
    """Connexion, session ou page en échec (jamais d'hôte, d'identifiant ni de mot de passe dans le message)."""


class EspaceParentNonConfigure(ErreurEspaceParent):
    """Les variables MAXHOME_ECOLE_* ne sont pas posées : rien à lire, rien à signaler."""


def aujourdhui():
    """Date du jour (remplaçable en test)."""
    return date.today()


# ---------- authentification (hors outil) ----------
def _identifiants():
    valeurs = [variables_utilisateur.lire_variable(n) for n in (VAR_URL, VAR_IDENTIFIANT, VAR_MDP)]
    if not all(valeurs):
        raise EspaceParentNonConfigure("variables MAXHOME_ECOLE_* absentes")
    return valeurs


def _origine(url):
    p = urlsplit(url)
    return f"{p.scheme}://{p.netloc}"


def _formulaire(html):
    from bs4 import BeautifulSoup
    form = BeautifulSoup(html, "html.parser").find("form")
    jeton = form.find("input", {"name": "_token"}) if form else None
    if not form or not jeton or not form.get("action"):
        raise ErreurEspaceParent("formulaire de connexion introuvable (la page a changé ?)")
    return form["action"], jeton.get("value", "")


def connecter(http=None):
    """(session authentifiée, origine du site). `http` : le module requests ou équivalent."""
    url, identifiant, mdp = _identifiants()
    if urlsplit(url).scheme != "https":
        raise ErreurEspaceParent("l'adresse de l'espace parent n'est pas en https : connexion refusée")
    if http is None:
        import requests
        http = requests
    session = http.Session()
    session.headers["User-Agent"] = USER_AGENT
    page = session.get(url, timeout=DELAI_S)
    action, jeton = _formulaire(page.text)
    cible = urljoin(page.url, action)
    if _origine(cible) != _origine(page.url):
        raise ErreurEspaceParent("le formulaire de connexion pointe ailleurs : connexion refusée")
    reponse = session.post(cible, data={"_token": jeton, "email": identifiant, "password": mdp}, timeout=DELAI_S)
    if reponse.status_code != 200 or "connexion" in urlsplit(reponse.url).path:
        raise ErreurEspaceParent("connexion à l'espace parent refusée")
    return session, _origine(page.url)


# ---------- lecture d'une page ----------
def _page(client, url):
    reponse = client.get(url, timeout=DELAI_S, allow_redirects=False)
    if 300 <= reponse.status_code < 400:
        raise ErreurEspaceParent("session expirée ou page déplacée")
    if reponse.status_code != 200:
        raise ErreurEspaceParent(f"l'espace parent a répondu HTTP {reponse.status_code}")
    return reponse.text


def _court(texte):
    return texte if len(texte) <= TEXTE_MAX else texte[:TEXTE_MAX].rstrip() + "…"


# ---------- les outils ----------
def ecole_messages(client, origine, maximum=MESSAGES_MAX):
    """Derniers messages de l'école : {date, heure, expediteur (« nous » ou nom affiché), texte}, récents d'abord."""
    chats = ecole_pages.parser_chats(_page(client, origine + CHEMIN_MESSAGERIE), origine)[:CHATS_MAX]
    messages = [m for url in chats for m in ecole_pages.parser_messages(_page(client, url))]
    messages.sort(key=lambda m: (m["date"], m["heure"]), reverse=True)
    return [{**m, "texte": _court(m["texte"])} for m in messages[:maximum]]


def ecole_documents(client, origine, maximum=DOCUMENTS_MAX):
    """Derniers documents datés : {date, titre, url}, récents d'abord."""
    return ecole_pages.parser_documents(_page(client, origine + CHEMIN_DOCUMENTS), origine)[:maximum]


def ecole_photos(client, origine, maximum=PHOTOS_LISTE_MAX):
    """Médias de la page Photos / Vidéos, récents en tête : {date, titre, url, genre}."""
    return ecole_pages.parser_photos(_page(client, origine + CHEMIN_PHOTOS), origine)[:maximum]


def ecole_tours(client, origine, depuis=None):
    """Fleurs du lundi et encas du matin à partir de `depuis` : {"fleurs": [...], "encas": [...]}, chaque tour
    {date, nous, libres, pris, aliment}. Seulement « nous », « libre » ou « pris » : jamais un prénom."""
    depuis = (depuis or aujourdhui()).isoformat()
    fleurs = ecole_pages.parser_fleurs(_page(client, origine + CHEMIN_FLEURS))
    encas = ecole_pages.parser_encas(_page(client, origine + CHEMIN_ENCAS))
    return {"fleurs": [t for t in fleurs if t["date"] >= depuis], "encas": [t for t in encas if t["date"] >= depuis]}


def ecole_fichier(client, origine, url, octets_max=OCTETS_MAX):
    """Télécharge un média ou un document de l'école : {nom, contenu (None si trop gros), taille}."""
    reponse = client.get(url, timeout=DELAI_S, allow_redirects=False, stream=True)
    if reponse.status_code != 200:
        raise ErreurEspaceParent(f"l'espace parent a répondu HTTP {reponse.status_code}")
    nom = urlsplit(url).path.rsplit("/", 1)[-1]
    taille = int(reponse.headers.get("Content-Length") or 0)
    if taille > octets_max:
        return {"nom": nom, "contenu": None, "taille": taille}
    contenu = reponse.content
    return {"nom": nom, "contenu": contenu if len(contenu) <= octets_max else None, "taille": len(contenu)}


# ---------- inscription au registre ----------
def chemins(origine):
    """Les seules URL de chaque outil (motifs compilés, fullmatch sur « schéma://hôte/chemin », query exclue)."""
    base = re.escape(origine)
    return {
        NOM_MESSAGES: (re.compile(base + re.escape(CHEMIN_MESSAGERIE)),
                       re.compile(base + re.escape(CHEMIN_MESSAGERIE) + r"/\d+")),
        NOM_DOCUMENTS: (re.compile(base + re.escape(CHEMIN_DOCUMENTS)),),
        NOM_PHOTOS: (re.compile(base + re.escape(CHEMIN_PHOTOS)),),
        NOM_TOURS: (re.compile(base + re.escape(CHEMIN_FLEURS)), re.compile(base + re.escape(CHEMIN_ENCAS))),
        NOM_FICHIER: (re.compile(base + r"/upload/(?:photo_video|document)/" + _FICHIER),),
    }


_FONCTIONS = {NOM_MESSAGES: ecole_messages, NOM_DOCUMENTS: ecole_documents, NOM_PHOTOS: ecole_photos,
              NOM_TOURS: ecole_tours, NOM_FICHIER: ecole_fichier}


def assurer_inscrit(origine):
    """Inscrit les cinq outils (lecture) avec les chemins de `origine` ; réinscrit si l'hôte a changé."""
    motifs = chemins(origine)
    for nom, fonction in _FONCTIONS.items():
        registre.retirer(nom)
        registre.inscrire(nom, registre.LECTURE, fonction, motifs[nom])
