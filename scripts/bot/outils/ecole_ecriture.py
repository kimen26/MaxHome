"""Écritures sur l'espace parent de l'école (brief bot-ecole-agenda, lot 5) : s'inscrire à un tour de fleurs ou d'encas,
s'en désinscrire, envoyer un message dans le fil de la messagerie.

Trois outils de genre ÉCRITURE : ils ne s'exécutent que par registre.confirmer, donc APRÈS un « oui » d'un membre
(la proposition « OK ? » est posée par ecole_ecriture_bot.py). Chacun :
  1. se connecte (espace_parent.connecter, hors outil) et RELIT la page juste avant d'écrire : date plus libre, tour qui
     n'est pas le nôtre, formulaire introuvable ou incomplet -> refus en français, rien n'est posté ;
  2. poste par un ClientEcriture : POST seulement, vers les seules URL de formulaire (fleurs, encas, un fil de messagerie).
     La Facturation, la déconnexion, toute autre URL lèvent EcritureBloquee ;
  3. RELIT la page et répond selon l'effet réel (« C'est fait : ... » ou « Le site n'a pas pris ... »).
Les fonctions rendent toujours une phrase prête à envoyer. Aucune valeur (hôte, identifiant, jeton, texte du message) n'est
journalisée. Le texte d'un message est celui du membre : ce module ne génère rien.
"""
import logging
import re
from datetime import date as jour_date

from outils import ecole_formulaires as formulaires
from outils import ecole_pages, registre
from outils import espace_parent as ep
from outils.garde import ClientEcriture, ClientLecture

log = logging.getLogger("bot")

NOM_INSCRIRE, NOM_DESINSCRIRE, NOM_MESSAGE = "ecole_inscrire_tour", "ecole_desinscrire_tour", "ecole_envoyer_message"
TYPES = ("fleurs", "encas")
CHEMINS_TOURS = {"fleurs": ep.CHEMIN_FLEURS, "encas": ep.CHEMIN_ENCAS}
CHAMPS_REQUIS = {"fleurs": formulaires.CHAMPS_FLEURS, "encas": formulaires.CHAMPS_ENCAS}
LIBELLES = {"fleurs": "aux fleurs", "encas": "aux encas"}
LIBELLES_DES = {"fleurs": "des fleurs", "encas": "des encas"}
JOURS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")
TEXTE_MAX = 1500
ENFANT = ecole_pages.PRENOM_ENFANT.capitalize()
JOIGNABLE = "Je n'arrive pas à joindre l'espace parent, rien n'a été envoyé."
A_VERIFIER = "Je n'ai pas pu vérifier le résultat : regarde sur l'espace parent avant de redemander."


def phrase_tour(quoi, iso, de=False):
    """« aux encas du jeudi 03/12 » (`de` : « des encas du jeudi 03/12 »)."""
    d = jour_date.fromisoformat(iso)
    return f"{(LIBELLES_DES if de else LIBELLES)[quoi]} du {JOURS[d.weekday()]} {d:%d/%m}"


def chemins_ecriture(origine):
    """Les SEULES URL où ce module peut poster (motifs compilés, fullmatch, query exclue)."""
    base = re.escape(origine)
    return (re.compile(base + re.escape(ep.CHEMIN_FLEURS)), re.compile(base + re.escape(ep.CHEMIN_ENCAS)),
            re.compile(base + re.escape(ep.CHEMIN_MESSAGERIE) + r"/\d+"))


def _chemins_relecture(origine):
    base = re.escape(origine)
    return (re.compile(base + re.escape(ep.CHEMIN_FLEURS)), re.compile(base + re.escape(ep.CHEMIN_ENCAS)),
            re.compile(base + re.escape(ep.CHEMIN_MESSAGERIE)), re.compile(base + re.escape(ep.CHEMIN_MESSAGERIE) + r"/\d+"))


def _ouvrir(nom):
    """(client de relecture GET, client d'écriture POST, origine)."""
    session, origine = ep.connecter()
    return (ClientLecture(session, nom, _chemins_relecture(origine)),
            ClientEcriture(session, nom, chemins_ecriture(origine)), origine)


# ---------- tours ----------
def _situation(lecture, origine, quoi, iso):
    """(état du tour ce jour-là : libre|nous|pris|None, champs du formulaire à poster)."""
    html = ep._page(lecture, origine + CHEMINS_TOURS[quoi])
    if quoi == "fleurs":
        jour = formulaires.formulaires_fleurs(html).get(iso)
        return (jour["etat"], jour["champs"]) if jour else (None, {})
    jours, inscription, desinscription = formulaires.formulaires_encas(html)
    jour = jours.get(iso)
    if jour is None:
        return None, {}
    if jour["nous"]:
        return formulaires.NOUS, {**desinscription, "child_id": jour["nous"]["child_id"], "taste_date_id": jour["nous"]["id"]}
    if jour["libres"]:
        place = jour["libres"][0]
        return formulaires.LIBRE, {**inscription, "child_id": place["child_id"], "taste_date_id": place["id"]}
    return formulaires.PRIS, {}


def _refus(etat, voulu, quoi, iso):
    """Phrase de refus si l'état relu n'est pas celui qu'exige l'écriture ; None sinon."""
    if etat is None:
        return "Je ne vois pas ce jour-là sur l'espace parent, rien n'a été changé."
    tour = phrase_tour(quoi, iso)
    if voulu == formulaires.LIBRE:
        if etat == formulaires.NOUS:
            return f"{ENFANT} est déjà inscrit {tour}, rien n'a été changé."
        if etat == formulaires.PRIS:
            return f"Il n'y a plus de place {tour}, rien n'a été changé."
        return None
    return None if etat == formulaires.NOUS else f"Ce n'est pas notre tour {tour}, rien n'a été changé."


