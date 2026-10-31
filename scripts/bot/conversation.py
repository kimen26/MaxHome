"""Mémoire de conversation du langage libre, par personne (l'état `etat` de bot.etats[telegram_id]).

Trois choses y vivent, toutes oubliées après 15 minutes :
  - les 6 derniers échanges (message de la personne + réponse du bot), passés à l'interpréteur ;
  - la question que le bot vient de poser (la réponse suivante la complète) ;
  - l'écriture proposée, en attente d'un oui (une vieille proposition ne doit jamais s'exécuter).
Aucun accès réseau ni base ici : des fonctions sur un dict, testables avec une horloge factice.
"""
import re
import time

from reponses import normaliser

DUREE_OUBLI_S = 15 * 60
MAX_ECHANGES = 6
LONGUEUR_REPONSE_RETENUE = 300  # un bilan entier n'a rien à faire dans le prompt suivant

CLE_ECHANGES = "echanges"
QUESTION = "question_libre"
CONFIRMATION = "confirmation_libre"

OUI = {"oui", "ok", "okay", "vas y", "d accord", "daccord", "go", "yes"}
NON = {"non", "annule", "annuler", "stop", "laisse tomber"}

_RE_PONCTUATION = re.compile(r"[^\w\s]|_")


def maintenant():
    """Horloge unique du module (remplaçable en test)."""
    return time.time()


def verdict(texte):
    """« oui » / « non » si le message n'est QUE cela (oui, ok, vas-y, d'accord, go / non, annule), sinon None."""
    mots = " ".join(_RE_PONCTUATION.sub(" ", normaliser(texte)).split())
    if mots in OUI:
        return "oui"
    if mots in NON:
        return "non"
    return None


def echanges(etat):
    """Les échanges encore valables, du plus ancien au plus récent (6 au plus)."""
    limite = maintenant() - DUREE_OUBLI_S
    return [e for e in etat.get(CLE_ECHANGES, []) if e["quand"] >= limite][-MAX_ECHANGES:]


def retenir(etat, message, reponse):
    nouveau = {"quand": maintenant(), "message": message, "reponse": reponse[:LONGUEUR_REPONSE_RETENUE]}
    etat[CLE_ECHANGES] = [*echanges(etat), nouveau][-MAX_ECHANGES:]


def poser(etat, cle, contenu=None):
    """Met en attente `cle` (QUESTION ou CONFIRMATION) pour 15 minutes."""
    etat[cle] = {"expire": maintenant() + DUREE_OUBLI_S, **(contenu or {})}


def en_attente(etat, cle):
    """Ce qui attend sous `cle`, ou None s'il n'y a rien ou si c'est périmé (alors retiré)."""
    attente = etat.get(cle)
    if attente and maintenant() <= attente["expire"]:
        return attente
    etat.pop(cle, None)
    return None


def retirer(etat, cle):
    etat.pop(cle, None)
