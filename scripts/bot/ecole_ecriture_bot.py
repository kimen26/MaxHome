"""Écritures sur l'espace parent dans le bot (lot 5) : s'inscrire à un tour de fleurs ou d'encas, s'en désinscrire,
écrire à l'école. « OK ? » avant tout, comme l'agenda (agenda_bot.py).

Le modèle (libre.py) ne rend qu'un JSON, issu du message d'un MEMBRE. Ici on relit l'espace parent (lecture, GET seul)
pour vérifier que la demande tient (date libre, tour bien à nous, « prochain libre » résolu), puis on PROPOSE l'écriture :
elle ne part qu'après un « oui » (registre.confirmer -> outils/ecole_ecriture.py, qui relit encore avant d'écrire).
Règle de sécurité (brief, principe 3) : une écriture ne naît que d'un message de membre. Ce module n'est appelé que par
dialogue_libre._suite ; outils/resume.py et ecole.py (qui résument ce qui est lu) ne l'importent pas et ne peuvent pas
proposer d'écriture (testé).
"""
import logging

import conversation
import ecole_espace
import outils
from outils import ecole_ecriture as ee
from outils import ecole_pages
from outils import espace_parent as ep

ACTIONS = frozenset({"ecole_inscrire", "ecole_desinscrire", "ecole_message"})
IMPOSSIBLE = "Je n'arrive pas à lire l'espace parent de l'école pour l'instant."
QUESTION_TOUR = "Pour les fleurs ou pour les encas ?"
QUESTION_DATE = "Pour quelle date ?"
QUESTION_MESSAGE = "Quel message veux-tu envoyer à l'école ?"
NOM_TOUR = {"fleurs": "tour de fleurs", "encas": "tour d'encas"}
POUR = {"fleurs": "les fleurs", "encas": "les encas"}
MESSAGE_LONG = f"Ton message dépasse {ee.TEXTE_MAX} caractères : raccourcis-le."

log = logging.getLogger("bot")


def _demander(etat, question):
    conversation.poser(etat, conversation.QUESTION)
    return question


def _date_valide(valeur):
    return isinstance(valeur, str) and ecole_pages.date_iso(valeur) == valeur


def _tours(quoi):
    """Les tours à venir de `quoi` ({date, nous, libres, ...}), lus par l'outil de lecture ; None si illisible."""
    try:
        session, origine = ecole_espace.ouvrir()
        return ecole_espace.lire(ep.NOM_TOURS, session, origine)[quoi]
    except Exception as exc:
        log.error("espace parent : tours illisibles avant une proposition (%s)", type(exc).__name__)
        return None


def _prochain_libre(tours):
    return next((t for t in tours if t["libres"] and not t["nous"]), None)


def _choisir(tours, quoi, interp, inscrire):
    """(tour visé, None) ou (None, phrase à dire)."""
    if inscrire and interp.get("prochain") and not interp.get("date"):
        tour = _prochain_libre(tours)
        return (tour, None) if tour else (None, f"Il n'y a aucune date libre pour {POUR[quoi]} pour l'instant.")
    if not inscrire and not interp.get("date"):
        siens = [t for t in tours if t["nous"]]
        if len(siens) == 1:
            return siens[0], None
        return None, None if siens else f"Max n'est inscrit à aucun {NOM_TOUR[quoi]} pour l'instant."
    if not _date_valide(interp.get("date")):
        return None, None
    tour = next((t for t in tours if t["date"] == interp["date"]), None)
    if tour is None:
        return None, f"Je ne vois pas de {NOM_TOUR[quoi]} ce jour-là sur l'espace parent."
    return tour, None


def _verifier(tour, quoi, inscrire):
    """Phrase de refus si le tour ne permet pas l'écriture demandée, sinon None."""
    d = ee.phrase_tour(quoi, tour["date"], de=not inscrire)
    if inscrire and tour["nous"]:
        return f"Max est déjà inscrit {ee.phrase_tour(quoi, tour['date'])}."
    if inscrire and not tour["libres"]:
        return f"Il n'y a plus de place {ee.phrase_tour(quoi, tour['date'])}."
    if not inscrire and not tour["nous"]:
        return f"Ce n'est pas notre tour {d} : je ne peux pas désinscrire Max."
    return None


def _tour_demande(etat, prenom, interp, inscrire):
    quoi = interp.get("quoi")
    if quoi not in ee.TYPES:
        return _demander(etat, QUESTION_TOUR)
    if inscrire and not interp.get("date") and not interp.get("prochain"):
        return _demander(etat, QUESTION_DATE)
    tours = _tours(quoi)
    if tours is None:
        return IMPOSSIBLE
    tour, phrase = _choisir(tours, quoi, interp, inscrire)
    if phrase:
        return phrase
    if tour is None:
        return _demander(etat, QUESTION_DATE)
    refus = _verifier(tour, quoi, inscrire)
    if refus:
        return refus
    ee.assurer_inscrit()
    nom = ee.NOM_INSCRIRE if inscrire else ee.NOM_DESINSCRIRE
    verbe = "Inscrire" if inscrire else "Désinscrire"
    resume = f"{verbe} Max {ee.phrase_tour(quoi, tour['date'], de=not inscrire)} ?"
    return outils.proposer_ecriture(etat, nom, {"quoi": quoi, "date": tour["date"]}, resume, prenom)


def _message(etat, prenom, interp):
    brut = interp.get("texte")
    texte = " ".join(brut.split()) if isinstance(brut, str) else ""
    if not texte:
        return _demander(etat, QUESTION_MESSAGE)
    if len(texte) > ee.TEXTE_MAX:
        return MESSAGE_LONG
    ee.assurer_inscrit()
    return outils.proposer_ecriture(etat, ee.NOM_MESSAGE, {"texte": texte},
                                    f"Envoyer à l'école (fil de Max) : « {texte} » ?", prenom)


def repondre(etat, prenom, interp):
    """Réponse à une action ecole_inscrire / ecole_desinscrire / ecole_message du modèle : toujours une proposition « OK ? »
    (ou un refus, une question) ; rien n'est écrit sur le site avant le « oui »."""
    return {"ecole_inscrire": lambda: _tour_demande(etat, prenom, interp, True),
            "ecole_desinscrire": lambda: _tour_demande(etat, prenom, interp, False),
            "ecole_message": lambda: _message(etat, prenom, interp)}[interp["action"]]()
