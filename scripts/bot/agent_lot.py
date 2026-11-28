"""Plusieurs écritures proposées d'un seul « OK pour tout ? » (action finale « ecritures » de l'agent).

Chaque élément est servi par `suite` (dialogue_libre._suite) sur un état BROUILLON : `suite` ne fait que
proposer, donc rien n'est écrit ici (D-068). Toute règle métier reste dans le code existant (agenda.valider_saisie,
traduction_libre...) ; ce module ne fait que filtrer, regrouper, puis exécuter sur un « oui » (D-060).
"""
import logging

import agenda_bot
import conversation
import ecole_agenda
import reponses
from outils import agenda

ACTION = "lot"
LOT_MAX = 8
LOT_AUTORISES = frozenset({"agenda_creer", "agenda_modifier", "agenda_supprimer", "course_ajout", "extra",
                           "charge", "valider", "tache_faite"})
APRES_TIERS = frozenset({"agenda_creer", "course_ajout"})  # liste fermée après la lecture d'un tiers
FIN_RECAP = " OK ?"

log = logging.getLogger("bot")


def _saisie_valide(element):
    try:
        return agenda.valider_saisie(agenda_bot._saisie_de(element))
    except agenda.ErreurSaisie:
        return None  # `suite` rendra la phrase d'erreur du module


def _agenda_existant(saisies):
    """Événements déjà présents sur la période des créations ; lecture ratée = aucun filtre."""
    if not saisies:
        return []
    try:
        return agenda_bot.lire_periode(min(s["debut"] for s in saisies), max(s["fin"] for s in saisies))
    except Exception as exc:
        log.warning("lot : lecture de l'agenda impossible (%s), pas de filtre de doublons", type(exc).__name__)
        return []


def _recap_court(recap):
    """Le récap sans son « OK ? » final ni son point d'interrogation, pour une ligne numérotée."""
    court = recap[:-len(FIN_RECAP)] if recap.endswith(FIN_RECAP) else recap
    return court.rstrip(" ?")


def _doublon(element, saisie, existants):
    if element.get("action") != "agenda_creer" or saisie is None or not ecole_agenda.deja_la(saisie, existants):
        return None
    return f"« {saisie['titre']} » ({agenda_bot.quand_clair(saisie)}) : déjà dans l'agenda."


def _recolter(bot, telegram_id, prenom, texte, elements, suite, annee, mois, existants):
    """(actions, recaps, notes) : chaque élément servi sur un brouillon."""
    actions, recaps, notes = [], [], []
    for element in elements:
        if element.get("action") == "agenda_creer":
            saisie = _saisie_valide(element)
            doublon = _doublon(element, saisie, existants)
            if doublon:
                notes.append(doublon)
                continue
        brouillon = {}
        rendu = suite(bot, brouillon, telegram_id, prenom, texte, element, annee, mois)
        attente = conversation.en_attente(brouillon, conversation.CONFIRMATION)
        if attente:
            actions.append(attente["action"])
            recaps.append(rendu)
        elif rendu:
            notes.append(rendu)
    return actions, recaps, notes


def _filtrer(liste, apres_tiers):
    admis = APRES_TIERS if apres_tiers else LOT_AUTORISES
    gardes, notes = [], []
    for element in liste:
        nom = element.get("action")
        if nom in admis and len(gardes) < LOT_MAX:
            gardes.append(element)
        elif nom in admis:
            notes.append(f"Au plus {LOT_MAX} à la fois : « {nom} » n'est pas retenu.")
        else:
            notes.append(f"Je ne propose pas « {nom} » dans une demande groupée.")
    return gardes, notes


def proposer(bot, etat, telegram_id, prenom, texte, liste, suite, annee, mois, apres_tiers=False):
    """Le message qui propose les écritures (une seule confirmation posée), ou les raisons si aucune n'est valide."""
    elements, notes = _filtrer(liste, apres_tiers)
    saisies = [s for s in (_saisie_valide(e) for e in elements if e.get("action") == "agenda_creer") if s]
    actions, recaps, notes_suite = _recolter(bot, telegram_id, prenom, texte, elements, suite, annee, mois,
                                             _agenda_existant(saisies))
    notes = [*notes_suite, *notes]
    if not actions:
        return "\n".join(notes) if notes else reponses.non_compris()
    suffixe = ("\n" + "\n".join(notes)) if notes else ""
    if len(actions) == 1:  # une seule écriture valable : la proposition simple d'aujourd'hui
        conversation.poser(etat, conversation.CONFIRMATION, {"action": actions[0]})
        return recaps[0] + suffixe
    conversation.poser(etat, conversation.CONFIRMATION, {"action": {
        "action": ACTION, "actions": actions, "recaps": [_recap_court(r) for r in recaps]}})
    lignes = [f"{i}. {_recap_court(r)}" for i, r in enumerate(recaps, 1)]
    return "Je propose :\n" + "\n".join(lignes) + suffixe + "\nOK pour tout ?"


def executer(bot, telegram_id, prenom, lot, texte):
    """Exécute chaque écriture confirmée, dans l'ordre ; une erreur n'arrête pas les suivantes."""
    lignes = []
    for i, action in enumerate(lot["actions"], 1):
        fait_par = action.get("par") or prenom
        lignes.append(f"{i}. {bot.executer_action(telegram_id, fait_par, action, texte)}")
    return "\n".join(lignes)
