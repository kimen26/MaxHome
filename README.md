# MaxBudget

Suivi mensuel des charges du foyer et de leur répartition (50/50 ou prorata des revenus).
Site statique (GitHub Pages) + Supabase (Auth + Postgres + RLS). Le repo ne contient aucune donnée.

## Mise en place (une fois) — automatisée par `python scripts/provision.py` (lit .env : SUPABASE_PAT, EMAIL_YANN, EMAIL_CLAUDIA). À la main :
1. Créer un projet Supabase (gratuit). **Authentication > Providers > Email** : désactiver « Allow new users to sign up ».
2. **Authentication > Users > Add user** : créer les deux comptes (email + mot de passe).
3. Éditer `supabase/schema.sql` : remplacer `EMAIL_YANN` / `EMAIL_CLAUDIA` par ces emails. Coller dans **SQL Editor**, exécuter.
4. Copier l'URL du projet et la clé *publishable* (**Settings > API**) dans `frontend/config.js`.
5. Historique : `pip install openpyxl` puis
   `python scripts/import_excel.py "inbox/Comptes 2026.xlsx" > data/import.sql`
   et coller `data/import.sql` dans SQL Editor.
6. Publier : GitHub Pages sur le dossier `frontend/` (ou `python -m http.server -d frontend 8000` en local).

## Vérifications
- `node tests/test_calc.mjs` — moteur de répartition.
