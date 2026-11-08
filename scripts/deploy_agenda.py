"""Déploie l'Edge Function agenda-google (lecture de l'agenda Google du foyer).

  1. lit MAXHOME_GOOGLE_CLE (clé JSON du compte de service) dans le registre Windows
     (HKCU\Environment) : un seul endroit pour les secrets (/socle:secrets) ;
  2. la pose en secret du projet Supabase (POST /projects/{ref}/secrets) ;
  3. déploie la fonction et force verify_jwt (scripts/provision.py::deployer_fonction).
Pas de pg_cron : la fonction n'est appelée que par l'app, avec le jeton d'un membre du foyer.

Lit .env (SUPABASE_PAT, SUPABASE_REF), n'affiche jamais une valeur secrète. Idempotent.
Prérequis : l'agenda du foyer est partagé avec l'adresse du compte de service (« Voir tous les
détails des événements »).
Usage : python scripts/deploy_agenda.py
"""
import json
import sys
import winreg
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from provision import API, appel, deployer_fonction, lit_env  # noqa: E402

FONCTION = "agenda-google"
NOM_CLE = "MAXHOME_GOOGLE_CLE"
TYPE_COMPTE = "service_account"


def lire_variable_registre(nom):
    """Valeur d'une variable d'environnement UTILISATEUR (HKCU\Environment), None si absente."""
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as cle:
            valeur, _ = winreg.QueryValueEx(cle, nom)
            return valeur
    except FileNotFoundError:
        return None


def verifier_cle(brut):
    """La clé est bien celle d'un compte de service ; rend son adresse (ce n'est pas un secret)."""
    try:
        cle = json.loads(brut)
    except json.JSONDecodeError:
        sys.exit(f"{NOM_CLE} n'est pas du JSON : coller la clé JSON entière du compte de service")
    if cle.get("type") != TYPE_COMPTE or not cle.get("client_email") or not cle.get("token_uri"):
        sys.exit(f"{NOM_CLE} n'est pas une clé de compte de service complète")
    return cle["client_email"]


def main():
    env = lit_env()
    manquants = [k for k in ("SUPABASE_PAT", "SUPABASE_REF") if not env.get(k)]
    if manquants:
        sys.exit(f".env incomplet : {manquants}")
    pat, ref = env["SUPABASE_PAT"], env["SUPABASE_REF"]

    brut = lire_variable_registre(NOM_CLE)
    if not brut:
        sys.exit(f"{NOM_CLE} absente du registre (HKCU\Environment) : voir /socle:secrets")
    compte = verifier_cle(brut)

    appel("POST", f"{API}/projects/{ref}/secrets", pat, [{"name": NOM_CLE, "value": brut}])
    print(f"variable {NOM_CLE} posée sur le projet (compte de service : {compte})")

    deployer_fonction(FONCTION, pat, ref)
    print(f"{FONCTION} : prête. Vérifier que l'agenda du foyer est partagé avec {compte}.")


if __name__ == "__main__":
    main()
