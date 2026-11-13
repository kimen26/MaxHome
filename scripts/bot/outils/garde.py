"""Client HTTP des outils de lecture : ne laisse passer que GET et HEAD.

Enveloppe n'importe quelle session à la façon de `requests.Session` (espace parent, Google) : l'outil
ne reçoit JAMAIS la session elle-même, seulement ce client. Toute autre méthode lève EcritureBloquee.
Un outil peut en plus déclarer `chemins` : des motifs d'URL (sans la query) ; toute autre URL est refusée
de la même façon (Gmail : seulement lister et lire un message, jamais send/modify/trash/drafts/settings).
"""
import logging
from urllib.parse import urlsplit

log = logging.getLogger("bot")

METHODES_LECTURE = frozenset({"GET", "HEAD"})


class EcritureBloquee(Exception):
    """Un outil de lecture a tenté une requête qui peut écrire."""


class ClientLecture:
    def __init__(self, session, outil, chemins=None):
        self._session = session
        self._outil = outil
        self._chemins = chemins  # None = aucune restriction d'URL ; sinon motifs compilés (fullmatch)

    def request(self, methode, url, **kwargs):
        methode = str(methode).upper()
        if methode not in METHODES_LECTURE:
            log.warning("garde : écriture bloquée dans un outil de lecture (%s)", self._outil)
            raise EcritureBloquee(f"méthode {methode} refusée dans l'outil de lecture {self._outil}")
        if self._chemins is not None and not self._url_permise(url):
            log.warning("garde : écriture bloquée dans un outil de lecture (%s), chemin hors liste", self._outil)
            raise EcritureBloquee(f"chemin refusé dans l'outil de lecture {self._outil}")
        return self._session.request(methode, url, **kwargs)

    def _url_permise(self, url):
        parties = urlsplit(str(url))
        sans_query = f"{parties.scheme}://{parties.netloc}{parties.path}"
        return any(m.fullmatch(sans_query) for m in self._chemins)

    def get(self, url, **kwargs):
        return self.request("GET", url, **kwargs)

    def head(self, url, **kwargs):
        return self.request("HEAD", url, **kwargs)

    def post(self, url, **kwargs):
        return self.request("POST", url, **kwargs)

    def put(self, url, **kwargs):
        return self.request("PUT", url, **kwargs)

    def patch(self, url, **kwargs):
        return self.request("PATCH", url, **kwargs)

    def delete(self, url, **kwargs):
        return self.request("DELETE", url, **kwargs)


class ClientEcriture:
    """Client HTTP des outils d'écriture : POST seulement, et seulement vers les URL de formulaire listées.

    `chemins` est obligatoire (motifs compilés, fullmatch sur « schéma://hôte/chemin », query exclue). Toute autre
    méthode ou URL (Facturation, déconnexion...) lève EcritureBloquee et se journalise. Aucune redirection n'est suivie.
    Il n'est construit que par une fonction d'écriture, qui ne tourne qu'après un « oui » (registre.confirmer).
    """

    def __init__(self, session, outil, chemins):
        if not chemins:
            raise ValueError("un client d'écriture exige la liste des URL de formulaire")
        self._session = session
        self._outil = outil
        self._chemins = tuple(chemins)

    def post(self, url, **kwargs):
        parties = urlsplit(str(url))
        sans_query = f"{parties.scheme}://{parties.netloc}{parties.path}"
        if not any(m.fullmatch(sans_query) for m in self._chemins):
            log.warning("garde : écriture refusée hors des formulaires listés (%s)", self._outil)
            raise EcritureBloquee(f"URL refusée dans l'outil d'écriture {self._outil}")
        kwargs["allow_redirects"] = False
        return self._session.request("POST", url, **kwargs)

    def request(self, methode, url, **kwargs):
        if str(methode).upper() != "POST":
            log.warning("garde : méthode refusée dans l'outil d'écriture (%s)", self._outil)
            raise EcritureBloquee(f"méthode {str(methode).upper()} refusée dans l'outil d'écriture {self._outil}")
        return self.post(url, **kwargs)
