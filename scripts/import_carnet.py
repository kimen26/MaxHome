"""Importe un carnet de voyage JSON (inbox/voyages/<slug>.json) dans les tables
`voyage_lieux`, `voyage_resas` et le champ `voyages.topo` (schéma : 020_carnet_voyage.sql).

Sans --appliquer (par défaut) : valide le JSON, affiche un résumé, écrit le SQL dans
inbox/voyages/<slug>.sql sans rien exécuter.
Avec --appliquer : exécute ce SQL via scripts/sql.py (Management API), dans une transaction.

Usage : python scripts/import_carnet.py inbox/voyages/x.json [--appliquer]

Zéro donnée personnelle dans ce fichier : il ne lit que le JSON passé en argument,
ne lit .env que via sql.py (import), ne l'affiche jamais.
"""
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sql import appel, lit_env, API  # noqa: E402

CREE_PAR = "import MaxVoyage"

CATEGORIES = {"a_voir", "activite", "logement", "resto", "transport", "autre"}
STATUTS_LIEU = {"idee", "prevu", "fait", "ecarte"}
TYPES_RESA = {"vol", "train", "logement", "voiture", "activite", "autre"}
STATUTS_RESA = {"a_reserver", "reserve", "annule"}


class ErreurValidation(Exception):
    pass


def echappe(valeur):
    """Dollar-quoting Postgres : insensible aux apostrophes et guillemets français."""
    if valeur is None:
        return "null"
    if isinstance(valeur, bool):
        return "true" if valeur else "false"
    if isinstance(valeur, (int, float)):
        return str(valeur)
    if "$mh$" in str(valeur):
        raise ErreurValidation(f"valeur contenant le délimiteur $mh$ : {valeur[:40]}")
    return f"$mh${valeur}$mh$"


def valide_coordonnees(lat, lng, contexte):
    if (lat is None) != (lng is None):
        raise ErreurValidation(f"{contexte} : lat et lng doivent être tous les deux présents ou tous les deux null")
    if lat is not None:
        if not (-90 <= lat <= 90):
            raise ErreurValidation(f"{contexte} : lat hors bornes ({lat})")
        if not (-180 <= lng <= 180):
            raise ErreurValidation(f"{contexte} : lng hors bornes ({lng})")


def valide_date_iso(valeur, contexte):
    if valeur is None:
        return
    try:
        datetime.fromisoformat(valeur)
    except ValueError as e:
        raise ErreurValidation(f"{contexte} : date non parsable ({valeur!r})") from e


def valide_lieu(lieu, i):
    contexte = f"lieux[{i}] ({lieu.get('nom')!r})"
    if not lieu.get("nom"):
        raise ErreurValidation(f"{contexte} : nom manquant")
    if lieu.get("categorie") not in CATEGORIES:
        raise ErreurValidation(f"{contexte} : categorie invalide ({lieu.get('categorie')!r})")
    if lieu.get("statut") not in STATUTS_LIEU:
        raise ErreurValidation(f"{contexte} : statut invalide ({lieu.get('statut')!r})")
    valide_coordonnees(lieu.get("lat"), lieu.get("lng"), contexte)
    if lieu.get("jour"):
        valide_date_iso(lieu["jour"], contexte)


def valide_resa(resa, i):
    contexte = f"resas[{i}] ({resa.get('titre')!r})"
    if not resa.get("titre"):
        raise ErreurValidation(f"{contexte} : titre manquant")
    if resa.get("type") not in TYPES_RESA:
        raise ErreurValidation(f"{contexte} : type invalide ({resa.get('type')!r})")
    if resa.get("statut") not in STATUTS_RESA:
        raise ErreurValidation(f"{contexte} : statut invalide ({resa.get('statut')!r})")
    prix = resa.get("prix_centimes")
    if prix is not None:
        if not isinstance(prix, int) or isinstance(prix, bool) or prix < 0:
            raise ErreurValidation(f"{contexte} : prix_centimes doit être un entier >= 0 ({prix!r})")
    valide_date_iso(resa.get("debut"), contexte)
    valide_date_iso(resa.get("fin"), contexte)


def valide_carnet(donnees):
    if not isinstance(donnees.get("voyage_id"), int):
        raise ErreurValidation("voyage_id manquant ou non entier")
    if "topo" not in donnees or not isinstance(donnees["topo"], str):
        raise ErreurValidation("topo manquant ou non textuel")
    lieux = donnees.get("lieux", [])
    resas = donnees.get("resas", [])
    for i, lieu in enumerate(lieux):
        valide_lieu(lieu, i)
    for i, resa in enumerate(resas):
        valide_resa(resa, i)
    return lieux, resas


