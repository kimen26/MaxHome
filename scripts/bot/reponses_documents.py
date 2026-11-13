"""Textes du bot pour les documents de voyage envoyés en PDF ou en photo (brief bot-web-documents, lot A).

reponses.py est plein : les nouveaux textes vivent ici. Aucune logique, que du formatage.
"""
from outils.resume import AVERTISSEMENT_SUSPECT

DOC_NON_LU = "Je n'ai pas pu lire le contenu de ce document."
DOC_SANS_RESA = "Je n'ai pas trouvé de réservation ni de paiement dedans."
PIECE_ABANDONNEE = "OK, je laisse tomber ce document."


def piece_et_suite(rangee, suite, suspect=False):
    """Pièce rangée, puis ce que la lecture a donné (récap de résa, ou pourquoi il n'y en a pas)."""
    texte = f"{rangee}\n{suite}" if suite else rangee
    return f"{AVERTISSEMENT_SUSPECT}\n{texte}" if suspect else texte


def resa_non_validee(erreur):
    return f"J'ai lu une réservation mais je ne peux pas la proposer : {erreur}"


def quel_voyage(champs=None, contexte=None):
    """« Pour quel voyage ? » : dit ce qui a été lu, et que le document attend d'être rangé."""
    debut = f"{contexte}\n" if contexte else ""
    lu = f"J'ai lu : {champs['titre']}. " if champs and champs.get("titre") else ""
    return (f"{debut}{lu}Pour quel voyage ? Réponds avec le nom du voyage, "
            "je range le document et je te propose la réservation.")


def voyage_introuvable(nom, proches):
    base = f"Aucun voyage ne correspond à « {nom} »."
    return f"{base} Proches : {', '.join(proches)}." if proches else base
