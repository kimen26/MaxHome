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
      `scripts\setup_task.ps1` puis `Start-ScheduledTask -TaskName MaxHome-Bot`, vérifier
      `Get-ScheduledTask MaxHome-Bot` = Running et `data/bot.log` qui tourne.
- [ ] Yann : envoyer `aide` au bot pour confirmer la mise en service, puis inscrire Claudia
      (`/start` côté Claudia → `inscrire <id> Claudia` côté Yann).

## Lane D — Refonte design (2026-09-06)
- [x] Migration 005 additive : `mouvements_recurrents` + `mouvements`, `lignes.regle`,
      `charges.montant_defaut`/`defaut_dernier`. 272 lignes / 38 revenus / 16 charges intacts.
- [x] Moteur : `calculer()` lit `ligne.regle ?? charge.regle`, accepte l'ancien et le
      nouveau format de `lignes` (équivalence testée).
- [x] Six écrans mobile + PC : Ce mois (check-list cochable, détail, consigne, complément
      du permanent), Charges (segment de règle du mois, préaffichage, repères, alerte
      d'oubli), Réglages d'une charge, Stats, Récurrents, Comptes, Vue annuelle.
- [x] Bot et Edge Function bascules sur `mouvements` ; `fait <titre>`, bilan des restants ;
      repli du rappel sur les récurrents quand le mois n'a pas encore été ouvert.
- [x] Recettes : test_calc, recette visuelle, recette connectée, 60 tests bot — toutes vertes.
- [ ] **Yann : créer le compte commun** dans l'écran Comptes. Tant qu'il manque, les
      mouvements affichent « Comptes à définir » et le bouton Copier ne peut pas proposer
      le complément du virement permanent.
- [ ] Décider : polices Google Fonts (actuel) ou auto-hébergées dans `frontend/`.
- [ ] Dropper `virements` quand plus rien ne la lit (plus aucune référence au 2026-09-06).
- [ ] `libre.py` peut produire `mouvement_fait` mais `_traduire_action_libre` ne le traduit
      pas : le langage libre ne sait pas cocher (déjà vrai avant la refonte, à trancher).

## Lane E — MaxHome : suite du foyer (2026-09-06)
- [x] Lot 0 : renommage MaxBudget → MaxHome (dépôt GitHub + Pages /MaxHome/, projet Supabase,
      secrets, tâche planifiée, MaxOps, textes). Bot redémarré avec les nouveaux noms.
- [x] Lot 1 : hub d'accueil (une carte par module avec son résumé), navigation par module,
      blocs partagés (`blocs.js`), module Tâches : migration 006 (15 tâches de départ),
      `taches.js` testé (`tests/test_taches.mjs`), écrans Aujourd'hui / Balance / Réglages.
      Recette connectée étendue (7 tables RLS, coche d'une tâche, 9 captures). 
- [x] Bot Telegram multi-modules : `taches`, `balance [<jours>]`, `ajoute <article>`,
      `courses` ; `fait <titre>` vise une tâche ou un mouvement (D-021). Annulation étendue.
- [x] Rappel du soir (`rappel-taches`, 19:00 Paris) des tâches « le jour même » non faites ;
      `deploy_rappels.py` déploie et planifie les deux rappels.
- [x] Lot 2 : Courses — migration 007, écran (ajout rapide, rayons ordonnés, panier
      repliable), bot, recette. Alexa reste utilisable en parallèle.
- [x] Audit refonte : duplication descendue dans `blocs.js` (panneau, trajet, ligne de
      réglage, branchement des réglages), divergences frontend/bot corrigées (D-022), code
      mort retiré, promesses flottantes attrapées. 101 tests bot, 4 portes vertes.
- [ ] Yann et Claudia : ajuster les tâches de départ (fréquence, pénibilité, importance) —
      elles sont génériques, pas les vôtres.
- [ ] Yann : renseigner les rayons des articles récurrents au fil de l'eau (défaut « Autre »).

## Lane F — Refactor modules (brief inbox du 2026-09-07, exécuté le jour même)
- [x] Lot 1 : `socle/blocs-checklist.js` + `socle/occurrences.js` ; `montantTheorique` dans
      calc.js (testé) ; Ce mois et Aujourd'hui assemblés dessus.
- [x] Lot 2 : `socle/blocs-reglages.js` + `socle/blocs-form.js` ; Récurrents, Tâches
      récurrentes, Comptes assemblés dessus ; `confirmer()` en feuille remplace `confirm()`.
- [x] Lot 3 : un dossier par module (`budget/`, `taches/`, `courses/`), descripteurs
      `mod-*.js`, `modules.js`, `app.js` générique (128 lignes), socle injecté.
- [x] Lot 4 : ajustements dans ui-charges (formulaire en feuille), tâches regroupées
      (D-023), `tests/comparer_captures.mjs` (pixel, sans dépendance), `scripts/bot/courses.py`.
- [x] Trois bugs trouvés par la recette durcie : course d'écritures (D-026), double
      démarrage (L-017), rendu avant données (L-019).
- [ ] Bot : `mouvements.py` porte encore un miroir manuel de `montantTheorique` ; passer par
      `calc_cli.mjs` si le miroir diverge une fois de plus (L-014).

## Lane B — V1 (après recette)
- [x] Vue annuelle (tableau 12 mois comme l'Excel)
- [ ] Importer les feuilles 2023 et « Garde Max » si utile
