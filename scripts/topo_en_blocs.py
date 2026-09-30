"""Découpe `voyages.topo` en `voyage_blocs` pour les voyages qui n'en ont encore aucun (D-047 §V2).

Pour chaque voyage ayant un topo et AUCUN bloc :
- le texte avant le premier `## ` devient un bloc `info` sans titre (s'il n'est pas vide) ;
- chaque section `## Titre` devient un bloc, type déduit de mots du titre (savoir / astuce /
  conseil / tip -> astuce ; attention / alerte / fermé / important -> attention ; sinon info) ;
- les montants de budget estimés éventuels (ligne « **Total estimé : ... €** » / « Total connu »
  / lignes à poste + montant sous un titre « budget ») sont proposés comme enveloppes par poste,
  mais **jamais insérés automatiquement** : seul un montant explicite dans le topo est repris,
  affiché en aperçu, à confirmer avec --appliquer.

Le bloc `resume` de chaque voyage n'est PAS déduit du topo ici : il est rédigé à la main (agent)
dans `inbox/voyages/resumes.json` (ignoré par git) et inséré par ce même script.

Sans --appliquer (par défaut) : aperçu seul, rien en base (même patron que import_carnet.py).
Avec --appliquer : exécute via scripts/sql.py (Management API).

Usage : python scripts/topo_en_blocs.py [--appliquer]

Zéro donnée personnelle dans ce fichier : il ne lit le contenu des topos qu'en mémoire, ne
l'écrit dans aucun fichier suivi par git.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sql import appel, lit_env, API  # noqa: E402

CREE_PAR = "topo_en_blocs"

MOTS_ASTUCE = ("savoir", "astuce", "conseil", "tip")
MOTS_ATTENTION = ("attention", "alerte", "ferm", "important")

RESUMES_JSON = Path(__file__).resolve().parent.parent / "inbox" / "voyages" / "resumes.json"

RE_SECTION = re.compile(r"^##\s+(.+)$", re.MULTILINE)
# Ligne "- Poste : montant €" ou "**Total (estimé|connu) : X-Y €**" sous un titre Budget.
RE_MONTANT_TOTAL = re.compile(
    r"\*\*(?:total|reste [àa] pr[ée]voir)[^:*]*:\s*~?\s*([\d\s]+)(?:[\s-]+([\d\s]+))?\s*€",
    re.IGNORECASE,
)


def normalise(texte):
    return texte.lower()


def type_pour_titre(titre):
    t = normalise(titre)
    if any(m in t for m in MOTS_ATTENTION):
        return "attention"
    if any(m in t for m in MOTS_ASTUCE):
        return "astuce"
    return "info"


def decoupe_topo(topo):
    """-> [{titre: str|None, texte: str, type: str}], dans l'ordre du topo."""
    if not topo or not topo.strip():
        return []
    matches = list(RE_SECTION.finditer(topo))
    blocs = []
    if not matches:
        return [{"titre": None, "texte": topo.strip(), "type": "info"}]
    debut_texte_libre = topo[: matches[0].start()].strip()
    if debut_texte_libre:
        blocs.append({"titre": None, "texte": debut_texte_libre, "type": "info"})
    for i, m in enumerate(matches):
        titre = m.group(1).strip()
        fin = matches[i + 1].start() if i + 1 < len(matches) else len(topo)
        texte = topo[m.end():fin].strip()
        blocs.append({"titre": titre, "texte": texte, "type": type_pour_titre(titre)})
    return blocs


def propose_enveloppes(blocs):
    """Cherche un montant total explicite dans les blocs dont le titre évoque le budget.
    Ne propose RIEN si aucun montant n'est explicite (pas d'invention). Un intervalle
    "1 000-1 600" est repris par son extrémité haute (le cadrage doit couvrir le pire cas)."""
    propositions = []
    for bloc in blocs:
        titre = normalise(bloc["titre"] or "")
        if "budget" not in titre:
            continue
        m = RE_MONTANT_TOTAL.search(bloc["texte"])
        if not m:
            continue
        haut = m.group(2) or m.group(1)
        try:
            centimes = int(haut.replace(" ", "").replace(" ", "")) * 100
        except ValueError:
            continue
        propositions.append({"poste": "autre", "prevu_centimes": centimes, "source": bloc["titre"]})
    return propositions


