"""Formatage IBAN côté bot — miroir de frontend/budget/iban.js::formaterIban (D-048 §4).

Règle assez simple (nettoyer + regrouper par 4 caractères) pour ne pas justifier un aller-retour
Node par ligne affichée dans `à virer` : dupliquée ici, mais confrontée au JS dans
tests/bot/test_iban_bot.py (L-014) — un formatage qui diverge se voit au premier test, pas en
prod. La validation de l'IBAN (mod 97) reste, elle, uniquement côté frontend (saisie) : le bot ne
fait qu'afficher un IBAN déjà validé et stocké en base.
"""
import re


def nettoyer_iban(saisie):
    return re.sub(r"[\s-]", "", (saisie or "").upper())


def formater_iban(saisie):
    """Groupé par 4 pour l'affichage : « FR76 3000 6000 ... » — identique à iban.js::formaterIban."""
    iban = nettoyer_iban(saisie)
    return " ".join(iban[i:i + 4] for i in range(0, len(iban), 4))
