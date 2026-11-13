"""Le web dans le bot (brief bot-web-documents, lot B) : un lien est lu et résumé, une question rapide est cherchée.

  - LIEN dans un message adressé au bot : outil de lecture `web_page` (outils/web_page.py : anti-SSRF, GET seul),
    texte extrait, puis outils.resumer (appel séparé, texte seul). Si un voyage à venir est nommé, le bot propose de
    ranger l'offre comme idée dans ce voyage ; rien n'est écrit avant le « oui » (attente_voyage, type « idee »).
  - QUESTION RAPIDE (action libre `web_recherche`) : outil de lecture `web_recherche`, un `claude -p` à part avec
    WebSearch seul (claude_cli.lancer_recherche), dont le prompt ne porte que la question et la date.
Ce qui est lu (page, résultats) est une donnée : il ne produit que du texte, jamais le choix de l'action suivante.
"""
import logging
import re
import time

import claude_cli
import libre
import outils
import reponses_web as textes
import voyages as voyages_mod
from outils import web_page
from outils.garde import LectureRefusee
from outils.resume import ECHEC
from reponses import normaliser

log = logging.getLogger("bot")

NOM_RECHERCHE = "web_recherche"
SANS_SESSION = object()  # web_recherche ne parle pas HTTP : le client de lecture reste inutilisé
MOTS_MAX_AUTOUR = 8      # au-delà, le message est une demande à part entière (« compare... »), pas « regarde ce lien »
ATTENTE_MINUTES = 30
RESUME_IDEE_MAX = 700
TITRE_IDEE_MAX = 80
QUESTION_MAX = 500
REPONSE_MAX = 1800
MOT_TITRE_MIN = 5        # un mot du titre d'un voyage compte pour le nommer à partir de cette longueur

_RE_MOT = re.compile(r"\w+")
_RE_LIEN = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)
_PONCTUATION_FINALE = ".,;:!?)]}»"


def lien_du_message(texte):
    """(lien, reste du message) si le message porte UN lien et peu d'autres mots, sinon None."""
    liens = _RE_LIEN.findall(texte)
    if len(liens) != 1:
        return None
    reste = " ".join(_RE_LIEN.sub(" ", texte).split())
    if len(reste.split()) > MOTS_MAX_AUTOUR:
        return None
    return liens[0].rstrip(_PONCTUATION_FINALE), reste


# ---------- voyage nommé ----------
def _noms(voyage):
    noms = [normaliser(voyage["titre"]), normaliser(voyage.get("lieu") or "")]
    noms += [m for m in _RE_MOT.findall(noms[0]) if len(m) >= MOT_TITRE_MIN and not m.isdigit()]
    return [" ".join(_RE_MOT.findall(n)) for n in noms if len(n) >= MOT_TITRE_MIN - 1]


def voyage_nomme(texte, voyages):
    """Le seul voyage à venir que le texte nomme (titre, destination ou mot du titre), sinon None."""
    mots = " " + " ".join(_RE_MOT.findall(normaliser(texte))) + " "
    trouves = [v for v in voyages_mod.voyages_a_venir(voyages, libre.aujourdhui())
               if any(f" {n} " in mots for n in _noms(v))]
    return trouves[0] if len(trouves) == 1 else None


# ---------- lien ----------
def _lire(lien):
    """Texte de la page, ou (None, phrase à dire)."""
    web_page.assurer_inscrit()
    try:
        return outils.executer_lecture(web_page.NOM, session=web_page.ouvrir_session(), url=lien), None
    except (LectureRefusee, web_page.ErreurWeb) as exc:  # déjà journalisé par le registre ; le message est écrit pour le membre
        return None, str(exc)
    except Exception as exc:
        log.error("web_page : lecture impossible (%s)", type(exc).__name__)
        return None, textes.PAGE_ILLISIBLE


def _poser_idee(bot, telegram_id, voyage, titre_page, resume, lien):
    texte = f"{resume[:RESUME_IDEE_MAX].rstrip()}\n{lien}"
    bot.etats.setdefault(telegram_id, {})["attente_voyage"] = {
        "type": "idee", "voyage_id": voyage["id"], "voyage_titre": voyage["titre"],
        "titre": f"Idée : {titre_page}"[:TITRE_IDEE_MAX] if titre_page else "Idée", "texte": texte,
        "expire": time.time() + ATTENTE_MINUTES * 60}


def reponse_au_lien(bot, telegram_id, texte):
    """Réponse à un message qui porte un lien, ou None si ce n'en est pas un (le message suit alors son chemin)."""
    trouve = lien_du_message(texte)
    if trouve is None:
        return None
    lien, reste = trouve
    page, dit = _lire(lien)
    if dit:
        return dit
    contenu = f"{page['titre']}\n{page['texte']}".strip()
    question = f"{reste or textes.QUESTION_PAR_DEFAUT} {textes.CONSIGNE_RESUME}"
    suspect = outils.contenu_suspect(contenu)
    resume = outils.resumer(contenu, question, outil=web_page.NOM)
    voyage = None if suspect or resume == ECHEC else voyage_nomme(reste, bot.donnees.voyages())
    if not voyage:
        return resume
    _poser_idee(bot, telegram_id, voyage, page["titre"], resume, lien)
    return textes.proposer_idee(resume, voyage["titre"])


# ---------- recherche rapide ----------
def _chercher(client, question):
    reponse = claude_cli.lancer_recherche(question)
    if not (reponse or "").strip():
        raise RuntimeError("recherche sans réponse")
    return reponse


def reponse_a_la_recherche(question):
    """Réponse courte avec liens à une question rapide, ou « je ne peux pas chercher pour l'instant »."""
    question = " ".join((question or "").split())[:QUESTION_MAX]
    if not question:
        return textes.RECHERCHE_VIDE
    if not outils.inscrit(NOM_RECHERCHE):
        outils.inscrire(NOM_RECHERCHE, outils.LECTURE, _chercher)
    prompt = f"Date du jour : {libre.aujourdhui().isoformat()}\nQuestion : {question}"
    try:
        reponse = outils.executer_lecture(NOM_RECHERCHE, session=SANS_SESSION, question=prompt).strip()
    except Exception as exc:  # déjà journalisé par le registre ; ni la question ni la réponse ne le sont
        log.warning("web_recherche : pas de réponse (%s)", type(exc).__name__)
        return textes.RECHERCHE_INDISPONIBLE
    if len(reponse) > REPONSE_MAX:
        reponse = reponse[:REPONSE_MAX].rstrip() + "…"
    return textes.recherche(reponse, outils.contenu_suspect(reponse))