def _changer_tour(nom, quoi, iso, voulu):
    """Inscrit (voulu = libre au départ) ou désinscrit (voulu = nous au départ) ; rend la phrase du résultat."""
    if quoi not in TYPES or not isinstance(iso, str) or ecole_pages.date_iso(iso) != iso:
        return "Je n'ai pas compris quel tour (fleurs ou encas) ni quelle date, rien n'a été changé."
    inscrire = voulu == formulaires.LIBRE
    try:
        lecture, ecriture, origine = _ouvrir(nom)
        etat, champs = _situation(lecture, origine, quoi, iso)
    except Exception as exc:
        log.error("espace parent : %s impossible avant d'écrire (%s)", nom, type(exc).__name__)
        return JOIGNABLE
    refus = _refus(etat, voulu, quoi, iso)
    if refus:
        return refus
    if not CHAMPS_REQUIS[quoi] <= set(champs) or not all(champs[c] for c in CHAMPS_REQUIS[quoi]):
        log.error("espace parent : formulaire de %s incomplet (la page a changé ?)", quoi)
        return "Je ne trouve pas le bon formulaire sur l'espace parent (la page a changé ?), rien n'a été changé."
    try:
        ecriture.post(origine + CHEMINS_TOURS[quoi], data=champs, timeout=ep.DELAI_S)
    except Exception as exc:  # le jugement se fait sur la relecture, pas sur la réponse du POST
        log.error("espace parent : envoi de %s en échec (%s)", nom, type(exc).__name__)
    try:
        apres, _ = _situation(lecture, origine, quoi, iso)
    except Exception as exc:
        log.error("espace parent : relecture après %s impossible (%s)", nom, type(exc).__name__)
        return A_VERIFIER
    effet = apres == formulaires.NOUS if inscrire else apres in (formulaires.LIBRE, formulaires.PRIS)
    tour = phrase_tour(quoi, iso)
    if effet:
        return f"C'est fait : {ENFANT} est inscrit {tour}." if inscrire else f"C'est fait : {ENFANT} n'est plus inscrit {tour}."
    chose = "l'inscription" if inscrire else "la désinscription"
    pas_pris = f"Le site n'a pas pris {chose} {tour}."
    return f"{pas_pris} Rien n'a changé : regarde sur l'espace parent."


def inscrire_tour(quoi, date):
    """Inscrit Max au tour `quoi` (fleurs|encas) de la date `date` (aaaa-mm-jj) si elle est libre."""
    return _changer_tour(NOM_INSCRIRE, quoi, date, formulaires.LIBRE)


def desinscrire_tour(quoi, date):
    """Désinscrit Max du tour `quoi` de la date `date`, seulement si c'est notre tour."""
    return _changer_tour(NOM_DESINSCRIRE, quoi, date, formulaires.NOUS)


# ---------- messagerie ----------
def _norme(texte):
    return " ".join(str(texte).split())


def _messages_nous(lecture, url):
    return {(m["date"], m["heure"], m["texte"]) for m in ecole_pages.parser_messages(ep._page(lecture, url))
            if m["expediteur"] == ecole_pages.CHAT_NOUS}


def envoyer_message(texte, fil=None):
    """Envoie `texte` (celui du membre, tel quel) dans le fil de messagerie de Max (`fil` : son numéro, s'il y en a plusieurs)."""
    texte = _norme(texte) if isinstance(texte, str) else ""
    if not texte or len(texte) > TEXTE_MAX:
        return f"Le message doit faire entre 1 et {TEXTE_MAX} caractères, rien n'a été envoyé."
    try:
        lecture, ecriture, origine = _ouvrir(NOM_MESSAGE)
        fils = formulaires.chats_de_l_enfant(ep._page(lecture, origine + ep.CHEMIN_MESSAGERIE))
        if not fils or (fil is not None and str(fil) not in fils) or (fil is None and len(fils) > 1):
            return f"Je ne trouve pas un seul fil de messagerie pour {ENFANT}, rien n'a été envoyé."
        url = f"{origine}{ep.CHEMIN_MESSAGERIE}/{fils[0] if fil is None else str(fil)}"
        champs = formulaires.champs_message(ep._page(lecture, url))
        avant = _messages_nous(lecture, url)
    except Exception as exc:
        log.error("espace parent : message impossible avant d'écrire (%s)", type(exc).__name__)
        return JOIGNABLE
    if not champs.get("_token"):
        log.error("espace parent : formulaire de message incomplet (la page a changé ?)")
        return "Je ne trouve pas le formulaire de message sur l'espace parent (la page a changé ?), rien n'a été envoyé."
    try:
        ecriture.post(url, data={**champs, "message": texte}, timeout=ep.DELAI_S)
    except Exception as exc:  # le jugement se fait sur la relecture
        log.error("espace parent : envoi du message en échec (%s)", type(exc).__name__)
    try:
        apres = _messages_nous(lecture, url)
    except Exception as exc:
        log.error("espace parent : relecture après message impossible (%s)", type(exc).__name__)
        return A_VERIFIER
    if any(m[2] == texte for m in apres - avant):
        return "C'est fait : le message est dans le fil de l'école."
    return "Le site n'a pas pris le message : je ne le vois pas dans le fil. Regarde sur l'espace parent avant de le renvoyer."


def assurer_inscrit():
    """Inscrit les trois outils d'écriture (genre ecriture : jamais exécutés sans « oui »)."""
    for nom, fonction in ((NOM_INSCRIRE, inscrire_tour), (NOM_DESINSCRIRE, desinscrire_tour), (NOM_MESSAGE, envoyer_message)):
        if not registre.inscrit(nom):
            registre.inscrire(nom, registre.ECRITURE, fonction)
