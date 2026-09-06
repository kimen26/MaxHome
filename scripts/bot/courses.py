"""Liste de courses côté bot : ajout et lecture. Miroir du module frontend/courses/.

Aucune logique de conversation ici : actions.py appelle, reponses.py formate.
"""

RAYON_PAR_DEFAUT = "Autre"


def ajouter(donnees, prenom, libelle):
    """Ajoute un article (rayon « Autre » : le bot ne devine pas, l'app permet de reclasser)."""
    return donnees.creer_course({"libelle": libelle, "rayon": RAYON_PAR_DEFAUT, "ajoute_par": prenom})


def restants(donnees):
    """Articles pas encore pris, dans l'ordre d'ajout."""
    return [a for a in donnees.courses() if not a["coche_le"]]
