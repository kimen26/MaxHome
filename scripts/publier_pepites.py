"""Publie l'instantané de veille vols de MaxVoyage dans la table veille_vols (ligne unique).

Appelé par MaxVoyage à la fin de sa collecte du matin (docs/briefs/veille-vols.md).
Lit .env (SUPABASE_PAT, SUPABASE_REF), ne l'affiche jamais.
Usage : python scripts/publier_pepites.py <pepites.json>
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from provision import appel, cles, lit_env  # noqa: E402

VERSION_CONTRAT = 1
CHAMPS_OFFRE = ("destination", "ville", "depart", "retour", "prix_pp_centimes", "prix_total_centimes", "lien")


def verifier_instantane(d):
    """Refuse un instantané hors contrat : mieux vaut garder celui de la veille qu'afficher faux."""
    if not isinstance(d, dict) or d.get("version") != VERSION_CONTRAT:
        raise ValueError(f"version de contrat attendue : {VERSION_CONTRAT}")
    for cle in ("genere_le", "releve_le"):
        if not isinstance(d.get(cle), str) or not d[cle]:
            raise ValueError(f"champ manquant : {cle}")
    if not isinstance(d.get("periodes"), list) or not isinstance(d.get("presse"), list):
        raise ValueError("periodes et presse doivent être des listes")
    for p in d["periodes"]:
        for o in p.get("offres", []):
            manquants = [c for c in CHAMPS_OFFRE if o.get(c) is None]
            if manquants:
                raise ValueError(f"offre {o.get('destination')} sans {', '.join(manquants)}")
            for c in ("prix_pp_centimes", "prix_total_centimes"):
                if not isinstance(o[c], int):
                    raise ValueError(f"{c} doit être un entier de centimes")
    return d


def publier(instantane, env):
    ref, pat = env["SUPABASE_REF"], env["SUPABASE_PAT"]
    _, service_role = cles(ref, pat)
    ligne = {"id": 1, "genere_le": instantane["genere_le"], "contenu": instantane}
    appel("POST", f"https://{ref}.supabase.co/rest/v1/veille_vols", service_role, [ligne],
          entetes={"apikey": service_role, "Prefer": "resolution=merge-duplicates,return=minimal"})


def main():
    if len(sys.argv) != 2:
        sys.exit("usage : python scripts/publier_pepites.py <pepites.json>")
    instantane = verifier_instantane(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")))
    publier(instantane, lit_env())
    n = sum(len(p.get("offres", [])) for p in instantane["periodes"])
    print(f"veille_vols publiée : relevé du {instantane['releve_le']}, {n} offres, {len(instantane['presse'])} bons plans presse")


if __name__ == "__main__":
    main()
