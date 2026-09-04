# MEMORY — MaxBudget
_État courant. Réécrit en fin de session, jamais un journal._

## Où on en est
- 2026-09-04 : V0 livrée en local, non déployée. Front vanille (login, revenus, charges,
  répartition, copie mois précédent), schéma SQL + RLS, moteur de calcul testé,
  import Excel → data/import.sql (16 charges, 272 lignes, 38 revenus, 2025+2026).
- Bloquant côté Yann : créer le projet Supabase, comptes, coller schema.sql et
  data/import.sql, remplir frontend/config.js, activer GitHub Pages (README).
- Excel source : inbox/Comptes 2026.xlsx (6 feuilles ; 2 importées).

## Pointeurs
- docs/regles-repartition.md — règles métier extraites de l'Excel
- docs/architecture.md — stack et sécurité
- tests/test_calc.mjs, tests/recette_visuelle.mjs — portes
