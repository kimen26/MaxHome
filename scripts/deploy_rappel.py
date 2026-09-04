"""Déploie le rappel Telegram : secrets Supabase, Edge Function, planification pg_cron, test d'envoi.

Lit .env (SUPABASE_PAT, SUPABASE_REF, MAXBUDGET_TELEGRAM_BOT_TOKEN, MAXBUDGET_TELEGRAM_CHAT_ID),
n'affiche jamais une valeur secrète. Idempotent.
Usage : python scripts/deploy_rappel.py
"""
import os
import subprocess
import urllib.request
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from provision import API, RACINE, appel, cles, lit_env, sql  # noqa: E402

FONCTION = "rappel-virements"
CRON = "0 7 1,5 * *"  # 09:00 Paris en été, 08:00 en hiver


def main():
    env = lit_env()
    requis = ["SUPABASE_PAT", "SUPABASE_REF", "MAXBUDGET_TELEGRAM_BOT_TOKEN", "MAXBUDGET_TELEGRAM_CHAT_ID"]
    manquants = [k for k in requis if not env.get(k)]
    if manquants:
        sys.exit(f".env incomplet : {manquants}")
    pat, ref = env["SUPABASE_PAT"], env["SUPABASE_REF"]

    appel("POST", f"{API}/projects/{ref}/secrets", pat, [
        {"name": "MAXBUDGET_TELEGRAM_BOT_TOKEN", "value": env["MAXBUDGET_TELEGRAM_BOT_TOKEN"]},
        {"name": "MAXBUDGET_TELEGRAM_CHAT_ID", "value": env["MAXBUDGET_TELEGRAM_CHAT_ID"]},
    ])
    print("secrets Telegram posés sur le projet")

    r = subprocess.run(
        ["npx", "--yes", "supabase@latest", "functions", "deploy", FONCTION, "--project-ref", ref],
        cwd=RACINE, env={**os.environ, "SUPABASE_ACCESS_TOKEN": pat}, capture_output=True, text=True, shell=True,
    )
    if r.returncode != 0:
        sys.exit(f"déploiement fonction échoué :\n{r.stderr[-800:]}")
    print("fonction déployée")

    _, service_role = cles(ref, pat)
    url = f"https://{ref}.supabase.co/functions/v1/{FONCTION}"
    sql(ref, pat, f"""
      create extension if not exists pg_cron;
      create extension if not exists pg_net;
      select cron.unschedule(jobname) from cron.job where jobname = 'rappel-virements';
      select cron.schedule('rappel-virements', '{CRON}', $$
        select net.http_post(url := '{url}',
          headers := jsonb_build_object('Authorization', 'Bearer {service_role}', 'Content-Type', 'application/json'),
          body := '{{}}'::jsonb);
      $$);
    """)
    jobs = sql(ref, pat, "select jobname, schedule from cron.job where jobname = 'rappel-virements'")
    print(f"planification : {jobs}")

    req = urllib.request.Request(url, data=b"{}", method="POST")
    for k, v in {"Authorization": f"Bearer {service_role}", "apikey": service_role, "Content-Type": "application/json"}.items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=60) as r:
        print(f"test d'exécution : {r.status} {r.read().decode()}")


if __name__ == "__main__":
    main()
