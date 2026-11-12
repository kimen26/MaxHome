"""Journal des appels d'outils : une ligne par appel, jamais de contenu ni d'identifiant."""
import logging

log = logging.getLogger("bot")

OK = "ok"
REFUSE = "refusé"
ERREUR = "erreur"


def noter(nom, genre, issue):
    log.info("outil %s (%s) : %s", nom, genre, issue)
