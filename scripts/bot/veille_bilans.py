"""Veille des inscriptions aux RDV bilans semestriels de l'école (tâche planifiée 09h, 14h, 19h).

Lecture seule de l'espace parent (outil `ecole_bilans`, GET sur une seule page), puis UN message Telegram à Yann
quand les inscriptions passent à « ouvert ». L'état connu est mémorisé dans data/veille_bilans.json :
  {"etat": dernier état lu connu ("ferme" | "ouvert" | None), "verifie": horodatage ISO, "echecs": n de suite}.
Le cœur (`decider`) est pur : ancien état + lecture -> nouvel état + messages. Le reste (connexion, envoi, horloge,
fichiers) est injecté, donc testable hors ligne. Rien d'identifiant ni d'hôte dans le journal.
Sortie : 0 = vérification faite (même sans message), 1 = variables de l'école non posées, 2 = erreur d'envoi.
Usage : python scripts/bot/veille_bilans.py
"""
import json
import logging
import logging.handlers
import sys
from datetime import datetime
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
sys.path.insert(0, str(RACINE / "scripts" / "bot"))

DATA = RACINE / "data"
FICHIER_ETAT = DATA / "veille_bilans.json"
FICHIER_JOURNAL = DATA / "veille_bilans.log"
PRENOM_DESTINATAIRE = "Yann"
ECHECS_AVANT_ALERTE = 3
OUVERT, FERME, INCONNU = "ouvert", "ferme", "inconnu"
MESSAGE_OUVERT = "Les inscriptions aux RDV bilans semestriels sont ouvertes sur l'espace parent : {url}"
MESSAGE_ILLISIBLE = "Je n'arrive plus à lire la page des RDV bilans de l'école, regarde toi-même."

log = logging.getLogger("veille_bilans")


def etat_initial():
    return {"etat": None, "verifie": None, "echecs": 0}


def decider(ancien, lecture, url, maintenant):
    """(nouvel état mémorisé, messages à envoyer). `lecture` : "ferme", "ouvert", "inconnu" ou None (erreur)."""
    verifie = maintenant.isoformat(timespec="seconds")
    if lecture not in (OUVERT, FERME):
        echecs = ancien.get("echecs", 0) + 1
        messages = [MESSAGE_ILLISIBLE] if echecs == ECHECS_AVANT_ALERTE else []
        return {**ancien, "verifie": verifie, "echecs": echecs}, messages
    messages = [MESSAGE_OUVERT.format(url=url)] if lecture == OUVERT and ancien.get("etat") != OUVERT else []
    return {"etat": lecture, "verifie": verifie, "echecs": 0}, messages


# ---------- bords : fichier d'état, lecture de la page ----------
def lire_etat(chemin):
    if not chemin.exists():
        return etat_initial()
    return {**etat_initial(), **json.loads(chemin.read_text(encoding="utf-8"))}


def ecrire_etat(chemin, etat):
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_text(json.dumps(etat, ensure_ascii=False, indent=2), encoding="utf-8")


def lire_page(connexion):
    """(état lu, url) ; (None, None) si la connexion ou la lecture échoue (jamais d'hôte dans le journal).
    EspaceParentNonConfigure remonte : ce n'est pas une panne passagère."""
    import outils
    from outils import espace_parent as ep
    try:
        session, origine = connexion()
        lu = outils.executer_lecture(ep.NOM_BILANS, session=session, origine=origine)
    except ep.EspaceParentNonConfigure:
        raise
    except Exception as exc:
        log.error("lecture de la page des bilans impossible (%s)", type(exc).__name__)
        return None, None
    return lu["etat"], lu["url"]


def verifier(connexion, envoyer, maintenant, chemin_etat=FICHIER_ETAT):
    """Une vérification complète. `envoyer(texte)` poste le message à Yann. Retourne le code de sortie."""
    from outils import espace_parent as ep
    try:
        lecture, url = lire_page(connexion)
    except ep.EspaceParentNonConfigure:
        log.error("variables de l'école non posées : rien lu")
        return 1
    nouvel, messages = decider(lire_etat(chemin_etat), lecture, url, maintenant)
    try:
        for texte in messages:
            envoyer(texte)
    except Exception as exc:  # l'état n'avance pas : le message sera retenté à la prochaine vérification
        log.error("envoi du message impossible (%s)", type(exc).__name__)
        return 2
    ecrire_etat(chemin_etat, nouvel)
    log.info("lu : %s ; messages : %d ; échecs de suite : %d", lecture or "erreur", len(messages), nouvel["echecs"])
    return 0


def configurer_journal():
    DATA.mkdir(exist_ok=True)
    log.setLevel(logging.INFO)
    handler = logging.handlers.RotatingFileHandler(FICHIER_JOURNAL, maxBytes=500_000, backupCount=2, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    log.addHandler(handler)
    log.addHandler(logging.StreamHandler(sys.stdout))


def envoyeur_telegram():
    """`envoyer(texte)` vers Yann (telegram_id lu en base) ; construit comme dans bot.py."""
    from donnees import Donnees
    from provision import cles, lit_env
    from telegram import Telegram
    env = lit_env()
    ref = env["SUPABASE_REF"]
    _, service_role = cles(ref, env["SUPABASE_PAT"])
    telegram_id = Donnees(ref, service_role).telegram_id_de(PRENOM_DESTINATAIRE)
    if telegram_id is None:
        raise RuntimeError(f"aucun membre Telegram « {PRENOM_DESTINATAIRE} »")
    telegram = Telegram(env["MAXHOME_TELEGRAM_BOT_TOKEN"])
    return lambda texte: telegram.envoyer(telegram_id, texte)


def main():
    import ecole_espace
    configurer_journal()
    # l'envoyeur n'est construit (réseau Supabase) que s'il y a un message à poster
    envoi = {}

    def envoyer(texte):
        envoi.setdefault("f", envoyeur_telegram())(texte)
    return verifier(ecole_espace.ouvrir, envoyer, datetime.now())


if __name__ == "__main__":
    sys.exit(main())
