"""L'espace parent de l'école dans le bot (lot 4) : photos, documents, tours de fleurs et d'encas, nouveautés.

Lecture seule. Chaque lecture passe par le registre d'outils (client en GET seul, chemins limités, outils.espace_parent) ;
aucune écriture : on ne s'inscrit ni ne se désinscrit d'un tour, on n'écrit à personne (lot 5, derrière un « OK ? »).
Ce qui est lu est une donnée : les titres passent par l'alerte d'injection, les messages par le résumé isolé
(ecole.py). Les fichiers à envoyer dans le chat sont posés dans `etat["envois"]` : boucle_bot les expédie après le texte.
"""
import logging
import re
from datetime import date, timedelta

import outils
import reponses
from outils import espace_parent as ep
from outils.resume import AVERTISSEMENT_SUSPECT

ACTIONS = frozenset({"ecole_photos", "ecole_documents", "ecole_tours"})
IMPOSSIBLE = "Je n'arrive pas à lire l'espace parent de l'école pour l'instant."
JOURS_NOUVEAUTE = 30
PHOTOS_MAX = 10
OCTETS_PHOTO_MAX = 10 * 1024 * 1024  # au-delà, Telegram refuse une « photo » : envoyée comme fichier
LEGENDE_MAX = 200
LIGNES_MAX = 10
JOURS = ("lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim.")
LIBELLES_TOURS = {"fleurs": "Fleurs du lundi", "encas": "Encas du matin"}

log = logging.getLogger("bot")


def _fr(iso):
    return date.fromisoformat(iso).strftime("%d/%m/%Y") if iso else "date inconnue"


def _jour(iso):
    d = date.fromisoformat(iso)
    return f"{JOURS[d.weekday()]} {d:%d/%m}"


def ouvrir():
    """(session, origine) : connexion (hors outil) puis inscription des outils pour cet hôte."""
    session, origine = ep.connecter()
    ep.assurer_inscrit(origine)
    return session, origine


def lire(nom, session, origine, **args):
    return outils.executer_lecture(nom, session=session, origine=origine, **args)


def _prefixe(texte, *sources):
    """Texte précédé de l'alerte si une source lue ressemble à un ordre donné à une IA."""
    if any(outils.contenu_suspect(s) for s in sources):
        log.warning("contenu suspect détecté dans l'espace parent (contenu non journalisé)")
        return f"{AVERTISSEMENT_SUSPECT}\n{texte}"
    return texte


# ---------- nouveautés (résumées par ecole.nouvelles) ----------
def nouveautes(session=None, origine=None, jours=JOURS_NOUVEAUTE):
    """Blocs de texte à résumer : messages reçus et documents publiés ces `jours` derniers jours."""
    if session is None:
        session, origine = ouvrir()
    limite = (ep.aujourdhui() - timedelta(days=jours)).isoformat()
    messages = [m for m in lire(ep.NOM_MESSAGES, session, origine)
                if m["date"] >= limite and m["expediteur"] != "nous"]
    documents = [d for d in lire(ep.NOM_DOCUMENTS, session, origine) if d["date"] >= limite]
    return ([f"Message de l'école ({m['expediteur']}) du {_fr(m['date'])}\n{m['texte']}" for m in messages]
            + [f"Nouveau document de l'école du {_fr(d['date'])} : {d['titre']}" for d in documents])


# ---------- tours de fleurs et d'encas ----------
def _dates(tours, texte_tour):
    lignes = [texte_tour(t) for t in tours[:LIGNES_MAX]]
    return ", ".join(lignes) + (f" (+ {len(tours) - LIGNES_MAX})" if len(tours) > LIGNES_MAX else "")


def _tour_texte(t):
    return _jour(t["date"]) + (f" ({t['aliment']})" if t["aliment"] else "")


def _phrase_tours(nom, tours, libres):
    mes_tours = [t for t in tours if t["nous"]]
    places = [t for t in tours if t["libres"]]
    pluriel = len(mes_tours) > 1
    debut = (f"{LIBELLES_TOURS[nom]} : {'nos prochains tours' if pluriel else 'notre prochain tour'} : "
             f"{_dates(mes_tours, _tour_texte)}." if mes_tours else f"{LIBELLES_TOURS[nom]} : pas de tour prévu pour nous.")
    if libres:
        suite = (f"Places libres : {_dates(places, _tour_texte)}." if places else "Plus aucune place libre.")
    else:
        suite = f"{len(places)} date{'s' if len(places) > 1 else ''} encore libre{'s' if len(places) > 1 else ''}." if places else ""
    return f"{debut} {suite}".strip()


def tours(interp):
    quoi = interp.get("quoi") if interp.get("quoi") in LIBELLES_TOURS else None
    try:
        session, origine = ouvrir()
        trouves = lire(ep.NOM_TOURS, session, origine)
    except Exception as exc:
        log.error("espace parent : tours illisibles (%s)", type(exc).__name__)
        return IMPOSSIBLE
    phrases = [_phrase_tours(nom, trouves[nom], bool(interp.get("libres")))
               for nom in LIBELLES_TOURS if quoi in (None, nom)]
    aliments = [t["aliment"] for nom in trouves for t in trouves[nom]]
    return _prefixe("\n".join(phrases), *aliments)


