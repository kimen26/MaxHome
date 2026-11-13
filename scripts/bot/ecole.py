"""« Quoi de neuf à l'école ? » : les derniers mails de l'école, résumés en quelques lignes (lot 2).

Les expéditeurs de l'école et la boîte attendue vivent en base (table `parametres`, D-061), jamais dans
le dépôt. La lecture passe par le registre d'outils (client en GET seul, chemins Gmail restreints) ; le
contenu lu ne sert qu'à un résumé en texte (outils.resume), jamais à une action.
"""
import logging
import re

import ecole_espace
import outils
from outils import espace_parent, gmail

CLE_EXPEDITEURS = "ecole_expediteurs"  # « domaine.fr, autre@domaine.fr » : adresses ou domaines
CLE_BOITE = "ecole_boite"              # l'adresse Gmail que le jeton doit donner, sinon on ne lit rien
QUESTION = ("Quoi de neuf à l'école ? Pour chaque mail, message ou document, donne la date, l'objet et "
            "l'essentiel en une ou deux phrases.")
AUCUN_MAIL = f"Aucun mail de l'école ces {gmail.JOURS_DEFAUT} derniers jours."
RIEN_DE_NEUF = f"Rien de neuf à l'école ces {gmail.JOURS_DEFAUT} derniers jours (mails, messages, documents)."
ESPACE_ILLISIBLE = "Je n'arrive pas à lire l'espace parent de l'école pour l'instant."
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


def _mails(bot, http):
    """(blocs de texte des mails, phrase à dire si la lecture est impossible ou vide, sinon None)."""
    expediteurs = lire_expediteurs(bot.donnees.parametre(CLE_EXPEDITEURS))
    if not expediteurs:
        return [], SANS_EXPEDITEUR
    gmail.assurer_inscrit()
    try:
        session = gmail.session_gmail(bot.donnees.parametre(CLE_BOITE), http)
        mails = outils.executer_lecture(gmail.NOM_OUTIL, session=session, expediteurs=expediteurs)
    except (gmail.ErreurGmail, outils.EcritureBloquee) as exc:
        log.error("mails de l'école : %s", exc)
        return [], LECTURE_IMPOSSIBLE
    except Exception:
        log.exception("mails de l'école : erreur inattendue")
        return [], LECTURE_IMPOSSIBLE
    return ([formater([m]) for m in mails], None if mails else AUCUN_MAIL)


def _espace_parent():
    """(blocs, True) ; ([], False) si l'espace parent n'est pas lisible (journal sans détail) ; ([], None) s'il
    n'est pas configuré."""
    try:
        return ecole_espace.nouveautes(), True
    except espace_parent.EspaceParentNonConfigure:
        return [], None  # pas d'identifiants sur ce poste : on s'en tient aux mails
    except Exception as exc:  # connexion, session, page changée, garde : jamais de détail (hôte) dans le journal
        log.error("espace parent de l'école : lecture impossible (%s)", type(exc).__name__)
        return [], False


def nouvelles(bot, http=None):
    """Texte à envoyer : résumé des mails, des messages et des documents récents de l'école, ou la phrase qui dit
    pourquoi il n'y en a pas."""
    blocs_mails, phrase_mails = _mails(bot, http)
    blocs_espace, espace_lu = _espace_parent()
    blocs = blocs_mails + blocs_espace
    if not blocs:
        if not espace_lu:  # illisible ou non configuré : seule la phrase des mails
            return phrase_mails
        return RIEN_DE_NEUF + (f"\n({phrase_mails})" if phrase_mails in (SANS_EXPEDITEUR, LECTURE_IMPOSSIBLE) else "")
    texte = outils.resumer("\n\n".join(blocs), QUESTION, outil=gmail.NOM_OUTIL)
    if phrase_mails in (SANS_EXPEDITEUR, LECTURE_IMPOSSIBLE):
        texte += f"\n({phrase_mails})"
    if espace_lu is False:
        texte += f"\n({ESPACE_ILLISIBLE})"
    return texte
