"""Registre des outils du bot. Un outil = un nom, un genre, une fonction.

  lecture  : executer_lecture(nom, **args). La fonction reçoit un ClientLecture (GET/HEAD seulement).
  ecriture : proposer_ecriture(...) pose un « OK ? » (le mécanisme existant : dialogue_libre.proposer +
             conversation.CONFIRMATION, D-060) ; confirmer(action) n'est appelé qu'après le « oui »,
             par bot.traiter_action. Il n'existe aucun autre chemin d'exécution d'une écriture.
"""
from collections import namedtuple

import dialogue_libre
from outils import journal
from outils.garde import ClientLecture, EcritureBloquee

LECTURE = "lecture"
ECRITURE = "ecriture"
ACTION_ECRITURE = "outil_ecriture"  # l'action posée en confirmation (reponses.RECAPS)

Outil = namedtuple("Outil", "nom genre fonction")

_OUTILS = {}


class OutilInconnu(KeyError):
    pass


def inscrire(nom, genre, fonction):
    if genre not in (LECTURE, ECRITURE):
        raise ValueError(f"genre inconnu : {genre!r}")
    if nom in _OUTILS:
        raise ValueError(f"outil déjà inscrit : {nom}")
    _OUTILS[nom] = Outil(nom, genre, fonction)


def retirer(nom):
    _OUTILS.pop(nom, None)


def _outil(nom, genre):
    outil = _OUTILS.get(nom)
    if outil is None:
        raise OutilInconnu(nom)
    if outil.genre != genre:
        journal.noter(nom, outil.genre, journal.REFUSE)
        raise ValueError(f"l'outil {nom} est de genre {outil.genre}, pas {genre}")
    return outil


def _session_par_defaut():
    import requests  # installé dans C:\Python311 ; importé ici pour que les tests s'en passent
    return requests.Session()


def executer_lecture(nom, session=None, **args):
    """Exécute une lecture ; la fonction reçoit `client`, jamais la session."""
    outil = _outil(nom, LECTURE)
    try:
        client = ClientLecture(session if session is not None else _session_par_defaut(), nom)
        resultat = outil.fonction(client, **args)
    except EcritureBloquee:
        journal.noter(nom, LECTURE, journal.REFUSE)
        raise
    except Exception:
        journal.noter(nom, LECTURE, journal.ERREUR)
        raise
    journal.noter(nom, LECTURE, journal.OK)
    return resultat


def proposer_ecriture(etat, nom, args, resume, prenom):
    """Annonce l'écriture (`resume`, en français clair) et attend un « oui ». N'exécute rien."""
    outil = _outil(nom, ECRITURE)
    action = {"action": ACTION_ECRITURE, "outil": outil.nom, "args": dict(args), "resume": resume}
    return dialogue_libre.proposer(etat, action, prenom)


def confirmer(action):
    """Exécute l'écriture confirmée (`action` : celle posée par proposer_ecriture)."""
    outil = _outil(action["outil"], ECRITURE)
    try:
        resultat = outil.fonction(**action["args"])
    except Exception:
        journal.noter(outil.nom, ECRITURE, journal.ERREUR)
        raise
    journal.noter(outil.nom, ECRITURE, journal.OK)
    return resultat
