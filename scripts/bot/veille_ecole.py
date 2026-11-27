"""Veille de l'école trois fois par jour (tâche planifiée MaxHome-VeilleEcole, D-073) : ce qui est NOUVEAU depuis le
dernier passage (mails de l'école, messages et documents de l'espace parent, photos et vidéos) est posté dans le
groupe Telegram du foyer (repli : Yann en privé).

Lecture seule, par les outils gardés du bot (registre, client GET seul : outils.gmail, outils.espace_parent). Le texte
lu ne sert qu'au résumé isolé (outils.resume) : il ne commande rien. Les photos nouvelles sont envoyées dans le groupe.
L'état local data/veille_ecole.json = {"vus": [empreintes], "verifie": ISO, "echecs": {source: n de suite}} ; une
empreinte est un hachage court (jamais un texte, une adresse ou un nom de fichier en clair).
Premier passage (aucun état) : seul ce qui date de JOURS_PREMIER jours est annoncé, le reste est marqué vu.
Le cœur (`decider`) est pur ; connexions, envoi et horloge sont injectés (tests hors ligne).
Sortie : 0 = passage fait (même sans nouveauté), 2 = envoi Telegram impossible (rien n'est marqué vu, retenté).
trois fois par jour (tâche planifiée MaxHome-VeilleEcole, D-073) : python scripts/bot/veille_ecole.py
"""
import hashlib
import json
import logging
import logging.handlers
import sys
from datetime import datetime, timedelta
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
sys.path.insert(0, str(RACINE / "scripts" / "bot"))

DATA = RACINE / "data"
FICHIER_ETAT = DATA / "veille_ecole.json"
FICHIER_JOURNAL = DATA / "veille_ecole.log"
PRENOM_REPLI = "Yann"
CLE_GROUPE = "telegram_groupe"   # même paramètre que groupe.CLE_PARAMETRE (rappels au groupe)
JOURS_PREMIER = 7                # premier passage : on annonce la dernière semaine, pas tout l'historique
JOURS_FENETRE = 14               # au-delà, un élément jamais vu (page réordonnée) n'est plus une nouveauté
VUS_MAX = 600
MAILS_MAX = 15
MESSAGES_MAX = 20
PHOTOS_ENVOI_MAX = 10
EXTRAIT_MAX = 300
ECHECS_AVANT_ALERTE = 3
MAILS, ESPACE = "mails", "espace"
LIBELLES_SOURCE = {MAILS: "la boîte mail de l'école", ESPACE: "l'espace parent de l'école"}
QUESTION = ("Voici les nouveautés de l'école depuis la dernière vérification. Pour chaque mail, message ou document, "
            "donne la date, de qui et l'essentiel en une ou deux phrases ; signale en premier ce qui demande une action "
            "des parents (réponse, inscription, objet à apporter, date).")
TITRE = "Nouveau à l'école :"
MESSAGE_ILLISIBLE = "Je n'arrive plus à lire {source} depuis {n} vérifications, regarde toi-même."

log = logging.getLogger("veille_ecole")


def empreinte(*parties):
    return hashlib.sha256("\x1f".join(str(p) for p in parties).encode("utf-8")).hexdigest()[:20]


# ---------- éléments lus -> nouveautés (pur) ----------
def elements(mails, messages, documents, photos):
    """Tout ce qui a été lu, sous une forme commune : {cle, genre, date (aaaa-mm-jj ou « »), ...}."""
    from outils.ecole_pages import date_iso
    sortie = [{"cle": empreinte("mail", m.get("id") or (m["date"], m["objet"])), "genre": "mail",
               "date": date_iso(m["date"]), "de": m["de"], "objet": m["objet"], "texte": m["texte"]} for m in mails]
    sortie += [{"cle": empreinte("msg", m["date"], m["heure"], m["expediteur"], m["texte"]), "genre": "message",
                "date": m["date"], "de": m["expediteur"], "texte": m["texte"]}
               for m in messages if m["expediteur"] != "nous"]
    sortie += [{"cle": empreinte("doc", d["url"]), "genre": "document", "date": d["date"], "titre": d["titre"],
                "url": d["url"]} for d in documents]
    sortie += [{"cle": empreinte("media", p["url"]), "genre": p["genre"], "date": p["date"], "titre": p["titre"],
                "url": p["url"]} for p in photos]
    return sortie


def decider(etat, trouves, aujourdhui):
    """(nouveautés à annoncer, liste des empreintes vues mise à jour). Pur."""
    premier = etat.get("vus") is None
    vus = set(etat.get("vus") or [])
    limite = (aujourdhui - timedelta(days=JOURS_PREMIER if premier else JOURS_FENETRE)).isoformat()

    def recent(e):
        return e["date"] >= limite if e["date"] else not premier  # sans date : nouveau, sauf au premier passage
    nouveaux = [e for e in trouves if e["cle"] not in vus and recent(e)]
    deja = list(etat.get("vus") or [])
    ajout = [e["cle"] for e in trouves if e["cle"] not in vus]
    return nouveaux, list(dict.fromkeys(deja + ajout))[-VUS_MAX:]


