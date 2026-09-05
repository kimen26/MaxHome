# Lot B bis — Bot Telegram : saisir et interroger le budget par message

_Brief jetable : descend dans `docs/archives/` une fois livré. Rédigé 2026-09-06, validé par Yann._

## Contexte (lire d'abord)
- `CLAUDE.md`, `docs/regles-repartition.md`, `docs/architecture.md`, `memory/DECISIONS.md` (D-006, D-010), `memory/MEMORY.md`.
- Code : `frontend/calc.js` (moteur, source de vérité du calcul), `frontend/api.js` (accès données), `scripts/provision.py` (lecture `.env`, appels HTTP, `cles()` donne la clé service_role), `scripts/deploy_rappel.py`, `supabase/functions/rappel-virements/index.ts`, `supabase/migrations/002_lot_a.sql`.
- Modèle de référence pour la tâche Windows : `c:\ProjetsPerso\Claude_Projects\MaxVoyage\scripts\setup_task.ps1` et `start_ui.ps1` (boucle de relance, logs).
- Bot Telegram existant : `BudgetCYM_bot`, token dans `.env` (`MAXBUDGET_TELEGRAM_BOT_TOKEN`), chat privé de Yann = `MAXBUDGET_TELEGRAM_CHAT_ID`. Identifiant Telegram de Yann : 6433455282. Claudia n'a pas encore parlé au bot.
- **Pas de clé API Anthropic.** Les phrases libres sont comprises par Claude Code en local (abonnement) : `claude -p "<prompt>" --model haiku --output-format json` (CLI 2.1.210 installée). Le PC reste allumé.

## Objectif
Depuis Telegram, en une ligne : saisir un salaire, un extra, un ajustement, cocher un virement, et poser des questions dont la réponse est **calculée par le moteur**, jamais inventée.

## Architecture imposée
- `scripts/bot/` en Python 3.11, stdlib + `urllib` (pas de framework) : long polling `getUpdates` (timeout 50 s), boucle infinie, journal rotatif `data/bot.log`, redémarre seul (tâche Windows `MaxBudget-Bot` au logon, `-ExecutionTimeLimit 0`, `RestartInterval 1 min`). Script `scripts/setup_task.ps1` idempotent.
- Écriture/lecture Supabase via REST PostgREST avec la clé **service_role** obtenue par `provision.cles()` au démarrage, jamais écrite sur disque ni journalisée. Les tables ont la RLS : service_role la contourne, c'est voulu ; l'allowlist se fait côté bot.
- **Allowlist** : table `telegram_membres (telegram_id bigint primary key, prenom text references membres(prenom))`, migration additive `supabase/migrations/004_telegram.sql` appliquée avec `scripts/sql.py`. Insérer Yann (6433455282). Tout message d'un identifiant inconnu : réponse « inconnu, demande à Yann » + journal ; aucune écriture. Commande `/moi <prénom>` acceptée SEULEMENT si l'expéditeur est déjà connu (Yann inscrit Claudia en lui transférant son id : `/inscrire 123456 Claudia`).
- Calcul : ne pas réimplémenter `calc.js` en Python. Créer `scripts/bot/calc_cli.mjs` qui importe `frontend/calc.js`, lit un JSON sur stdin (charges, lignes, revenus, ajustements), écrit le résultat JSON sur stdout ; le bot l'appelle par `subprocess` (`node`). Un seul moteur.
- Fichiers < 400 lignes : `bot.py` (boucle + dispatch), `telegram.py` (API), `donnees.py` (Supabase), `commandes.py` (grammaire), `libre.py` (Claude Code), `reponses.py` (formatage).