def genere_sql(voyage_id, topo, lieux, resas):
    lignes = ["begin;", ""]

    for lieu in lieux:
        cols = ["voyage_id", "nom", "categorie", "statut", "jour", "ordre", "lat", "lng",
                "adresse", "note", "lien", "cree_par"]
        vals = [
            voyage_id, echappe(lieu["nom"]), echappe(lieu["categorie"]), echappe(lieu["statut"]),
            echappe(lieu.get("jour")), lieu.get("ordre", 0), lieu.get("lat"), lieu.get("lng"),
            echappe(lieu.get("adresse")), echappe(lieu.get("note")), echappe(lieu.get("lien")),
            echappe(CREE_PAR),
        ]
        vals = [v if v is not None else "null" for v in vals]
        lignes.append(f"insert into voyage_lieux ({', '.join(cols)}) values ({', '.join(str(v) for v in vals)});")

    if lieux:
        lignes.append("")

    for resa in resas:
        cols = ["voyage_id", "type", "titre", "debut", "fin", "prestataire", "code",
                "prix_centimes", "paye_par", "statut", "note", "cree_par"]
        vals = [
            voyage_id, echappe(resa["type"]), echappe(resa["titre"]),
            echappe(resa.get("debut")), echappe(resa.get("fin")), echappe(resa.get("prestataire")),
            echappe(resa.get("code")), resa.get("prix_centimes"), echappe(resa.get("paye_par")),
            echappe(resa["statut"]), echappe(resa.get("note")), echappe(CREE_PAR),
        ]
        vals = [v if v is not None else "null" for v in vals]
        lignes.append(f"insert into voyage_resas ({', '.join(cols)}) values ({', '.join(str(v) for v in vals)});")

    if resas:
        lignes.append("")

    lignes.append(f"update voyages set topo = {echappe(topo)}, topo_le = now() where id = {voyage_id};")
    lignes.append("")
    lignes.append("commit;")
    return "\n".join(lignes)


def resume(voyage_id, lieux, resas, topo):
    par_categorie = {}
    sans_coord = 0
    for lieu in lieux:
        par_categorie[lieu["categorie"]] = par_categorie.get(lieu["categorie"], 0) + 1
        if lieu.get("lat") is None:
            sans_coord += 1
    par_type = {}
    for resa in resas:
        par_type[resa["type"]] = par_type.get(resa["type"], 0) + 1

    print(f"Voyage {voyage_id}")
    print(f"  Lieux : {len(lieux)} ({sans_coord} sans coordonnées)")
    for cat, n in sorted(par_categorie.items()):
        print(f"    - {cat} : {n}")
    print(f"  Résas : {len(resas)}")
    for t, n in sorted(par_type.items()):
        print(f"    - {t} : {n}")
    print(f"  Topo : {len(topo.splitlines())} lignes")


def controle_deja_rempli(voyage_id):
    """Retourne (bloque: bool, message: str). bloque=False si la table n'existe pas encore
    (migration 020 pas encore appliquée) : on le signale mais on ne bloque pas l'aperçu."""
    try:
        env = lit_env()
    except FileNotFoundError:
        return False, "  [contrôle ignoré] .env introuvable — pas de vérification possible en aperçu."
    ref, pat = env.get("SUPABASE_REF"), env.get("SUPABASE_PAT")
    if not ref or not pat:
        return False, "  [contrôle ignoré] SUPABASE_REF/SUPABASE_PAT absents de .env."
    requete = (
        f"select (select count(*) from voyage_lieux where voyage_id = {voyage_id}) as lieux, "
        f"(select count(*) from voyage_resas where voyage_id = {voyage_id}) as resas;"
    )
    try:
        resultat = appel("POST", f"{API}/projects/{ref}/database/query", pat, {"query": requete})
    except RuntimeError as e:
        return False, f"  [contrôle impossible] la table voyage_lieux/voyage_resas n'existe peut-être pas encore ({e})."
    ligne = resultat[0] if resultat else {"lieux": 0, "resas": 0}
    if ligne.get("lieux", 0) > 0 or ligne.get("resas", 0) > 0:
        return True, f"  [BLOQUANT] le voyage {voyage_id} a déjà {ligne['lieux']} lieux et {ligne['resas']} résas en base."
    return False, f"  [contrôle OK] voyage {voyage_id} n'a encore aucun lieu ni résa en base."


def main():
    args = sys.argv[1:]
    appliquer = "--appliquer" in args
    args = [a for a in args if a != "--appliquer"]
    if len(args) != 1:
        sys.exit("usage : python scripts/import_carnet.py <fichier.json> [--appliquer]")

    chemin_json = Path(args[0])
    donnees = json.loads(chemin_json.read_text(encoding="utf-8"))

    try:
        lieux, resas = valide_carnet(donnees)
    except ErreurValidation as e:
        sys.exit(f"JSON invalide : {e}")

    voyage_id = donnees["voyage_id"]
    topo = donnees["topo"]

    bloque, message = controle_deja_rempli(voyage_id)
    print(message)
    if bloque and appliquer:
        sys.exit("Import refusé : le voyage a déjà des lieux ou des résas.")

    sql = genere_sql(voyage_id, topo, lieux, resas)
    chemin_sql = chemin_json.with_suffix(".sql")

    print()
    resume(voyage_id, lieux, resas, topo)

    if not appliquer:
        chemin_sql.write_text(sql, encoding="utf-8")
        print(f"\nAperçu seul (pas de --appliquer). SQL écrit dans {chemin_sql}")
        return

    chemin_sql.write_text(sql, encoding="utf-8")
    env = lit_env()
    ref, pat = env["SUPABASE_REF"], env["SUPABASE_PAT"]
    print("\nApplication en base...")
    resultat = appel("POST", f"{API}/projects/{ref}/database/query", pat, {"query": sql})
    print(json.dumps(resultat, ensure_ascii=False, indent=2) if resultat else "OK (pas de retour)")


if __name__ == "__main__":
    main()
