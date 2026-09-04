"""Provisionne le projet Supabase MaxBudget via la Management API (idempotent).

Lit .env (SUPABASE_PAT, EMAIL_YANN, EMAIL_CLAUDIA), ne l'affiche jamais.
Étapes : projet -> attente ACTIVE_HEALTHY -> schéma -> import -> inscription désactivée
         -> comptes -> frontend/config.js. Les mots de passe générés vont dans .env.
Usage : python scripts/provision.py
"""
import json
import secrets
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
ENV = RACINE / ".env"
API = "https://api.supabase.com/v1"
NOM_PROJET = "maxbudget"
REGION = "eu-west-3"  # Paris
MEMBRES = {"Yann": "EMAIL_YANN", "Claudia": "EMAIL_CLAUDIA"}


def lit_env():
    return dict(l.split("=", 1) for l in ENV.read_text(encoding="utf-8").splitlines() if "=" in l)


def ecrit_env(env):
    ENV.write_text("".join(f"{k}={v}\n" for k, v in env.items()), encoding="utf-8")


def appel(methode, url, jeton, corps=None, entetes=None):
    data = json.dumps(corps).encode() if corps is not None else None
    req = urllib.request.Request(url, data=data, method=methode)
    req.add_header("Authorization", f"Bearer {jeton}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "maxbudget-provision/1.0")
    for k, v in (entetes or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            texte = r.read().decode()
            return json.loads(texte) if texte else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{methode} {url.split('?')[0]} -> {e.code}: {e.read().decode()[:300]}") from e


def projet(env):
    pat = env["SUPABASE_PAT"]
    for p in appel("GET", f"{API}/projects", pat):
        if p["name"] == NOM_PROJET:
            print(f"projet existant : {p['id']} ({p['status']})")
            return p["id"]
    orgs = appel("GET", f"{API}/organizations", pat)
    if not orgs:
        sys.exit("aucune organisation Supabase sur ce compte")
    env["SUPABASE_DB_PASS"] = env.get("SUPABASE_DB_PASS") or secrets.token_urlsafe(24)
    ecrit_env(env)
    p = appel("POST", f"{API}/projects", pat, {
        "name": NOM_PROJET, "organization_id": orgs[0]["id"],
        "region": REGION, "db_pass": env["SUPABASE_DB_PASS"],
    })
    print(f"projet créé : {p['id']} dans l'organisation « {orgs[0]['name']} »")
    return p["id"]


def attendre(ref, pat):
    for _ in range(60):
        statut = appel("GET", f"{API}/projects/{ref}", pat)["status"]
        if statut == "ACTIVE_HEALTHY":
            print("projet prêt")
            return
        print(f"  statut {statut}, attente…")
        time.sleep(10)
    sys.exit("projet toujours pas prêt après 10 min")


def sql(ref, pat, requete):
    return appel("POST", f"{API}/projects/{ref}/database/query", pat, {"query": requete})


def cles(ref, pat):
    liste = appel("GET", f"{API}/projects/{ref}/api-keys?reveal=true", pat)
    par_nom = {k["name"]: k["api_key"] for k in liste}
    publiable = next((k["api_key"] for k in liste if k.get("type") == "publishable"), par_nom.get("anon"))
    return publiable, par_nom["service_role"]


def comptes(ref, env, service_role):
    url = f"https://{ref}.supabase.co/auth/v1/admin/users"
    existants = {u["email"] for u in appel("GET", url, service_role, entetes={"apikey": service_role}).get("users", [])}
    for prenom, cle in MEMBRES.items():
        email = env[cle]
        mdp_cle = f"PASS_{prenom.upper()}"
        env[mdp_cle] = env.get(mdp_cle) or secrets.token_urlsafe(12)
        if email in existants:
            print(f"compte {prenom} déjà présent")
            continue
        appel("POST", url, service_role, {"email": email, "password": env[mdp_cle], "email_confirm": True},
              entetes={"apikey": service_role})
        print(f"compte {prenom} créé ({email})")
    ecrit_env(env)


def main():
    env = lit_env()
    manquants = [k for k in ("SUPABASE_PAT", *MEMBRES.values()) if not env.get(k) or "REMPLIR" in env[k] or "COLLE" in env[k]]
    if manquants:
        sys.exit(f".env incomplet : {manquants}")
    pat = env["SUPABASE_PAT"]

    ref = projet(env)
    env["SUPABASE_REF"] = ref
    ecrit_env(env)
    attendre(ref, pat)

    schema = (RACINE / "supabase" / "schema.sql").read_text(encoding="utf-8")
    for prenom, cle in MEMBRES.items():
        schema = schema.replace(cle, env[cle])
    sql(ref, pat, schema)
    print("schéma appliqué")

    import_sql = RACINE / "data" / "import.sql"
    if import_sql.exists():
        sql(ref, pat, import_sql.read_text(encoding="utf-8"))
        n = sql(ref, pat, "select (select count(*) from charges) c, (select count(*) from lignes) l, (select count(*) from revenus) r")
        print(f"import : {n[0]}")

    appel("PATCH", f"{API}/projects/{ref}/config/auth", pat, {"disable_signup": True})
    print("inscription publique désactivée")

    publiable, service_role = cles(ref, pat)
    comptes(ref, env, service_role)

    config = RACINE / "frontend" / "config.js"
    config.write_text(
        '/* Config publique du site statique — la clé publishable est publique par design\n'
        '   (la sécurité vient de la RLS côté Supabase, pas du secret de cette clé). */\n'
        f'const SUPABASE_URL = "https://{ref}.supabase.co";\n'
        f'const SUPABASE_ANON_KEY = "{publiable}";\n', encoding="utf-8")
    print("frontend/config.js écrit")
    print(f"URL : https://{ref}.supabase.co — mots de passe dans .env (PASS_YANN, PASS_CLAUDIA)")


if __name__ == "__main__":
    main()
