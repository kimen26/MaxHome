"""L'agenda dans le bot (lot 3) : lire, ajouter, modifier, supprimer, en phrase libre.

Le modèle (libre.py) ne rend qu'un JSON ; ici on lit l'agenda par le registre d'outils (client en GET seul),
on cherche l'événement visé par titre et date, et toute écriture est PROPOSÉE (« OK ? ») : elle ne part qu'après
un « oui » (outils.registre). Pas de résumé par le modèle : le contenu vient de l'agenda du foyer, pas d'un tiers ;
seuls les titres passent par l'alerte d'injection.
"""
import logging
import re
from datetime import date

import conversation
import outils
import reponses
from outils import agenda
from outils.resume import AVERTISSEMENT_SUSPECT

ACTIONS = frozenset({"agenda_lire", "agenda_creer", "agenda_modifier", "agenda_supprimer"})
RIEN = "Rien de prévu."
IMPOSSIBLE = "Je n'arrive pas à lire l'agenda pour l'instant."
LIGNES_MAX = 30
JOURS_RECHERCHE = 120  # sans date dans la phrase, on cherche l'événement dans les 4 mois qui viennent
JOURS_COURT = ("lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim.")
JOURS_LONG = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")

log = logging.getLogger("bot")


def aujourdhui():
    """Date du jour (remplaçable en test)."""
    return date.today()


# ---------- mise en forme ----------
def _date(iso, noms=JOURS_COURT):
    d = date.fromisoformat(iso)
    return f"{noms[d.weekday()]} {d:%d/%m}"


def _heure(h):
    return h.replace(":00", "h") if h.endswith(":00") else h.replace(":", "h")


def _heures(e, mot_debut="", mot_fin=""):
    if not e["heure_debut"]:
        return ""
    if not e["heure_fin"]:
        return f"{mot_debut}{_heure(e['heure_debut'])}"
    return f"{mot_debut}{_heure(e['heure_debut'])}{mot_fin}{_heure(e['heure_fin'])}"


def ligne(e):
    """« sam. 15/11 10h–11h Piscine (Max) » ; plusieurs jours : « sam. 15/11 → lun. 17/11 Titre »."""
    quand = _date(e["debut"]) + (f" → {_date(e['fin'])}" if e["fin"] != e["debut"] else "")
    morceaux = [quand, _heures(e, "", "–"), e["titre"] + (f" ({e['personne']})" if e["personne"] else "")]
    return " ".join(m for m in morceaux if m)


def quand_clair(e):
    """« samedi 15/11 de 10h à 11h », « samedi 15/11, toute la journée », « du samedi 15/11 au lundi 17/11 »."""
    if e["fin"] != e["debut"]:
        return f"du {_date(e['debut'], JOURS_LONG)} au {_date(e['fin'], JOURS_LONG)}"
    jour = _date(e["debut"], JOURS_LONG)
    if not e["heure_debut"]:
        return f"{jour}, toute la journée"
    return jour + (_heures(e, " à ") if not e["heure_fin"] else f" de {_heure(e['heure_debut'])} à {_heure(e['heure_fin'])}")


def _titre(e):
    return f"« {e['titre']} »" + (f" ({e['personne']})" if e["personne"] else "")


def formater_liste(evenements):
    """Une ligne par événement ; « Rien de prévu. » si vide ; préfixe si un titre ressemble à un ordre."""
    if not evenements:
        return RIEN
    lignes = [ligne(e) for e in evenements[:LIGNES_MAX]]
    if len(evenements) > LIGNES_MAX:
        lignes.append(f"… et {len(evenements) - LIGNES_MAX} autres.")
    texte = "\n".join(lignes)
    if any(outils.contenu_suspect(e["titre"]) for e in evenements):
        log.warning("titre d'agenda suspect détecté (contenu non journalisé)")
        return f"{AVERTISSEMENT_SUSPECT}\n{texte}"
    return texte


# ---------- lecture ----------
def lire_periode(debut, fin):
    """Événements de [debut, fin] par l'outil de lecture. Lève ErreurAgenda / EcritureBloquee / ErreurSaisie."""
    agenda.assurer_inscrit()
    return outils.executer_lecture(agenda.NOM_LIRE, session=agenda.ouvrir_session(), debut=debut, fin=fin)


def _lecture(interp):
    debut = interp.get("debut")
    fin = interp.get("fin") or debut
    if agenda.jour(debut) is None or agenda.jour(fin) is None:
        return reponses.non_compris()
    try:
        return formater_liste(lire_periode(debut, fin))
    except agenda.ErreurSaisie as exc:
        return str(exc)
    except Exception as exc:  # garde, réseau, authentification : journalisé par le registre, jamais de détail dit
        log.error("agenda : lecture impossible (%s)", type(exc).__name__)
        return IMPOSSIBLE


# ---------- écritures proposées ----------
def _saisie_de(interp):
    return {"titre": interp.get("titre"), "personne": interp.get("personne"), "debut": interp.get("debut"),
            "fin": interp.get("fin"), "heure_debut": interp.get("heure_debut"), "heure_fin": interp.get("heure_fin")}


def _proposer(etat, prenom, nom, args, resume):
    return outils.proposer_ecriture(etat, nom, args, resume, prenom)


