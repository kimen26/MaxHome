"""Client HTTP des outils de lecture : ne laisse passer que GET et HEAD.

Enveloppe n'importe quelle session à la façon de `requests.Session` (espace parent, Google) : l'outil
ne reçoit JAMAIS la session elle-même, seulement ce client. Toute autre méthode lève EcritureBloquee.
"""
import logging

log = logging.getLogger("bot")

METHODES_LECTURE = frozenset({"GET", "HEAD"})


class EcritureBloquee(Exception):
    """Un outil de lecture a tenté une requête qui peut écrire."""


class ClientLecture:
    def __init__(self, session, outil):
        self._session = session
        self._outil = outil

    def request(self, methode, url, **kwargs):
        methode = str(methode).upper()
        if methode not in METHODES_LECTURE:
            log.warning("garde : écriture bloquée dans un outil de lecture (%s)", self._outil)
            raise EcritureBloquee(f"méthode {methode} refusée dans l'outil de lecture {self._outil}")
        return self._session.request(methode, url, **kwargs)

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
