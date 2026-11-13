"""Textes du bot pour les liens et les recherches web (brief bot-web-documents, lot B).

reponses.py est plein : les nouveaux textes vivent ici. Aucune logique, que du formatage.
"""
from outils.resume import AVERTISSEMENT_SUSPECT

PAGE_ILLISIBLE = "Je n'ai pas réussi à lire cette page."
RECHERCHE_INDISPONIBLE = "Je ne peux pas chercher pour l'instant."
RECHERCHE_VIDE = "Quelle question dois-je chercher sur le web ?"
IDEE_ABANDONNEE = "OK, je ne range rien."
QUESTION_PAR_DEFAUT = "Résume cette page."
CONSIGNE_RESUME = "Dis surtout : le prix, les dates, ce qui est inclus, et les pièges éventuels."


def proposer_idee(resume, voyage):
    """Le résumé, puis la proposition de ranger l'offre comme idée (le « oui » est attendu)."""
    return f"{resume}\n\nRanger cette offre comme idée dans {voyage} ? OK ?"


def idee_rangee(voyage):
    return f"Idée rangée dans {voyage}."


def recherche(reponse, suspect=False):
    return f"{AVERTISSEMENT_SUSPECT}\n{reponse}" if suspect else reponse
