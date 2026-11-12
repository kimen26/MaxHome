"""Lecture d'une variable utilisateur Windows (HKCU\\Environment), repli sur os.environ.

Le bot tourne dans une tâche planifiée : son environnement peut dater d'avant la pose d'une variable
(MAXHOME_GOOGLE_*, MAXHOME_ECOLE_*, /socle:secrets). On lit donc le registre à chaque appel.
Lecture seule : la valeur n'est ni écrite (pas dans .env), ni journalisée, ni mise dans une exception.
"""
import os

try:
    import winreg
except ImportError:  # hors Windows : os.environ seul
    winreg = None

CLE_ENVIRONNEMENT = "Environment"


def _depuis_registre(nom):
    if winreg is None:
        return None
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, CLE_ENVIRONNEMENT) as cle:
            valeur, _type = winreg.QueryValueEx(cle, nom)
    except FileNotFoundError:
        return None
    return os.path.expandvars(valeur) if isinstance(valeur, str) and valeur else None


def lire_variable(nom):
    """Valeur de la variable `nom` (registre utilisateur, puis os.environ), ou None. Ne l'affiche jamais."""
    return _depuis_registre(nom) or os.environ.get(nom) or None


def variable_presente(nom):
    return lire_variable(nom) is not None