def _fr(iso):
    return f"{iso[8:10]}/{iso[5:7]}" if iso else "date inconnue"


def bloc(e):
    """Texte d'une nouveauté pour le résumé (donnée lue, jamais un ordre)."""
    if e["genre"] == "mail":
        return f"Mail du {_fr(e['date'])} de {e['de']}\nObjet : {e['objet']}\n{e['texte']}"
    if e["genre"] == "message":
        return f"Message de l'espace parent du {_fr(e['date'])} ({e['de']})\n{e['texte']}"
    return f"Nouveau document de l'école du {_fr(e['date'])} : {e['titre']}"


def ligne_secours(e):
    """Une ligne sans modèle (si le résumé échoue) : de qui, quand, le début du texte."""
    if e["genre"] == "mail":
        return f"• Mail du {_fr(e['date'])} ({e['de']}) : {e['objet']}"
    if e["genre"] == "message":
        extrait = e["texte"] if len(e["texte"]) <= EXTRAIT_MAX else e["texte"][:EXTRAIT_MAX].rstrip() + "…"
        return f"• Message du {_fr(e['date'])} ({e['de']}) : {extrait}"
    return f"• Document du {_fr(e['date'])} : {e['titre']}"


def texte_annonce(nouveaux, resumer):
    """Le message texte à poster (None si rien d'écrit à annoncer, seulement des médias ou rien)."""
    from outils.resume import AVERTISSEMENT_SUSPECT, ECHEC
    from outils.injection import contenu_suspect
    ecrits = [e for e in nouveaux if e["genre"] in ("mail", "message", "document")]
    medias = [e for e in nouveaux if e["genre"] in ("photo", "video")]
    parties = []
    if ecrits:
        try:
            resume = resumer("\n\n".join(bloc(e) for e in ecrits), QUESTION)
        except Exception as exc:
            log.error("résumé impossible (%s)", type(exc).__name__)
            resume = ECHEC
        if resume.strip() in (ECHEC, f"{AVERTISSEMENT_SUSPECT}\n{ECHEC}"):
            secours = "\n".join(ligne_secours(e) for e in ecrits)
            suspect = any(contenu_suspect(bloc(e)) for e in ecrits)
            resume = f"{AVERTISSEMENT_SUSPECT}\n{secours}" if suspect else secours
        parties.append(f"{TITRE}\n{resume}")
    if medias:
        n = len(medias)
        texte = f"{n} nouvelle{'s' if n > 1 else ''} photo{'s' if n > 1 else ''} ou vidéo{'s' if n > 1 else ''} sur l'espace parent"
        if n > PHOTOS_ENVOI_MAX:
            texte += f" : je t'envoie les {PHOTOS_ENVOI_MAX} plus récentes, demande « photos de l'école » pour la suite"
        parties.append(texte + ".")
    return "\n\n".join(parties) or None


def compter_echecs(etat, lus):
    """(échecs par source, messages d'alerte). `lus` : {source: True (lue) | False (échec) | None (non configurée)}."""
    echecs, alertes = dict(etat.get("echecs") or {}), []
    for source, ok in lus.items():
        if ok is False:
            echecs[source] = echecs.get(source, 0) + 1
            if echecs[source] == ECHECS_AVANT_ALERTE:
                alertes.append(MESSAGE_ILLISIBLE.format(source=LIBELLES_SOURCE[source], n=ECHECS_AVANT_ALERTE))
        else:
            echecs[source] = 0
    return echecs, alertes


# ---------- bords : lecture ----------
def lire_mails(donnees, http=None):
    """Mails récents de l'école, ou None si illisibles ; [] si rien à lire (expéditeurs non posés : journalisé)."""
    import ecole
    import outils
    from outils import gmail
    expediteurs = ecole.lire_expediteurs(donnees.parametre(ecole.CLE_EXPEDITEURS))
    if not expediteurs:
        log.warning("expéditeurs de l'école non posés (parametres.%s) : mails non lus", ecole.CLE_EXPEDITEURS)
        return []
    gmail.assurer_inscrit()
    try:
        session = gmail.session_gmail(donnees.parametre(ecole.CLE_BOITE), http)
        return outils.executer_lecture(gmail.NOM_OUTIL, session=session, expediteurs=expediteurs,
                                       jours=JOURS_FENETRE, maximum=MAILS_MAX)
    except Exception as exc:
        log.error("mails de l'école illisibles (%s)", type(exc).__name__)
        return None


def lire_espace(ouvrir):
    """(messages, documents, photos, session, origine) ; None si illisible ; ([], [], [], None, None) si non configuré."""
    import outils
    from outils import espace_parent as ep
    try:
        session, origine = ouvrir()

        def lire(nom, **args):
            return outils.executer_lecture(nom, session=session, origine=origine, **args)
        return (lire(ep.NOM_MESSAGES, maximum=MESSAGES_MAX), lire(ep.NOM_DOCUMENTS),
                lire(ep.NOM_PHOTOS), session, origine)
    except ep.EspaceParentNonConfigure:
        log.warning("variables de l'espace parent non posées : espace parent non lu")
        return [], [], [], None, None
    except Exception as exc:
        log.error("espace parent illisible (%s)", type(exc).__name__)
        return None


