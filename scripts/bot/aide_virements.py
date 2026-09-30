"""Complément d'aide pour `valider`/`à virer` (D-046, D-048) — reponses.AIDE est interdit à
modifier (arbre partagé) : bot.py appelle `aide_complete` plutôt que de composer le texte lui-même."""

AIDE_VIREMENTS = """  valider <charge> [pour <prenom>]
  pas validé <charge> · dévalider <charge>
  à virer · virements"""


def aide_complete(aide_de_base):
    """Insère le complément juste avant la ligne « Mois : ... » qui termine reponses.AIDE, pour
    rester groupé avec les autres commandes plutôt que collé après la syntaxe des mois."""
    marqueur = "\nMois :"
    if marqueur in aide_de_base:
        avant, apres = aide_de_base.split(marqueur, 1)
        return f"{avant}\n{AIDE_VIREMENTS}{marqueur}{apres}"
    return f"{aide_de_base}\n{AIDE_VIREMENTS}"