## Commandes (grammaire déterministe, insensible à la casse et aux accents)
Mois courant par défaut ; suffixe optionnel « en août », « août 2026 », « 08/2026 » pour un autre mois.
- `salaire 6120` ; `salaire claudia 4300` → `revenus` (centimes).
- `impots 345` ; `taxe fonciere 215` → `lignes` de la charge dont le libellé ressemble le plus (normalisation accents/casse, `difflib` ratio ≥ 0,75 ; en dessous : proposer les 3 plus proches, n'écrire rien). Montant saisi positif = dépense, stocké négatif ; « +700 caf » ou « rembours… » = positif.
- `extra plaque de cuisson 150` ; `extra volet 600 egales` → charge `ponctuel=true, actif=false, categorie='Autre', regle` (défaut proport) + ligne du mois.
- `yann prend 200 resto` / `ajustement claudia 120 courses` → `ajustements (de=autre membre, vers=expéditeur ou nommé, montant, motif)`. Sémantique à documenter dans `reponses.py` et à confirmer dans la réponse (« Yann prend 200 € en plus : Claudia verse 200 € de moins »).
- `fait` / `virement fait` → `virements.fait_le = now()` pour l'expéditeur ; `pas fait` l'annule.
- `bilan` → bloc « à faire » : Yann verse X, Claudia verse Y, reste à vivre chacun, total commun, lignes vides alors que le mois précédent en avait (alerte).
- `charges` → liste par catégorie avec montants du mois ; `mois` → mois courant + navigation ; `aide` → la liste.
- `annuler` → défait la dernière écriture de l'expéditeur (garder en mémoire par expéditeur : table, clé, ancienne valeur ; une seule profondeur).
- Toute écriture répond par une confirmation avec la valeur enregistrée et le mois : « Salaire Yann septembre 2026 : 6 120,00 € ✔ ».
- Mois vide (ni ligne ni revenu) : avant d'écrire, proposer « Septembre est vide. Démarrer depuis août ? oui/non » (état d'attente par expéditeur, 10 min) ; sur `oui`, copier charges non ponctuelles + revenus comme le fait l'app, puis appliquer l'écriture demandée.

## Phrases libres (repli)
Si la grammaire ne matche pas : appeler `claude -p` avec un prompt système court qui décrit les actions possibles (schéma JSON strict : `{"action": "...", "prenom": ..., "montant": ..., "libelle": ..., "mois": ..., "question": ...}` ou `{"action":"inconnu"}`), les libellés de charges existants, le mois courant, et le message. Timeout 60 s. Résultat JSON → mêmes fonctions que la grammaire. Toujours **relire avant d'écrire** : « J'ai compris : extra "réparation vélo" 85 € prorata, septembre. OK ? » → `oui`/`non`. Les questions libres (« combien pour Max cette année ? ») reçoivent une réponse calculée : le bot passe à Claude les chiffres agrégés (par catégorie, par mois) et demande une phrase de réponse ; Claude ne calcule pas, il formule.
Si `claude` échoue ou n'est pas installé : répondre « Je n'ai pas compris. Tape `aide`. » et journaliser ; jamais planter la boucle.

## Sécurité
- Aucun secret dans les logs, les réponses Telegram, git. `data/` et `.env` restent ignorés.
- Un message = une écriture au plus. Montants bornés (0 < montant ≤ 50 000 €) sinon refus.
- Le bot ne modifie jamais `membres`, `comptes`, ni la structure des charges régulières (renommer/catégoriser reste dans l'app).

## Portes (toutes vertes avant de rendre la main)
- `python -m pytest -q tests/bot/` : grammaire (≥ 15 cas dont accents, mois explicites, montants avec virgule/espace fine, ambiguïtés refusées), fuzzy libellé, formatage, `annuler`, bornes. Tests hors ligne : Supabase et Telegram mockés.
- `node tests/test_calc.mjs` toujours vert ; test de `calc_cli.mjs` sur février 2026 (Yann −3 236,15 ±1 ct).
- Recette réelle : lancer le bot à la main, envoyer depuis Telegram (Yann) `aide`, `bilan` sur février 2026 (`bilan février 2026`), puis `salaire 6120 en février 2026` (valeur déjà en base : aucune modification réelle) et `annuler`. Vérifier en SQL que les 272 lignes / 38 revenus + données Lot A sont intactes après la recette.
- Tâche Windows installée (`Get-ScheduledTask MaxBudget-Bot` = Ready/Running), bot répondant après `Start-ScheduledTask`.
- `README.md` : section « Bot Telegram » (commandes, installation de la tâche, inscription de Claudia).

## Hors périmètre
Provisions, virements automatiques, solde déclaré (Lot C). Vue annuelle (Lot B). Photos/tickets. Groupe Telegram (chat privé pour l'instant ; Claudia s'inscrit via `/start` puis `/inscrire` par Yann).

## Règles de travail
- Commits conventionnels petits, `git add <chemins>`, jamais `-A`, ligne finale « Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com> ». Push sur master à la fin.
- Ne jamais afficher `.env` (hook). Ne pose pas de question : tranche, grave l'arbitrage dans `memory/DECISIONS.md` (numéro pris en relisant le fichier), continue.
- Fin : `memory/MEMORY.md`, `TODO.md` (cocher aussi les lignes Telegram/rappel déjà faites le 2026-09-06 : secrets, Edge Function déployée, cron actif), `LESSONS.md` si piège payé, brief → `docs/archives/`. Rapport final court : livré / non livré et pourquoi / sortie décisive des portes / ce que Yann doit faire (ex. envoyer un message test).
