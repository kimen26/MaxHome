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

- 2026-09-06 : rappel Telegram DÉPLOYÉ (secrets Supabase, Edge Function, cron 1er et 5).
  Test : « aucun virement calculé pour septembre 2026 » = attendu, le mois n'est pas ouvert.

- 2026-09-06 : **Lot B bis livré** — bot Telegram `BudgetCYM_bot` (`scripts/bot/` :
  bot.py, telegram.py, donnees.py, commandes.py, libre.py, reponses.py, calc_cli.mjs,
  tous < 400 lignes). Grammaire déterministe + repli `claude -p --model haiku` (phrases
  libres, relecture avant écriture) ; allowlist `telegram_membres` (migration
  004_telegram.sql, déjà appliquée, Yann 6433455282 inscrit) ; annuler une profondeur ;
  proposition de copie sur mois vide ; bornes 0 < montant ≤ 50 000 €.
  48 tests hors ligne verts (`python -m pytest -q tests/bot/`, Supabase et Telegram
  mockés) : grammaire, fuzzy, formatage, annuler, bornes, mois vide.
  calc_cli.mjs vérifié sur février 2026 : Yann −3 236,15 € (±1 ct, conforme).
  Recette réelle faite : dispatch direct (Supabase + Telegram réels, pas de polling) avec
  l'id Telegram de Yann — `bilan février 2026`, `salaire 6120 en février 2026` (valeur déjà
  en base), `annuler` : les 3 réponses sont arrivées dans le chat Telegram de Yann, aucune
  donnée modifiée (272 lignes / 38 revenus intacts, février 2026 identique avant/après).
  Deux bugs de grammaire trouvés et corrigés en écrivant les tests (voir D-012/L-007) :
  suffixe de mois sans « en », mot « rembours » qui cassait le fuzzy match.
  **Tâche planifiée NON installée** : `scripts/setup_task.ps1` et `scripts/start_bot.ps1`
  sont livrés et corrects (calqués sur MaxVoyage), mais `Register-ScheduledTask` refuse
  l'accès dans une session non élevée (voir D-011/L-006). Yann doit lancer
  `scripts\setup_task.ps1` en PowerShell administrateur, puis
  `Start-ScheduledTask -TaskName MaxBudget-Bot`. En attendant, le bot ne tourne pas en
  continu — aucune écoute active tant que la tâche n'est pas démarrée.

## Pointeurs
- scripts/deploy_rappel.py — rejouable (secrets, fonction, cron)
- docs/regles-repartition.md — règles métier ; docs/architecture.md — stack
- scripts/provision.py — provisionnement initial (idempotent) ; scripts/sql.py — exécute un
  .sql sur le projet (migrations) ; scripts/check_secrets.py — teste la PRÉSENCE d'une clé
  .env sans jamais l'afficher ; scripts/import_excel.py — Excel → SQL
- tests/test_calc.mjs, tests/recette_visuelle.mjs, tests/recette_connectee.mjs — portes
- supabase/migrations/002_lot_a.sql (appliquée), 003_cron_rappel.sql (NON appliquée),
  004_telegram.sql (appliquée : table telegram_membres, allowlist)
- supabase/functions/rappel-virements/ — Edge Function versionnée, NON déployée
- Repo : https://github.com/kimen26/MaxBudget (Pages via .github/workflows/pages.yml)
- scripts/bot/ — bot Telegram (voir README.md « Bot Telegram ») ; tests/bot/ (48 cas,
  Supabase/Telegram mockés) ; scripts/setup_task.ps1 + scripts/start_bot.ps1 — tâche
  planifiée MaxBudget-Bot, à installer par Yann en PowerShell admin (pas encore installée)
