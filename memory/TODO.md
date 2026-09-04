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
- [x] Edge Function rappel-virements versionnée dans supabase/functions/ — NON déployée
      (secrets MAXBUDGET_TELEGRAM_BOT_TOKEN / MAXBUDGET_TELEGRAM_CHAT_ID absents de .env).
      Migration 003_cron_rappel.sql versionnée mais non appliquée.
- [ ] Configurer les secrets Telegram puis : déployer l'Edge Function, appliquer 003, tester
      un envoi réel.
- [ ] Renseigner un compte commun réel dans le panneau Comptes (aucun compte encore créé,
      le bloc « à faire » affiche "aucun compte commun défini").

## Lane B — V1 (après recette)
- [ ] Vue annuelle (tableau 12 mois comme l'Excel)
- [ ] Importer les feuilles 2023 et « Garde Max » si utile