def telecharger_medias(medias, session, origine):
    """Les envois Telegram des médias (les plus récents d'abord) ; un média trop gros ou illisible est sauté."""
    import ecole_espace
    envois = []
    for media in medias[:PHOTOS_ENVOI_MAX]:
        try:
            envoi = ecole_espace._telecharger(session, origine, media)
        except Exception as exc:
            log.error("un média de l'école n'a pas pu être lu (%s)", type(exc).__name__)
            envoi = None
        if envoi:
            envois.append(envoi)
    return envois


# ---------- un passage ----------
def lire_etat(chemin):
    if not chemin.exists():
        return {"vus": None, "verifie": None, "echecs": {}}
    return {"vus": None, "verifie": None, "echecs": {}, **json.loads(chemin.read_text(encoding="utf-8"))}


def ecrire_etat(chemin, etat):
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_text(json.dumps(etat, ensure_ascii=False, indent=1), encoding="utf-8")


def passer(lire_mails_, lire_espace_, envoyer, envoyer_fichiers, resumer, telecharger, maintenant,
           chemin_etat=FICHIER_ETAT):
    """Un passage complet. `envoyer(texte)`, `envoyer_fichiers(liste)` postent au foyer. Retourne le code de sortie."""
    etat = lire_etat(chemin_etat)
    mails = lire_mails_()
    espace = lire_espace_()
    messages, documents, photos, session, origine = espace if espace is not None else ([], [], [], None, None)
    lus = {MAILS: mails is not None, ESPACE: None if espace is not None and session is None else espace is not None}
    trouves = elements(mails or [], messages, documents, photos)
    nouveaux, vus = decider(etat, trouves, maintenant.date())
    echecs, alertes = compter_echecs(etat, lus)
    texte = texte_annonce(nouveaux, resumer)
    try:
        for t in ([texte] if texte else []) + alertes:
            envoyer(t)
    except Exception as exc:  # rien n'est marqué vu : retenté au prochain passage
        log.error("envoi Telegram impossible (%s)", type(exc).__name__)
        return 2
    medias = [e for e in nouveaux if e["genre"] in ("photo", "video")]
    if medias and session is not None:
        try:
            envois = telecharger(medias, session, origine)
            if envois:
                envoyer_fichiers(envois)
        except Exception as exc:  # le texte est parti : on ne renvoie pas tout, on le dit
            log.error("envoi des photos impossible (%s)", type(exc).__name__)
            try:
                envoyer("Je n'ai pas réussi à envoyer les photos : demande « photos de l'école ».")
            except Exception:
                pass
    ecrire_etat(chemin_etat, {"vus": vus, "verifie": maintenant.isoformat(timespec="seconds"), "echecs": echecs})
    log.info("mails : %s ; espace : %s ; nouveautés : %d ; alertes : %d",
             "lus" if lus[MAILS] else "échec", {True: "lu", False: "échec", None: "non configuré"}[lus[ESPACE]],
             len(nouveaux), len(alertes))
    return 0


def configurer_journal():
    DATA.mkdir(exist_ok=True)
    log.setLevel(logging.INFO)
    handler = logging.handlers.RotatingFileHandler(FICHIER_JOURNAL, maxBytes=500_000, backupCount=2, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    log.addHandler(handler)
    log.addHandler(logging.StreamHandler(sys.stdout))
    for h in log.handlers:  # les outils journalisent sous « bot » : même fichier
        logging.getLogger("bot").addHandler(h)


def destination(donnees):
    """Le chat où poster : le groupe du foyer s'il est enregistré, sinon Yann en privé."""
    groupe = donnees.parametre(CLE_GROUPE)
    if groupe:
        return int(groupe)
    telegram_id = donnees.telegram_id_de(PRENOM_REPLI)
    if telegram_id is None:
        raise RuntimeError(f"ni groupe enregistré ni membre Telegram « {PRENOM_REPLI} »")
    return telegram_id


def main():
    import ecole_espace
    import outils
    from donnees import Donnees
    from provision import cles, lit_env
    from telegram import Telegram
    configurer_journal()
    env = lit_env()
    ref = env["SUPABASE_REF"]
    _, service_role = cles(ref, env["SUPABASE_PAT"])
    donnees = Donnees(ref, service_role)
    telegram = Telegram(env["MAXHOME_TELEGRAM_BOT_TOKEN"])
    chat = {}

    def chat_id():
        return chat.setdefault("id", destination(donnees))
    return passer(lambda: lire_mails(donnees), lambda: lire_espace(ecole_espace.ouvrir),
                  lambda texte: telegram.envoyer(chat_id(), texte),
                  lambda fichiers: telegram.envoyer_fichiers(chat_id(), fichiers),
                  lambda contenu, question: outils.resumer(contenu, question, outil="veille_ecole"),
                  telecharger_medias, datetime.now())


if __name__ == "__main__":
    sys.exit(main())