# ---------- documents ----------
def _mots(texte):
    return re.findall(r"\w+", reponses.normaliser(texte or ""))


def _documents_cherches(documents, cherche):
    mots = _mots(cherche)
    return [d for d in documents if mots and all(m in reponses.normaliser(d["titre"]) for m in mots)]


def _liste_documents(documents):
    if not documents:
        return "Aucun document daté sur l'espace parent."
    lignes = [f"{_fr(d['date'])} : {d['titre']}" for d in documents]
    return _prefixe("Derniers documents de l'école :\n" + "\n".join(lignes), *(d["titre"] for d in documents))


def _envoyer_document(etat, session, origine, document):
    fichier = lire(ep.NOM_FICHIER, session, origine, url=document["url"], octets_max=ep.OCTETS_MAX)
    if fichier["contenu"] is None:
        return f"« {document['titre']} » est trop gros pour Telegram."
    etat.setdefault("envois", []).append({"nom": fichier["nom"], "contenu": fichier["contenu"],
                                          "genre": "document", "legende": document["titre"][:LEGENDE_MAX]})
    return f"Voici « {document['titre']} » ({_fr(document['date'])})."


def documents(etat, interp):
    cherche = interp.get("fichier") if isinstance(interp.get("fichier"), str) else None
    try:
        session, origine = ouvrir()
        trouves = lire(ep.NOM_DOCUMENTS, session, origine, maximum=100 if cherche else ep.DOCUMENTS_MAX)
        if not cherche:
            return _liste_documents(trouves)
        candidats = _documents_cherches(trouves, cherche)
        if not candidats:
            return f"Je ne trouve aucun document « {cherche} » sur l'espace parent."
        if len(candidats) > 1:
            return "Plusieurs documents correspondent, lequel ?\n" + _liste_documents(candidats[:LIGNES_MAX])
        return _envoyer_document(etat, session, origine, candidats[0])
    except Exception as exc:
        log.error("espace parent : documents illisibles (%s)", type(exc).__name__)
        return IMPOSSIBLE


# ---------- photos et vidéos ----------
def _nombre(valeur):
    if isinstance(valeur, int) and not isinstance(valeur, bool) and valeur >= 1:
        return min(valeur, PHOTOS_MAX)
    return None


def choisir_medias(medias, nombre):
    """Les `nombre` plus récents ; sans nombre, tous les médias de la date la plus récente (10 au plus)."""
    if nombre:
        return medias[:nombre]
    datees = [m["date"] for m in medias if m["date"]]
    if not datees:
        return medias[:1]
    return [m for m in medias if m["date"] == max(datees)][:PHOTOS_MAX]


def _telecharger(session, origine, media):
    """L'envoi à faire pour ce média, ou None s'il est trop gros / illisible (le lien sera donné dans le texte)."""
    fichier = lire(ep.NOM_FICHIER, session, origine, url=media["url"], octets_max=ep.OCTETS_MAX)
    if fichier["contenu"] is None:
        return None
    genre = "document" if media["genre"] == "photo" and len(fichier["contenu"]) > OCTETS_PHOTO_MAX else media["genre"]
    return {"nom": fichier["nom"], "contenu": fichier["contenu"], "genre": genre, "legende": media["titre"][:LEGENDE_MAX]}


def photos(etat, interp):
    try:
        session, origine = ouvrir()
        medias = choisir_medias(lire(ep.NOM_PHOTOS, session, origine), _nombre(interp.get("nombre")))
        if not medias:
            return "Pas de photo sur l'espace parent pour l'instant."
        envois, liens = [], []
        for media in medias:
            try:
                envoi = _telecharger(session, origine, media)
            except Exception as exc:  # un média raté n'empêche pas les autres
                log.error("espace parent : un média n'a pas pu être lu (%s)", type(exc).__name__)
                envoi = None
            if envoi:
                envois.append(envoi)
            else:
                liens.append(media["url"])
    except Exception as exc:
        log.error("espace parent : photos illisibles (%s)", type(exc).__name__)
        return IMPOSSIBLE
    etat.setdefault("envois", []).extend(envois)
    return _prefixe(_texte_photos(medias, len(envois), liens), *(m["titre"] for m in medias))


def _texte_photos(medias, envoyes, liens):
    dates = sorted({m["date"] for m in medias if m["date"]}, reverse=True)
    quand = f" du {_fr(dates[0])}" if len(dates) == 1 else ""
    texte = f"{envoyes} photo(s) ou vidéo(s){quand} de l'espace parent." if envoyes else "Je n'ai pas pu envoyer les médias."
    if liens:
        texte += "\nTrop gros ou illisibles, à ouvrir sur l'espace parent :\n" + "\n".join(liens)
    return texte


def repondre(etat, interp):
    """Réponse à une action ecole_* du modèle (lecture seule)."""
    return {"ecole_photos": lambda: photos(etat, interp),
            "ecole_documents": lambda: documents(etat, interp),
            "ecole_tours": lambda: tours(interp)}[interp["action"]]()