def _creer(etat, prenom, interp):
    try:
        saisie = agenda.valider_saisie(_saisie_de(interp))
    except agenda.ErreurSaisie as exc:
        return str(exc)
    agenda.assurer_inscrit()
    return _proposer(etat, prenom, agenda.NOM_CREER, saisie, f"Ajouter {_titre(saisie)} {quand_clair(saisie)} ?")


def _chercher(cherche, jour_cible):
    """Les événements dont le titre contient tous les mots de `cherche` (le jour visé, sinon les 4 mois qui viennent)."""
    mots = re.findall(r"\w+", reponses.normaliser(cherche or ""))
    if not mots:
        return None
    debut = jour_cible or aujourdhui().isoformat()
    fin = jour_cible or agenda.decaler(debut, JOURS_RECHERCHE)
    return [e for e in lire_periode(debut, fin) if all(m in reponses.normaliser(e["titre"]) for m in mots)]


def _demander_lequel(etat, cherche, candidats):
    conversation.poser(etat, conversation.QUESTION)
    liste = "\n".join(f"{i}. {ligne(e)}" for i, e in enumerate(candidats[:10], 1))
    return f"Plusieurs événements correspondent à « {cherche} » :\n{liste}\nLequel ? Donne-moi sa date."


def _viser(etat, interp):
    """(événement visé, None) ou (None, phrase à dire) quand il y en a zéro, plusieurs, ou que la lecture échoue."""
    cherche = (interp.get("cherche") or "").strip()
    if not cherche:
        conversation.poser(etat, conversation.QUESTION)
        return None, "Quel événement de l'agenda ?"
    jour_cible = interp.get("date")
    if jour_cible is not None and agenda.jour(jour_cible) is None:
        return None, reponses.non_compris()
    try:
        candidats = _chercher(cherche, jour_cible)
    except Exception as exc:
        log.error("agenda : recherche impossible (%s)", type(exc).__name__)
        return None, IMPOSSIBLE
    if not candidats:
        quand = f" le {_date(jour_cible, JOURS_LONG)}" if jour_cible else " dans les prochains mois"
        return None, f"Je ne trouve aucun événement « {cherche} »{quand}."
    if len(candidats) > 1:
        return None, _demander_lequel(etat, cherche, candidats)
    return candidats[0], None


def _duree_minutes(e):
    h = lambda t: int(t[:2]) * 60 + int(t[3:])  # noqa: E731
    return h(e["heure_fin"]) - h(e["heure_debut"])


def _fusionner(existant, interp):
    """L'événement existant avec les seuls champs que la phrase change. Une heure de début seule garde la durée."""
    neuf = {c: interp.get(c) if interp.get(c) not in (None, "") else existant[c]
            for c in ("titre", "personne", "debut", "fin", "heure_debut", "heure_fin")}
    if interp.get("debut") and not interp.get("fin"):  # un jour déplacé garde sa durée
        ecart = (date.fromisoformat(existant["fin"]) - date.fromisoformat(existant["debut"])).days
        neuf["fin"] = agenda.decaler(interp["debut"], ecart)
    if interp.get("heure_debut") and not interp.get("heure_fin") and existant["heure_debut"] and existant["heure_fin"]:
        total = int(interp["heure_debut"][:2]) * 60 + int(interp["heure_debut"][3:]) + _duree_minutes(existant)
        if total >= 24 * 60:
            raise agenda.ErreurSaisie("Avec cette heure de début, l'événement finirait après minuit.")
        neuf["heure_fin"] = f"{total // 60:02d}:{total % 60:02d}"
    return neuf


def _modifier(etat, prenom, interp):
    existant, phrase = _viser(etat, interp)
    if phrase:
        return phrase
    try:
        saisie = agenda.valider_saisie(_fusionner(existant, interp))
    except agenda.ErreurSaisie as exc:
        return str(exc)
    if all(saisie[c] == existant[c] for c in saisie):
        return f"Je ne vois rien à changer à {_titre(existant)}."
    agenda.assurer_inscrit()
    resume = (f"Modifier {_titre(existant)} : {quand_clair(existant)} devient {quand_clair(saisie)}"
              + (f", « {saisie['titre']} »" if saisie["titre"] != existant["titre"] else "") + " ?")
    return _proposer(etat, prenom, agenda.NOM_MODIFIER, {"id": existant["id"], **saisie}, resume)


def _supprimer(etat, prenom, interp):
    existant, phrase = _viser(etat, interp)
    if phrase:
        return phrase
    agenda.assurer_inscrit()
    return _proposer(etat, prenom, agenda.NOM_SUPPRIMER, {"id": existant["id"]},
                     f"Supprimer {_titre(existant)} {quand_clair(existant)} ?")


def repondre(etat, prenom, interp):
    """Réponse à une action agenda_* du modèle : lecture directe, écriture proposée (« OK ? »)."""
    return {"agenda_lire": lambda: _lecture(interp),
            "agenda_creer": lambda: _creer(etat, prenom, interp),
            "agenda_modifier": lambda: _modifier(etat, prenom, interp),
            "agenda_supprimer": lambda: _supprimer(etat, prenom, interp)}[interp["action"]]()
