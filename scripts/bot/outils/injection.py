"""Alerte d'injection : un contenu lu (mail, page) qui parle à une IA au lieu de parler à une personne.

Fonction pure. Elle ne bloque rien : elle signale, la réponse le dit (« contenu suspect »).
Volontairement étroite : un vrai mail d'école (« n'oubliez pas les bottes ») ne doit jamais sonner.
Le texte est normalisé avant test : minuscules, sans accents, apostrophes remplacées par une espace.
"""
import re

from reponses import normaliser

_MOTIFS = [re.compile(m) for m in (
    # ordre d'oublier ce qu'on a dit à l'IA
    r"\b(ignore[zr]?|oublie[zr]?|neglige[zr]?|desobei[sr]?)\b.{0,40}\b(instructions?|consignes?|directives?|prompts?)\b",
    r"\b(ignore|disregard|forget|override)\b.{0,40}\b(instructions?|prompts?|rules|guidelines)\b",
    # adresse directe à l'IA
    r"\btu dois (maintenant|desormais|immediatement|obligatoirement)\b",
    r"\b(tu es|you are) (maintenant|now)\b",
    r"\b(agis|reponds) (comme|en tant que)\b|\bact as\b|\bpretend (to be|you)\b",
    r"\ben tant qu ?(ia|intelligence artificielle|assistant|modele|llm)\b|\bas an? (ai|language model|llm|assistant)\b",
    r"\b(system prompt|prompt systeme|message systeme|developer message|jailbreak)\b",
    r"\b(nouvelles?|new) (instructions?|consignes?)\b",
    r"</?(system|assistant|instructions?)>",
    # ordres d'action
    r"\bexecute[zr]? (la |le |les |cette |ce |ces |une? )?(commande|script|code|requete|sql|action)s?\b",
    r"\b(run|execute) (the |this |these )?(command|script|code|query)\b",
    r"\b(supprime[zr]?|efface[zr]?|detruis|delete|erase|wipe) (tout|toutes|tous|everything|all)\b",
    r"\b(rm -rf|drop table)\b",
    r"\bne (le |la |lui )?(dis|dites|montre|montrez) (pas|rien) (a l ?utilisateur|a la personne)\b|\bdo not (tell|inform) the user\b",
)]


def contenu_suspect(texte):
    if not isinstance(texte, str) or not texte.strip():
        return False
    norm = normaliser(texte).replace("’", "'").replace("'", " ")
    return any(m.search(norm) for m in _MOTIFS)
