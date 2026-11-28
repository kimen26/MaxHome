"""Les lectures que la boucle d'agent (agent.py) peut exécuter pour le modèle : le modèle les demande par
leur nom, le code les exécute et rend le texte lu. Aucune n'écrit. `TIERS` : les lectures dont le contenu
vient d'un tiers (l'école) et peut donc contenir une consigne piégée : après elles, la garde de l'agent ne
laisse passer que des actions inoffensives.
"""
import json
import logging
import re
from collections import namedtuple
from datetime import timedelta

import actions
import agenda_bot
import ecole
import libre
import reponses
from outils import agenda

LECTURES = frozenset({"lire_ecole", "lire_agenda", "lire_budget", "lire_courses", "lire_taches"})
TIERS = frozenset({"lire_ecole"})
JOURS_AGENDA_DEFAUT = 13  # sans dates valides : aujourd'hui et les 13 jours suivants
Lecture = namedtuple("Lecture", "texte tiers")

_RE_MOIS = re.compile(r"(\d{4})-(0[1-9]|1[0-2])")

log = logging.getLogger("bot")


def _ecole(bot, interp):
    blocs, notes = ecole.lire_blocs(bot)
    return "\n\n".join(blocs) if blocs else "\n".join(notes)


def _agenda(bot, interp):
    debut, fin = interp.get("debut"), interp.get("fin") or interp.get("debut")
    if agenda.jour(debut) is None or agenda.jour(fin) is None or fin < debut:
        auj = libre.aujourdhui()
        debut, fin = auj.isoformat(), (auj + timedelta(days=JOURS_AGENDA_DEFAUT)).isoformat()
    return agenda_bot.formater_liste(agenda_bot.lire_periode(debut, fin))


def _budget(bot, interp):
    brut = interp.get("mois")
    trouve = _RE_MOIS.fullmatch(brut) if isinstance(brut, str) else None
    annee, mois = (int(trouve.group(1)), int(trouve.group(2))) if trouve else bot.mois_courant()
    chiffres, _, _ = bot.charger_r(annee, mois)
    return f"Budget {annee}-{mois:02d} (montants en centimes d'euro) : " + json.dumps(chiffres, ensure_ascii=False, default=str)


def _courses(bot, interp):
    return reponses.liste_courses(bot.donnees.courses())


def _taches(bot, interp):
    return actions.taches(bot, None, None, {"action": "taches"})


_LECTEURS = {"lire_ecole": _ecole, "lire_agenda": _agenda, "lire_budget": _budget,
             "lire_courses": _courses, "lire_taches": _taches}


def lire(bot, telegram_id, prenom, interp):
    """Lecture demandée par `interp["action"]` : Lecture(texte, tiers). Une panne rend « Lecture impossible »."""
    nom = interp.get("action")
    try:
        return Lecture(str(_LECTEURS[nom](bot, interp)), nom in TIERS)
    except Exception as exc:  # jamais de détail (hôte, contenu) dans le journal ni dans le texte rendu
        log.error("agent : lecture %s impossible (%s)", nom, type(exc).__name__)
        return Lecture(f"Lecture impossible ({nom}).", nom in TIERS)
