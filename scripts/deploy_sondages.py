"""Déploie l'Edge Function publique sondage-voter (vote des invités, « proposer une date »).

  1. pose le secret MAXHOME_TELEGRAM_BOT_TOKEN sur le projet (lu dans .env, jamais affiché) ;
  2. déploie la fonction SANS verify_jwt : l'invité n'a pas de session (contrairement à
     scripts/provision.py::deployer_fonction, qui force verify_jwt à True) ;
  3. contrôle qu'elle répond sans jeton Supabase : un jeton de sondage inconnu doit rendre 404.
Pas de pg_cron ici : la purge est planifiée par la migration 036_sondages.sql.

Lit .env (SUPABASE_PAT, SUPABASE_REF, MAXHOME_TELEGRAM_BOT_TOKEN), n'affiche jamais une valeur
secrète. Idempotent. Prérequis : migration 036 appliquée.
Usage : python scripts/deploy_sondages.py
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from provision import API, RACINE, appel, lit_env  # noqa: E402

FONCTION = "sondage-voter"
JETON_INCONNU = "00000000-0000-4000-8000-000000000000"


def deployer_publique(pat, ref):
    """Déploie `supabase/functions/sondage-voter` (CLI via npx) puis s'assure que verify_jwt est coupé."""
    r = subprocess.run(
        ["npx", "--yes", "supabase@latest", "functions", "deploy", FONCTION, "--project-ref", ref, "--no-verify-jwt", "--yes"],
        cwd=RACINE, env={**os.environ, "SUPABASE_ACCESS_TOKEN": pat}, capture_output=True, text=True, shell=True,
    )
    if r.returncode != 0:
        sys.exit(f"déploiement de {FONCTION} échoué :\n{r.stdout[-1200:]}\n{r.stderr[-400:]}")
    print(f"{FONCTION} : fonction déployée")
    appel("PATCH", f"{API}/projects/{ref}/functions/{FONCTION}", pat, {"verify_jwt": False})


def controler_acces_public(ref):
    """Appel SANS aucun en-tête d'autorisation : un jeton inconnu doit rendre 404 « terminé »."""
    req = urllib.request.Request(
        f"https://{ref}.supabase.co/functions/v1/{FONCTION}", method="POST",
        data=json.dumps({"jeton": JETON_INCONNU, "prenom": "Test", "jours": ["2026-01-01"]}).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=60)
        sys.exit(f"{FONCTION} : réponse 200 inattendue pour un jeton inconnu")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"{FONCTION} : accessible sans jeton (404 pour un sondage inconnu, comme attendu)")
        elif e.code == 401:
            sys.exit(f"{FONCTION} : 401, verify_jwt est encore actif")
        else:
            sys.exit(f"{FONCTION} : réponse inattendue {e.code} (migration 036 appliquée ?)")


def main():
    env = lit_env()
    requis = ["SUPABASE_PAT", "SUPABASE_REF", "MAXHOME_TELEGRAM_BOT_TOKEN"]
    manquants = [k for k in requis if not env.get(k)]
    if manquants:
        sys.exit(f".env incomplet : {manquants}")
    pat, ref = env["SUPABASE_PAT"], env["SUPABASE_REF"]

    appel("POST", f"{API}/projects/{ref}/secrets", pat, [
        {"name": "MAXHOME_TELEGRAM_BOT_TOKEN", "value": env["MAXHOME_TELEGRAM_BOT_TOKEN"]},
    ])
    print("secret Telegram posé sur le projet")

    deployer_publique(pat, ref)
    controler_acces_public(ref)


if __name__ == "__main__":
    main()
