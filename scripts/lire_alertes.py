"""Écrit sur la sortie standard, en JSON, toutes les alertes de veille vols (table veille_alertes).

Appelé par MaxVoyage au début de sa collecte : MaxHome fait foi pour les alertes
(docs/briefs/veille-vols.md, D-056). Lit .env, n'affiche jamais une clé.
Usage : python scripts/lire_alertes.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from veille_rest import appel_service  # noqa: E402


def main():
    alertes = appel_service("GET", "veille_alertes?select=*&order=id")
    sys.stdout.reconfigure(encoding="utf-8")
    json.dump(alertes, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
