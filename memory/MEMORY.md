# MEMORY — MaxBudget
_État courant. Réécrit en fin de session, jamais un journal._

## Où on en est
- 2026-09-05 : **Lot A livré** : écran mensuel refondu en prod (bloc « à faire », charges
  par catégorie, ponctuels, ajustements, panneaux Charges/Comptes). URL inchangée :
  https://kimen26.github.io/MaxBudget/. Supabase projet `maxbudget` (ref gdyekswdxhaqqyjuxiep,
  Paris), migration additive 002_lot_a.sql appliquée (272 lignes / 38 revenus inchangés,
  16 charges catégorisées). Frontend éclaté en modules < 400 lignes : api.js, calc.js,
  ui-mois.js, ui-charges.js, ui-comptes.js, app.js (orchestrateur).
- Rappel Telegram (Edge Function `rappel-virements` + migration 003_cron_rappel.sql) :
  code versionné, PAS déployé — secrets MAXBUDGET_TELEGRAM_BOT_TOKEN et
  MAXBUDGET_TELEGRAM_CHAT_ID absents de .env. À activer : configurer les secrets, déployer
  la fonction, appliquer 003.
- Aucun compte bancaire encore saisi dans le panneau Comptes : le bloc « à faire » affiche
  "aucun compte commun défini" tant que Yann/Claudia n'en créent pas un via le panneau.
- Recette connectée passée (RLS anonyme = 0 ligne ; février 2026 = chiffres Excel ±1 ct ;
  bloc à faire, sections catégories, cocher/décocher un virement testés).
- Mots de passe des comptes : .env (PASS_YANN, PASS_CLAUDIA) — à communiquer à Claudia
  par un canal privé, puis à changer si souhaité.
- Non validé : usage réel par Yann et Claudia sur un mois complet avec le nouvel écran.

## Pointeurs
- docs/regles-repartition.md — règles métier ; docs/architecture.md — stack
- scripts/provision.py — provisionnement initial (idempotent) ; scripts/sql.py — exécute un
  .sql sur le projet (migrations) ; scripts/check_secrets.py — teste la PRÉSENCE d'une clé
  .env sans jamais l'afficher ; scripts/import_excel.py — Excel → SQL
- tests/test_calc.mjs, tests/recette_visuelle.mjs, tests/recette_connectee.mjs — portes
- supabase/migrations/002_lot_a.sql (appliquée), 003_cron_rappel.sql (NON appliquée)
- supabase/functions/rappel-virements/ — Edge Function versionnée, NON déployée
- Repo : https://github.com/kimen26/MaxBudget (Pages via .github/workflows/pages.yml)
