"""Garder le lien dans le bot : noter un échange avec un proche, consulter qui relancer (actions libres).

Le modèle (libre.py) ne rend qu'un JSON ; ici on vérifie chaque champ (donnée non fiable), on retrouve le proche
par son prénom, et on agit. Convention d'ajout du bot (comme `course_ajout`) : un prénom CONNU est ajouté tout de
suite et reste annulable (`annuler`) ; un prénom INCONNU est proposé (« L'ajouter à tes proches ? OK ? ») et ne
crée rien avant un « oui ». Le bot n'écrit jamais à un proche.
"""
from datetime import date

import conversation
import proches
import reponses
import reponses_proches as textes

ACTIONS_LIBRES = frozenset({"proche_echange", "proches"})
ACTION_CREER = "proche_creer"  # l'action posée en confirmation (reponses.RECAPS), exécutée après le « oui »
JOURS_ANNIVERSAIRES = 30
RELANCES_MAX = 10


def _texte(valeur):
    return " ".join(valeur.split()) if isinstance(valeur, str) else ""


def _jour(valeur, aujourdhui):
    """Date « AAAA-MM-JJ » du message (aujourd'hui s'il n'en cite aucune), ou None si illisible ou à venir."""
    if valeur in (None, ""):
        return aujourdhui.isoformat()
    try:
        d = date.fromisoformat(valeur) if isinstance(valeur, str) else None
    except ValueError:
        d = None
    return d.isoformat() if d and d <= aujourdhui else None


def _demander(etat, phrase):
    conversation.poser(etat, conversation.QUESTION)
    return phrase


def repondre(bot, etat, telegram_id, prenom, interp, proposer, aujourdhui):
    """Réponse à une action libre (`proche_echange`, `proches`). `proposer(etat, action, prenom)` pose le « OK ? »."""
    if interp["action"] == "proches":
        return consulter(bot, prenom, aujourdhui)
    nom, texte = _texte(interp.get("prenom")), _texte(interp.get("texte"))
    if not nom or len(nom) > proches.PRENOM_MAX:
        return _demander(etat, textes.question_texte())
    if not texte:
        return _demander(etat, textes.question_texte(nom))
    if len(texte) > proches.TEXTE_MAX:
        return textes.TEXTE_TROP_LONG
    le = _jour(interp.get("le"), aujourdhui)
    if le is None:
        return _demander(etat, textes.QUESTION_DATE)
    connu = proches.trouver(bot.donnees.proches(), nom, reponses.normaliser)
    if connu is None:
        return proposer(etat, {"action": ACTION_CREER, "prenom": nom, "texte": texte, "le": le}, prenom)
    echange = proches.noter_echange(bot.donnees, connu["id"], texte, le, prenom)
    bot.marquer_annulable(telegram_id, "proche_echanges", {"id": echange["id"]}, None)
    return textes.echange_note(connu["prenom"], texte)


def creer_et_noter(bot, telegram_id, prenom, action):
    """Après le « oui » : crée le proche (qui = l'auteur, sans rythme) et note l'échange. Annulable d'un bloc."""
    existant = proches.trouver(bot.donnees.proches(), action["prenom"], reponses.normaliser)
    if existant is not None:  # créé entre la proposition et le « oui » (l'app, l'autre membre) : on ne double pas
        echange = proches.noter_echange(bot.donnees, existant["id"], action["texte"], action["le"], prenom)
        bot.marquer_annulable(telegram_id, "proche_echanges", {"id": echange["id"]}, None)
        return textes.echange_note(existant["prenom"], action["texte"])
    neuf = proches.creer(bot.donnees, action["prenom"], prenom)
    proches.noter_echange(bot.donnees, neuf["id"], action["texte"], action["le"], prenom)
    bot.marquer_annulable(telegram_id, "proches", {"id": neuf["id"]}, None)  # l'échange part en cascade
    return textes.echange_note(neuf["prenom"], action["texte"], cree=True)


def consulter(bot, prenom, aujourdhui):
    """À relancer pour ce membre, et les anniversaires des 30 prochains jours (ses proches et « nous »)."""
    tous, echanges = proches.lire(bot.donnees)
    siens = [p for p in tous if proches.concerne(p, prenom)]
    par_id = {p["id"]: p for p in siens}
    relances = [(par_id[r["id"]]["prenom"], r["depuis_jours"])
                for r in proches.a_relancer(siens, echanges, aujourdhui)][:RELANCES_MAX]
    fetes = [(par_id[a["id"]]["prenom"], a["jour"], a["dans_jours"], a["age"])
             for a in proches.anniversaires(siens, aujourdhui, JOURS_ANNIVERSAIRES)]
    return textes.liste(relances, fetes)
