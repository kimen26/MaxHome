"""Le bot comme interface du foyer : une phrase libre est comprise, le bot POSE UNE QUESTION quand
il lui manque une info, annonce l'écriture en français clair, puis agit sur un « oui ».

bot.py aiguille ici (branche langage libre) ; la compréhension est dans libre.py (modèle sans
outil), la traduction vers les actions déjà exécutées dans traduction_libre.py, la mémoire de la
conversation dans conversation.py. Aucune logique métier nouvelle : l'écriture passe par
bot.traiter_action, comme une commande tapée à la main.
"""
import re

import agenda_bot
import budget_lignes
import conversation
import ecole
import ecole_ecriture_bot
import ecole_espace
import evolution
import libre
import reponses
import traduction_libre

ACTIONS_ECRITURE = frozenset(reponses.RECAPS)  # tout ce qui écrit passe par un « OK ? »
# La grammaire prend tout « ajoute ... » pour une course. Avec un montant, « ligne » ou « charge »
# c'est une ligne de budget (« ajoute une ligne paiement vacances Floride 500 € »), avec
# « fonctionnalité », « écran »... une demande d'évolution : dans les deux cas, au langage libre.
# (Le libellé arrive normalisé : minuscules, sans accents.)
_RE_PAS_UNE_COURSE = re.compile(
    r"€|\b(?:ligne|charge|euros?|eur|fonctionnalites?|ecran|onglet|bouton|appli|application)\b")

# Un jour, une heure ou le mot « agenda » dans une phrase que la grammaire a prise pour une course ou une
# charge floue (« ajoute piscine Max samedi 10h-11h », « supprime le dîner du 28 ») : c'est l'agenda (lot 3).
_RE_AGENDA = re.compile(
    r"\b(?:agenda|calendrier|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain|apres demain|"
    r"semaine|week ?end)\b|\b\d{1,2} ?h(?:\d\d)?\b|\b(?:le|du|au) \d{1,2}\b|\b(?:0?[1-9]|[12]\d|3[01])/(?:0?[1-9]|1[0-2])\b")  # « 28/11 », pas « 50/50 »

# Un libellé de charge ou un nom de voyage tapé à la main est court. Plus long, ou avec un lien,
# c'est une phrase que le dernier recours grammatical a prise pour une commande (un chiffre « 2 adulte »
# lui a suffi) : au langage libre. Une résa collée (« resa_libre ») est longue par nature : hors de ce test.
MOTS_MAX_LIBELLE = 6


def _trop_long_pour_une_commande(libelle):
    return len(libelle.split()) > MOTS_MAX_LIBELLE or "http" in libelle.lower()


def relayer(action, texte):
    """Une action de la grammaire qui, en vrai, relève du langage libre (`texte` : le message brut).

    L'action « charge » ne garde pas le libellé tapé (seulement celui de la charge trouvée) : on juge
    alors le message entier, montant compris.
    """
    nom = action["action"]
    if nom in ("course_ajout", "ambigu") and _RE_AGENDA.search(reponses.normaliser(texte)):
        return True
    if nom == "course_ajout":
        return bool(_RE_PAS_UNE_COURSE.search(action["libelle"]))
    if nom in ("ambigu", "charge"):
        return _trop_long_pour_une_commande(action.get("libelle", texte))
    if nom == "voyage":
        return _trop_long_pour_une_commande(action["nom"])
    return False


def _noter(etat, texte, reponse):
    conversation.retenir(etat, texte, reponse)
    return reponse


def reprendre(bot, telegram_id, prenom, texte):
    """Le message répond-il à une proposition (oui/non) ou à une question du bot ? Rend la réponse, sinon None.

    Testé AVANT la grammaire : « annule » ou « 50/50 » n'y auraient pas le sens qu'ils ont ici.
    """
    etat = bot.etats.setdefault(telegram_id, {})
    avis = conversation.verdict(texte)
    confirmation = conversation.en_attente(etat, conversation.CONFIRMATION)
    if confirmation:
        conversation.retirer(etat, conversation.CONFIRMATION)  # consommée quoi qu'on réponde
        if avis == "oui":
            action = confirmation["action"]
            fait_par = action.get("par") or prenom  # « Claudia a fait... » dit par Yann : c'est Claudia qui est créditée
            return _noter(etat, texte, bot.executer_action(telegram_id, fait_par, action, texte))
        if avis == "non":
            return _noter(etat, texte, "OK, rien fait.")
        return None  # une autre phrase remplace la proposition
    if conversation.en_attente(etat, conversation.QUESTION):
        if avis == "non":
            conversation.retirer(etat, conversation.QUESTION)
            return _noter(etat, texte, "OK, rien fait.")
        return interpreter(bot, telegram_id, prenom, texte)
    return None


