# TODO — lanes
_Une session = une lane. Marquer (en cours) à l'ouverture, libérer à la fin._

## Lane A — Mise en service (Yann)
- [x] Projet Supabase + 2 comptes + schema.sql + import.sql + config.js
- [x] Repo GitHub public + Pages sur frontend/
- [ ] Transmettre son mot de passe à Claudia (canal privé)
- [ ] Recette réelle à deux sur un mois (février 2026 : Yann −3 236,15 / Claudia −2 608,63 attendus)

## Lane A — Lot A : écran mensuel, règles de répartition, virements
- [x] Migration additive 002_lot_a.sql (categorie/regle/cle_pct/payeur/ponctuel, ajustements,
      comptes, virements) — 272 lignes / 38 revenus inchangés après migration.
- [x] Moteur calc.js : 4 règles (egales/proport/cle/perso), ajustements, totaux par catégorie.
- [x] Écran mensuel : bloc « à faire », charges par catégorie repliables, alerte anti-oubli,
      ponctuels, ajustements, copie automatique proposée (mois vide seulement).
- [x] Panneaux Charges (renommer/catégorie/ordre/archiver) et Comptes (CRUD).
- [x] Edge Function rappel-virements versionnée et DÉPLOYÉE ; secrets Telegram configurés
      dans Supabase ; migration 003_cron_rappel appliquée (cron pg_cron actif, 1er et 5).
- [ ] Renseigner un compte commun réel dans le panneau Comptes (aucun compte encore créé,
      le bloc « à faire » affiche "aucun compte commun défini").

## Lane C — Lot B bis : bot Telegram
- [x] scripts/bot/ (bot.py, telegram.py, donnees.py, commandes.py, libre.py, reponses.py,
      calc_cli.mjs), tous < 400 lignes. Grammaire déterministe + repli `claude -p`.
- [x] Migration 004_telegram.sql appliquée (allowlist telegram_membres, Yann inscrit,
      272 lignes / 38 revenus intacts).
- [x] tests/bot/ : 48 cas hors ligne verts (grammaire, fuzzy, formatage, annuler, bornes,
      mois vide), Supabase et Telegram mockés.
- [x] calc_cli.mjs vérifié sur février 2026 (Yann −3 236,15 € ±1 ct).
- [x] Recette réelle (dispatch direct, Supabase + Telegram réels) : bilan, salaire déjà en
      base, annuler — 3 réponses reçues dans le chat Yann, aucune donnée modifiée.
- [x] README.md section « Bot Telegram ».
- [ ] **Yann : installer la tâche planifiée** — `Register-ScheduledTask` refuse l'accès
      hors session élevée (D-011/L-006). Lancer en PowerShell administrateur :
      `scripts\setup_task.ps1` puis `Start-ScheduledTask -TaskName MaxBudget-Bot`, vérifier
      `Get-ScheduledTask MaxBudget-Bot` = Running et `data/bot.log` qui tourne.
- [ ] Yann : envoyer `aide` au bot pour confirmer la mise en service, puis inscrire Claudia
      (`/start` côté Claudia → `inscrire <id> Claudia` côté Yann).

## Lane B — V1 (après recette)
- [ ] Vue annuelle (tableau 12 mois comme l'Excel)
- [ ] Importer les feuilles 2023 et « Garde Max » si utile
