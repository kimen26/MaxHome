"""Remplace « le petit » par le prénom de l'enfant dans les titres des tâches.

Pourquoi un script et pas une migration : le dépôt est PUBLIC (invariant 1), donc le prénom
ne peut pas être écrit en dur dans un fichier versionné. Il vit dans .env (PRENOM_ENFANT,
ignoré par git) et n'existe qu'en base, là où seuls Claudia et Yann le voient.

Idempotent : relancé, il ne trouve plus rien à renommer. Réversible par --inverse.

Usage : python scripts/renommer_enfant.py [--inverse]
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
ENV = RACINE / ".env"
API = "https://api.supabase.com/v1"
GENERIQUE = "le petit"


def lit_env():
    return dict(l.split("=", 1) for l in ENV.read_text(encoding="utf-8").splitlines() if "=" in l)


def requete(sql, ref, pat):
    data = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(f"{API}/projects/{ref}/database/query", data=data, method="POST")
    req.add_header("Authorization", f"Bearer {pat}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "maxhome-renommage/1.0")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            texte = r.read().decode()
            return json.loads(texte) if texte else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{e.code}: {e.read().decode()[:400]}") from e


def echappe(valeur):
    """Apostrophe SQL doublée — le prénom vient de .env, jamais d'une saisie web, mais on
    n'écrit pas une chaîne dans du SQL sans l'échapper."""
    return valeur.replace("'", "''")


def main():
    inverse = "--inverse" in sys.argv
    env = lit_env()
    ref, pat = env["SUPABASE_REF"], env["SUPABASE_PAT"]
    prenom = env.get("PRENOM_ENFANT", "").strip()
    if not prenom:
        sys.exit("PRENOM_ENFANT absent de .env — rien à faire.")

    # Deux tournures en français, à traiter ensemble : « Bain DU petit » et « Déposer LE petit ».
    # Renommées vers le prénom, elles donnent toutes deux « Bain de … » / « Déposer … » —
    # le retour en arrière (--inverse) ne peut donc pas deviner laquelle était laquelle : il
    # remet « le petit » partout, quitte à ce qu'un titre se relise un peu différemment.
    p = echappe(prenom)
    if inverse:
        paires = [(f"de {p}", GENERIQUE.replace("le", "du")), (p, GENERIQUE)]
    else:
        paires = [(f"du {GENERIQUE.split()[1]}", f"de {p}"), (GENERIQUE, p)]

    # `taches` porte une copie du titre figée à la création de l'occurrence : les deux tables
    # doivent suivre, sinon la liste du jour et les réglages afficheraient deux libellés.
    updates = "\n".join(
        f"update taches_recurrentes set titre = replace(titre, '{echappe(a)}', '{echappe(b)}');\n"
        f"update taches             set titre = replace(titre, '{echappe(a)}', '{echappe(b)}');"
        for a, b in paires)
    cible = GENERIQUE if inverse else p
    reste = p if inverse else "petit"
    sql = f"""
    {updates}
    select
      (select count(*) from taches_recurrentes where titre ilike '%{echappe(cible)}%') as recurrentes_renommees,
      (select count(*) from taches             where titre ilike '%{echappe(cible)}%') as occurrences_renommees,
      (select count(*) from taches_recurrentes where titre ilike '%{echappe(reste)}%') as restantes;
    """
    resultat = requete(sql, ref, pat)
    print(json.dumps(resultat, ensure_ascii=False, indent=2) if resultat else "OK")


if __name__ == "__main__":
    main()