def interpreter(bot, telegram_id, prenom, texte):
    """Phrase libre -> question, réponse chiffrée, demande notée, lecture, ou écriture proposée."""
    etat = bot.etats.setdefault(telegram_id, {})
    conversation.retirer(etat, conversation.QUESTION)
    bot.rafraichir_referentiel()  # une charge créée dans l'app depuis le démarrage doit être connue
    annee, mois = bot.mois_courant()
    libelles = [c["libelle"] for c in budget_lignes.charges_actives(bot.charges)]
    interp = libre.interpreter(texte, prenom, bot.membres, libelles, f"{annee}-{mois:02d}",
                               conversation.echanges(etat))
    return _noter(etat, texte, _suite(bot, etat, telegram_id, prenom, texte, interp, annee, mois))


def proposer(etat, action, prenom):
    """Annonce l'écriture en français clair et attend un « oui » (D-060)."""
    conversation.poser(etat, conversation.CONFIRMATION, {"action": action})
    return reponses.recap_libre(action, prenom)


def _texte(interp):
    brut = interp.get("texte")
    return brut.strip() if isinstance(brut, str) else ""


def _poser_question(etat, d):
    question = _texte(d)
    if not question:
        return reponses.non_compris()
    conversation.poser(etat, conversation.QUESTION)
    return question


def _suite(bot, etat, telegram_id, prenom, texte, interp, annee, mois):
    nom = interp.get("action")
    if nom == "demander":
        return _poser_question(etat, interp)
    if nom == "demande_evolution":
        return evolution.enregistrer(bot, prenom, _texte(interp) or texte)
    if nom == "recherche":  # le bot n'a aucun accès au web (L-057) : il note, Claude cherchera
        return evolution.enregistrer(bot, prenom, _texte(interp) or texte, evolution.GENRE_RECHERCHE)
    if nom == "ecole_nouvelles":  # lecture seule des mails de l'école, résumée en texte (ecole.py)
        return ecole.nouvelles(bot)
    if nom in ecole_espace.ACTIONS:  # lecture seule de l'espace parent ; photos et fichiers partent après le texte
        return ecole_espace.repondre(etat, interp)
    if nom in ecole_ecriture_bot.ACTIONS:  # inscription à un tour, message à l'école : proposé (« OK ? »), jamais écrit direct
        return ecole_ecriture_bot.repondre(etat, prenom, interp)
    if nom in agenda_bot.ACTIONS:  # lecture directe ; toute écriture est proposée (« OK ? ») puis confirmée
        return agenda_bot.repondre(etat, prenom, interp)
    if nom == "hors_portee":  # une vraie demande que le bot ne sait pas faire : dit franchement, noté pour Yann
        return evolution.enregistrer(bot, prenom, _texte(interp) or texte, evolution.GENRE_HORS_PORTEE)
    if nom == "question":
        question = _texte(interp)
        if not question:
            return reponses.non_compris()
        chiffres, _, _ = bot.charger_r(annee, mois)
        return libre.formuler(chiffres, question) or reponses.non_compris()
    if nom in (None, "inconnu"):
        return reponses.non_compris()

    action = traduction_libre.traduire(interp, bot.charges, bot.membres, annee, mois)
    if action["action"] == "demander":
        return _poser_question(etat, action)
    if action["action"] not in ACTIONS_ECRITURE:  # lecture (ou erreur lisible) : rien à confirmer
        return bot.executer_action(telegram_id, prenom, action, texte)
    return proposer(etat, action, prenom)
