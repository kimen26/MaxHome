# MEMORY — MaxBudget
_État courant. Réécrit en fin de session, jamais un journal._

## Où on en est
- 2026-09-05 : **V0 en production** : https://kimen26.github.io/MaxBudget/
  Supabase projet `maxbudget` (ref gdyekswdxhaqqyjuxiep, Paris), 2 comptes créés,
  inscription fermée, historique 2025+2026 importé (16 charges, 272 lignes, 38 revenus).
- Recette connectée passée (RLS anonyme = 0 ligne ; février 2026 = chiffres Excel ±1 ct).
- Mots de passe des comptes : .env (PASS_YANN, PASS_CLAUDIA) — à communiquer à Claudia
  par un canal privé, puis à changer si souhaité.
- Non validé : usage réel par Yann et Claudia sur un mois complet.

## Pointeurs
- docs/regles-repartition.md — règles métier ; docs/architecture.md — stack
- scripts/provision.py — rejouable (idempotent) ; scripts/import_excel.py — Excel → SQL
- tests/test_calc.mjs, tests/recette_visuelle.mjs, tests/recette_connectee.mjs — portes
- Repo : https://github.com/kimen26/MaxBudget (Pages via .github/workflows/pages.yml)
