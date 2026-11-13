"""« Quoi de neuf à l'école ? » : les derniers mails de l'école, résumés en quelques lignes (lot 2).

Les expéditeurs de l'école et la boîte attendue vivent en base (table `parametres`, D-061), jamais dans
le dépôt. La lecture passe par le registre d'outils (client en GET seul, chemins Gmail restreints) ; le
contenu lu ne sert qu'à un résumé en texte (outils.resume), jamais à une action.
"""
import logging
import re

import outils
from outils import gmail

CLE_EXPEDITEURS = "ecole_expediteurs"  # « domaine.fr, autre@domaine.fr » : adresses ou domaines
CLE_BOITE = "ecole_boite"              # l'adresse Gmail que le jeton doit donner, sinon on ne lit rien
QUESTION = ("Quoi de neuf à l'école ? Pour chaque mail, donne la date, l'objet et l'essentiel en une ou "
            "deux phrases.")
AUCUN_MAIL = f"Aucun mail de l'école ces {gmail.JOURS_DEFAUT} derniers jours."
SANS_EXPEDITEUR = "Je ne sais pas encore quels expéditeurs sont ceux de l'école. Dis-le à Yann."
LECTURE_IMPOSSIBLE = "Je n'arrive pas à lire la boîte mail de l'école pour l'instant."
_RE_ADRESSE = re.compile(r"^[\w.+-]*@?[\w-]+(\.[\w-]+)+$")

log = logging.getLogger("bot")


def lire_expediteurs(valeur):
    """Liste d'adresses ou de domaines depuis la valeur en base ; les entrées qui n'en sont pas sont écartées
    (elles finiraient dans une requête Gmail)."""
    morceaux = re.split(r"[,;\s]+", valeur or "")
    return [m.lower() for m in morceaux if m and _RE_ADRESSE.match(m)]


def formater(mails):
    return "\n\n".join(f"Mail du {m['date']} de {m['de']}\nObjet : {m['objet']}\n{m['texte']}" for m in mails)


def nouvelles(bot, http=None):
    """Texte à envoyer : résumé des mails récents, ou la phrase qui dit pourquoi il n'y en a pas."""
    expediteurs = lire_expediteurs(bot.donnees.parametre(CLE_EXPEDITEURS))
    if not expediteurs:
        return SANS_EXPEDITEUR
    gmail.assurer_inscrit()
    try:
        session = gmail.session_gmail(bot.donnees.parametre(CLE_BOITE), http)
        mails = outils.executer_lecture(gmail.NOM_OUTIL, session=session, expediteurs=expediteurs)
    except (gmail.ErreurGmail, outils.EcritureBloquee) as exc:
        log.error("mails de l'école : %s", exc)
        return LECTURE_IMPOSSIBLE
    except Exception:
        log.exception("mails de l'école : erreur inattendue")
        return LECTURE_IMPOSSIBLE
    if not mails:
        return AUCUN_MAIL
    return outils.resumer(formater(mails), QUESTION, outil=gmail.NOM_OUTIL)