def echappe(valeur):
    if valeur is None:
        return "null"
    if isinstance(valeur, (int, float)):
        return str(valeur)
    if "$mh$" in str(valeur):
        raise ValueError(f"valeur contenant le délimiteur $mh$ : {valeur[:40]}")
    return f"$mh${valeur}$mh$"


def genere_sql_blocs(voyage_id, blocs, ordre_depart=0):
    lignes = []
    for i, bloc in enumerate(blocs):
        cols = ["voyage_id", "type", "titre", "texte", "ordre", "cree_par"]
        vals = [voyage_id, echappe(bloc["type"]), echappe(bloc["titre"]), echappe(bloc["texte"]),
                ordre_depart + i, echappe(CREE_PAR)]
        lignes.append(f"insert into voyage_blocs ({', '.join(cols)}) values ({', '.join(str(v) for v in vals)});")
    return lignes


def genere_sql_resume(voyage_id, texte_resume):
    cols = ["voyage_id", "type", "titre", "texte", "ordre", "cree_par"]
    vals = [voyage_id, echappe("resume"), "null", echappe(texte_resume), -1, echappe(CREE_PAR)]
    return f"insert into voyage_blocs ({', '.join(cols)}) values ({', '.join(str(v) for v in vals)});"


def voyages_sans_blocs(ref, pat):
    q = (
        "select v.id, v.titre, v.topo from voyages v "
        "where v.topo is not null and not exists (select 1 from voyage_blocs b where b.voyage_id = v.id) "
        "order by v.id;"
    )
    return appel("POST", f"{API}/projects/{ref}/database/query", pat, {"query": q})


def main():
    args = sys.argv[1:]
    appliquer = "--appliquer" in args

    env = lit_env()
    ref, pat = env["SUPABASE_REF"], env["SUPABASE_PAT"]

    voyages = voyages_sans_blocs(ref, pat)
    if not voyages:
        print("Aucun voyage à découper (tous ont déjà des blocs, ou aucun topo).")
        return

    resumes = {}
    if RESUMES_JSON.exists():
        resumes = json.loads(RESUMES_JSON.read_text(encoding="utf-8"))

    toutes_lignes_sql = []
    for v in voyages:
        blocs = decoupe_topo(v["topo"])
        print(f"\nVoyage {v['id']} — {v['titre']}")
        for b in blocs:
            titre_aff = b["titre"] or "(sans titre)"
            print(f"  [{b['type']}] {titre_aff} — {len(b['texte'])} caractères")
        enveloppes = propose_enveloppes(blocs)
        if enveloppes:
            for e in enveloppes:
                print(f"  Enveloppe proposée : poste={e['poste']} prevu={e['prevu_centimes']/100:.2f} € (depuis « {e['source']} »)")
        else:
            print("  Aucun montant de budget explicite trouvé : aucune enveloppe proposée.")

        resume_texte = resumes.get(str(v["id"])) or resumes.get(v["titre"])
        if resume_texte:
            print(f"  Résumé fourni ({len(resume_texte.splitlines())} lignes) : sera inséré en tête (ordre -1).")
        else:
            print("  Aucun résumé fourni dans inbox/voyages/resumes.json pour ce voyage.")

        lignes_sql = genere_sql_blocs(v["id"], blocs, ordre_depart=0)
        if resume_texte:
            lignes_sql.insert(0, genere_sql_resume(v["id"], resume_texte))
        for e in enveloppes:
            cols = ["voyage_id", "poste", "prevu_centimes", "note"]
            vals = [v["id"], echappe(e["poste"]), e["prevu_centimes"], echappe(f"proposé depuis « {e['source']} »")]
            lignes_sql.append(
                f"insert into voyage_enveloppes ({', '.join(cols)}) values ({', '.join(str(x) for x in vals)}) "
                f"on conflict (voyage_id, poste) do nothing;"
            )
        toutes_lignes_sql.extend(lignes_sql)

    if not appliquer:
        print("\nAperçu seul (pas de --appliquer). Rien écrit en base.")
        return

    sql = "begin;\n\n" + "\n".join(toutes_lignes_sql) + "\n\ncommit;\n"
    print("\nApplication en base...")
    resultat = appel("POST", f"{API}/projects/{ref}/database/query", pat, {"query": sql})
    print(json.dumps(resultat, ensure_ascii=False, indent=2) if resultat else "OK (pas de retour)")


if __name__ == "__main__":
    main()
