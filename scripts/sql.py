"""Exécute un fichier .sql sur le projet Supabase via la Management API (idempotent, additif).

Lit .env (SUPABASE_PAT, SUPABASE_REF), ne l'affiche jamais.
Usage : python scripts/sql.py <fichier.sql>
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
ENV = RACINE / ".env"
API = "https://api.supabase.com/v1"


def lit_env():
    return dict(l.split("=", 1) for l in ENV.read_text(encoding="utf-8").splitlines() if "=" in l)


def appel(methode, url, jeton, corps=None):
    data = json.dumps(corps).encode() if corps is not None else None
    req = urllib.request.Request(url, data=data, method=methode)
    req.add_header("Authorization", f"Bearer {jeton}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "maxhome-sql/1.0")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            texte = r.read().decode()
            return json.loads(texte) if texte else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{methode} {url.split('?')[0]} -> {e.code}: {e.read().decode()[:500]}") from e


def main():
    if len(sys.argv) != 2:
        sys.exit("usage : python scripts/sql.py <fichier.sql>")
    env = lit_env()
    ref, pat = env["SUPABASE_REF"], env["SUPABASE_PAT"]
    requete = Path(sys.argv[1]).read_text(encoding="utf-8")
    resultat = appel("POST", f"{API}/projects/{ref}/database/query", pat, {"query": requete})
    print(json.dumps(resultat, ensure_ascii=False, indent=2) if resultat else "OK (pas de retour)")


if __name__ == "__main__":
    main()
