"""Textes du bot pour « garder le lien avec nos proches » (brief garder-le-lien).

reponses.py est plein : les textes vivent ici. Aucune logique, que du formatage. Ce module n'importe rien
du bot (reponses.py l'importe pour ses récapitulatifs).
"""
from datetime import date

MOIS = ("janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
        "septembre", "octobre", "novembre", "décembre")
RIEN_A_FAIRE = "Personne à relancer pour l'instant."
SANS_ECHANGE = "Aucun échange noté pour l'instant."
IDEE = "Idée de message :"
CITATION_MAX = 160


def _date_longue(iso):
    d = date.fromisoformat(str(iso)[:10])
    return f"{d.day if d.day > 1 else '1er'} {MOIS[d.month - 1]}"


def _court(texte):
    texte = " ".join(str(texte).split())
    return texte if len(texte) <= CITATION_MAX else texte[:CITATION_MAX].rstrip() + "…"


def duree(jours):
    """6 semaines, 3 mois : une durée que l'on dit à voix haute."""
    if jours < 14:
        return f"{jours} jour{'s' if jours > 1 else ''}"
    if jours < 60:
        return f"{jours // 7} semaines"
    return f"{jours // 30} mois"


def _age(age):
    """L'âge atteint ce jour-là ; rien si l'année de naissance est inconnue."""
    return "" if age is None else f" ({age} ans)"


# ---------- noter un échange ----------
def proposer_creation(prenom):
    """Prénom inconnu : la proposition ; le mécanisme du bot y ajoute « OK ? »."""
    return f"Je ne connais pas encore {prenom}. L'ajouter à tes proches ?"


def echange_note(prenom, texte, cree=False):
    debut = f"{prenom} ajouté à tes proches. " if cree else ""
    return f"{debut}Noté pour {prenom} : « {_court(texte)} ». Dis « annuler » pour l'enlever."


def question_texte(prenom=None):
    return f"Qu'est-ce que je note pour {prenom} ?" if prenom else "Pour qui, et qu'est-ce que je note ?"


QUESTION_DATE = "Je n'ai pas compris la date. Quel jour ?"
TEXTE_TROP_LONG = "C'est trop long pour une note (500 caractères au plus)."
PRENOM_INVALIDE = "Je n'ai pas compris de qui il s'agit."


# ---------- consulter ----------
def ligne_relance(prenom, depuis_jours):
    return f"- {prenom} : {duree(depuis_jours)} sans nouvelles"


def ligne_anniversaire(prenom, jour, dans_jours, age):
    quand = "aujourd'hui" if dans_jours == 0 else "demain" if dans_jours == 1 else f"le {_date_longue(jour)}"
    return f"- {prenom} : {quand}{_age(age)}"


def liste(relances, anniversaires):
    """relances : [(prenom, depuis_jours)] ; anniversaires : [(prenom, jour, dans_jours, age)]."""
    blocs = []
    if relances:
        blocs.append("À relancer :\n" + "\n".join(ligne_relance(p, d) for p, d in relances))
    if anniversaires:
        blocs.append("Anniversaires des 30 prochains jours :\n"
                     + "\n".join(ligne_anniversaire(*a) for a in anniversaires))
    return "\n\n".join(blocs) if blocs else RIEN_A_FAIRE


# ---------- messages de la tâche planifiée ----------
def message_anniversaire(prenom, dans_jours, age):
    if dans_jours == 0:
        return f"Aujourd'hui, c'est l'anniversaire de {prenom}{_age(age)}. Un petit mot ?"
    return f"Demain, c'est l'anniversaire de {prenom}{_age(age)}. Pense à lui écrire."


def message_relance(prenom, depuis_jours, dernier, idee=None):
    """`dernier` : l'échange le plus récent ({le, texte}) ou None. `idee` : ce que Claude propose, ou None."""
    lignes = [f"Ça fait {duree(depuis_jours)} sans nouvelles de {prenom}."]
    if dernier:
        lignes.append(f"Dernier échange, le {_date_longue(dernier['le'])} : « {_court(dernier['texte'])} »")
    else:
        lignes.append(SANS_ECHANGE)
    if idee:
        lignes.append(f"{IDEE} {idee}")
    return "\n".join(lignes)
