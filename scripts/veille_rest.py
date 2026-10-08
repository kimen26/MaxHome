"""Accès REST service_role à la base MaxHome pour les scripts de veille vols (publier_pepites,
lire_alertes), appelés par MaxVoyage. Lit .env, n'affiche jamais une clé."""
from provision import appel, cles, lit_env


def appel_service(methode, chemin, corps=None, entetes=None):
    """Appel PostgREST `rest/v1/<chemin>` avec la clé service_role (hors RLS)."""
    env = lit_env()
    ref, pat = env["SUPABASE_REF"], env["SUPABASE_PAT"]
    _, service_role = cles(ref, pat)
    return appel(methode, f"https://{ref}.supabase.co/rest/v1/{chemin}", service_role, corps,
                 entetes={"apikey": service_role, **(entetes or {})})
