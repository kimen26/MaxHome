"""Déploie les rappels Telegram : secrets Supabase, Edge Functions, planification pg_cron, test.

Deux rappels, même mécanique :
  - rappel-virements : mouvements du mois non faits, le 1er et le 5 à 09:00 Paris ;
  - rappel-taches    : tâches « le jour même » non faites, chaque soir à 19:00 Paris.

Lit .env (SUPABASE_PAT, SUPABASE_REF, MAXHOME_TELEGRAM_BOT_TOKEN, MAXHOME_TELEGRAM_CHAT_ID),
n'affiche jamais une valeur secrète. Idempotent.
Usage : python scripts/deploy_rappels.py [nom-de-la-fonction]
"""
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from provision import API, RACINE, appel, cles, lit_env, sql  # noqa: E402

# Les heures cron sont en UTC : 07:00 = 09:00 Paris en été, 08:00 en hiver.
RAPPELS = {
    "rappel-virements": "0 7 1,5 * *",
    "rappel-taches": "0 17 * * *",
}


def deployer(nom, cron, pat, ref, service_role):
    r = subprocess.run(
        ["npx", "--yes", "supabase@latest", "functions", "deploy", nom, "--project-ref", ref],
        cwd=RACINE, env={**os.environ, "SUPABASE_ACCESS_TOKEN": pat}, capture_output=True, text=True, shell=True,
    )
    if r.returncode != 0:
        # La CLI met l'erreur de compilation sur stdout et les avertissements sur stderr :
        # afficher les deux, sinon on ne voit que « Docker is not running » (inoffensif).
        sys.exit(f"déploiement de {nom} échoué :\n{r.stdout[-1200:]}\n{r.stderr[-400:]}")
    print(f"{nom} : fonction déployée")
    appel("PATCH", f"{API}/projects/{ref}/functions/{nom}", pat, {"verify_jwt": True})

    url = f"https://{ref}.supabase.co/functions/v1/{nom}"
    sql(ref, pat, f"""
      create extension if not exists pg_cron;
      create extension if not exists pg_net;
      select cron.unschedule(jobname) from cron.job where jobname = '{nom}';
      select cron.schedule('{nom}', '{cron}', $$
        select net.http_post(url := '{url}',
          headers := jsonb_build_object('Authorization', 'Bearer {service_role}', 'Content-Type', 'application/json'),
          body := '{{}}'::jsonb);
      $$);
    """)
    jobs = sql(ref, pat, f"select jobname, schedule from cron.job where jobname = '{nom}'")
    print(f"{nom} : planification {jobs}")

    req = urllib.request.Request(url, data=b"{}", method="POST")
    for k, v in {"Authorization": f"Bearer {service_role}", "apikey": service_role,
                 "Content-Type": "application/json"}.items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=60) as rep:
        print(f"{nom} : test d'exécution {rep.status} {rep.read().decode()}")


def main():
    env = lit_env()
    requis = ["SUPABASE_PAT", "SUPABASE_REF", "MAXHOME_TELEGRAM_BOT_TOKEN", "MAXHOME_TELEGRAM_CHAT_ID"]
    manquants = [k for k in requis if not env.get(k)]
    if manquants:
        sys.exit(f".env incomplet : {manquants}")
    pat, ref = env["SUPABASE_PAT"], env["SUPABASE_REF"]

    demandes = sys.argv[1:] or list(RAPPELS)
    inconnues = [n for n in demandes if n not in RAPPELS]
    if inconnues:
        sys.exit(f"fonction inconnue : {inconnues}. Choix : {list(RAPPELS)}")

    appel("POST", f"{API}/projects/{ref}/secrets", pat, [
        {"name": "MAXHOME_TELEGRAM_BOT_TOKEN", "value": env["MAXHOME_TELEGRAM_BOT_TOKEN"]},
        {"name": "MAXHOME_TELEGRAM_CHAT_ID", "value": env["MAXHOME_TELEGRAM_CHAT_ID"]},
    ])
    print("secrets Telegram posés sur le projet")

    _, service_role = cles(ref, pat)
    for nom in demandes:
        deployer(nom, RAPPELS[nom], pat, ref, service_role)


if __name__ == "__main__":
    main()
