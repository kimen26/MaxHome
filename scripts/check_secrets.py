"""Vérifie la PRÉSENCE (jamais la valeur) de clés dans .env. N'affiche aucun secret.

Usage : python scripts/check_secrets.py CLE1 CLE2 ...
Sortie : pour chaque clé, "présente" ou "absente".
"""
import sys
from pathlib import Path

ENV = Path(__file__).resolve().parent.parent / ".env"


def lit_env():
    if not ENV.exists():
        return {}
    return dict(l.split("=", 1) for l in ENV.read_text(encoding="utf-8").splitlines() if "=" in l)


def main():
    env = lit_env()
    for cle in sys.argv[1:]:
        v = env.get(cle, "")
        ok = bool(v) and "REMPLIR" not in v and "COLLE" not in v
        print(f"{cle}: {'présente' if ok else 'absente'}")


if __name__ == "__main__":
    main()
