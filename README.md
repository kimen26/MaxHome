# MaxHome

Les outils du foyer de Claudia et Yann : suivi mensuel des charges et de leur répartition
(50/50 ou prorata des revenus), répartition des tâches ménagères en points de pénibilité, et
une liste de courses commune. Site statique (GitHub Pages) + Supabase (Auth + Postgres + RLS).
Le repo ne contient aucune donnée.

## Architecture

Vue d'ensemble, arborescence du frontend, contrat d'un module, modèle de données, patron
modèle/occurrence, dispatch du bot et portes de vérification : voir
[`docs/architecture.md`](docs/architecture.md).

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
- `python -m pytest -q tests/bot/` — grammaire, formatage et dispatch du bot Telegram (hors ligne).

## Bot Telegram

Bot `BudgetCYM_bot` : saisir un salaire, une charge, un extra, un ajustement, cocher un
virement, ou poser une question sur le budget, en un message. Le calcul est toujours fait
par `frontend/calc.js` (via `scripts/bot/calc_cli.mjs`), jamais réinventé côté bot.

### Commandes
```
salaire <montant> [en <mois>]        salaire du mois courant, ou "salaire claudia 4300"
<libelle charge> <montant> [en <mois>]  ex. "impots 345", "taxe fonciere 215"
extra <libelle> <montant> [egales]   dépense ponctuelle (prorata par défaut)
<prenom> prend <montant> <motif>     ajustement entre les deux comptes, ex. "yann prend 200 resto"
fait / pas fait                      coche/décoche le virement au commun de l'expéditeur
fait <titre>                         coche un autre mouvement du mois, ex. "fait epargne"
bilan [<mois>]                       qui verse quoi, reste à vivre, total commun, reste à faire
charges [<mois>]                     liste des charges par catégorie
mois                                 mois courant
annuler                              défait la dernière écriture de l'expéditeur (une profondeur)
aide                                 rappel des commandes
```
Mois : suffixe optionnel « en août », « août 2026 » ou « 08/2026 » ; par défaut le mois
courant. Montant signé (positif = dépense, `+` ou « rembours… » = remboursement/recette).
Toute phrase qui ne matche pas la grammaire est comprise par `claude -p --model haiku` en
local (pas de clé API) puis relue avant écriture (« J'ai compris : … OK ? »).

### Sécurité
Seuls les identifiants Telegram inscrits dans `telegram_membres` peuvent écrire (allowlist,
vérifiée côté bot avant tout accès Supabase). Un message d'un inconnu ne déclenche aucune
écriture. Le bot ne modifie jamais `membres`, `comptes`, ni la structure des charges
régulières (ça reste dans l'app web).

### Inscrire Claudia
Claudia envoie `/start` au bot `BudgetCYM_bot` pour obtenir son identifiant Telegram, puis
Yann l'inscrit avec `inscrire <id> Claudia` (seul un membre déjà connu peut inscrire
quelqu'un).

### Installation (tâche planifiée Windows)
Le bot tourne en long polling (pas de webhook), redémarre seul s'il plante.
```
powershell -ExecutionPolicy Bypass -File scripts\setup_task.ps1
Start-ScheduledTask -TaskName MaxHome-Bot
Get-ScheduledTask MaxHome-Bot          # doit passer à Running
```
`scripts/setup_task.ps1` doit être lancé depuis une session PowerShell **avec élévation**
(clic droit > Exécuter en tant qu'administrateur) : la création de tâche planifiée refuse
l'accès sans ça. Le script est idempotent, ré-exécutable sans risque.
Journal applicatif : `data/bot.log` (rotatif, jamais de secret dedans). Journal du
processus (démarrages/arrêts) : `data/bot_process.log`.
