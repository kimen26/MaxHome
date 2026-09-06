# DECISIONS
_D-NNN : relire le fichier au moment d'écrire pour prendre le numéro suivant._

## D-001 — Stack : site statique public + Supabase (Auth + RLS) — PROPOSÉE (2026-09-04)
Contexte : Yann publie ses projets sur GitHub Pages (repo public), mais les données
(salaires, charges) doivent rester privées et partagées avec Claudia seulement.
Arbitrage : le code est public, les données ne sont jamais dans le repo. Elles vivent
dans Supabase (Postgres gratuit), protégées par Auth email/mot de passe (2 comptes,
inscription désactivée) et des politiques RLS. La clé anon publiée dans le HTML est
inoffensive sans session valide. Réutilise l'expérience Supabase de MaxVoyage.
Alternatives écartées : Google Sheets partagé (pas d'app), fichier chiffré côté client
(pas de multi-utilisateur simple), backend perso (hébergement à payer/maintenir).
Statut : à valider par Yann.

## D-001 — validée par Yann le 2026-09-04 ; front en HTML/JS vanille sans build.

## D-002 — Projet Supabase dédié, comptes créés à la main, allowlist par email (2026-09-04)
Contexte : le MCP Supabase MaxVoyage était injoignable (timeout) et mélanger deux apps
dans une base est fragile. Arbitrage : un projet Supabase propre à MaxBudget, créé par
Yann (1 min). Inscription publique désactivée ET table `membres` (email) consultée par
la RLS via `est_membre()` : double garde. La table sert aussi de liste des personnes
pour les revenus. Pas de service_role nulle part : l'import passe par SQL Editor.

## D-003 — Modèle : charge = type (egales | proport) + montant par mois (2026-09-04)
Extrait du classeur « Comptes 2025/2026 ». Montants négatifs = dépenses, positifs =
remboursements (CAF). Le prorata se calcule sur les revenus nets du mois. Les feuilles
2023 (par compte bancaire) et « Garde Max » ne sont pas importées en V0.

## D-004 — Déploiement Pages par workflow Actions depuis frontend/ (2026-09-05)
Pages « branche » n'accepte que / ou /docs. Un workflow `actions/deploy-pages` publie
frontend/ seul : le reste du repo (scripts, tests) ne part pas sur le site.

## D-005 — Provisionnement par script Management API, secrets dans .env (2026-09-05)
`scripts/provision.py` est idempotent (projet, schéma, import, comptes, config.js).
Le jeton PAT, le mot de passe DB et les mots de passe des comptes vivent dans .env,
jamais affichés (hook garde-secrets). Le repo GitHub a été créé avec le jeton git
déjà stocké dans le gestionnaire d'identifiants Windows, sans le lire en clair.

## D-006 — Pas de virement bancaire automatique (2026-09-05)
Boursorama n'expose pas d'API de virement aux particuliers ; DSP2 exige un prestataire
agréé (Bridge, Powens) sous contrat, et le scraping avec 2FA est fragile et dangereux.
Arbitrage : l'app calcule « qui vire combien où » (compte cible, IBAN masqué, montant
copiable, case « fait ») + rappel Telegram le 1er et le 5. Virement permanent côté
banque, l'app n'affiche que l'ajustement. Yann d'accord le 2026-09-05.
Abandonnés : simulateur garde (pas de garde actuellement), export (sans intérêt).

## D-007 — Découpage frontend en modules par responsabilité (2026-09-05)
Contexte : Lot A ajoute panneaux Charges/Comptes, bloc « à faire », ponctuels,
ajustements — `app.js` (211 lignes) aurait dépassé 400 lignes en un seul fichier.
Arbitrage : `api.js` (accès Supabase, aucune logique UI), `calc.js` (moteur pur,
inchangé dans son rôle), `ui-mois.js` (écran principal : revenus, charges par
catégorie, bloc à faire, ponctuels, ajustements), `ui-charges.js` (panneau gestion
charges), `ui-comptes.js` (panneau CRUD comptes), `app.js` (orchestrateur : routing,
auth, état partagé). Chaque module importe `etat` partagé depuis `app.js` plutôt que
de dupliquer les requêtes réseau.

## D-008 — package.json `"type": "module"` (2026-09-05)
`tests/test_calc.mjs` importait `calc.js` en ESM (`export`/`import`), mais
`package.json` déclarait `"type": "commonjs"` (bug préexistant, jamais exécuté
avec Node ≥ 22 qui applique strictement les extensions). Corrigé en `"module"` :
sans impact sur le navigateur (index.html charge déjà `app.js` en
`<script type="module">`, qui ignore package.json).

## D-009 — script `scripts/sql.py` générique, réutilisable pour toute migration (2026-09-05)
Sur le modèle de `provision.py::sql`, lit `.env` (SUPABASE_PAT, SUPABASE_REF) sans
jamais rien afficher, exécute un fichier .sql via la Management API. Complété par
`scripts/check_secrets.py` qui teste la PRÉSENCE d'une clé (jamais sa valeur) —
utilisé pour vérifier que les secrets Telegram sont absents avant de décider de ne
pas déployer l'Edge Function `rappel-virements`.

## D-010 — Rappel Telegram en chat privé avec Yann, déployé par script (2026-09-06)
Le bot BudgetCYM_bot parle à Yann en privé (pas de groupe créé). Claudia pourra être
ajoutée en créant un groupe et en relançant `scripts/deploy_rappel.py` après mise à jour
de MAXBUDGET_TELEGRAM_CHAT_ID. Planification pg_cron `0 7 1,5 * *` (UTC) par le script,
qui remplace la migration 003 manuelle. La fonction exige un JWT : un appel anonyme = 401.

## D-011 — Tâche planifiée MaxBudget-Bot : script livré, installation manuelle par Yann (2026-09-06)
Contexte : `Register-ScheduledTask` a renvoyé « Accès refusé » (HRESULT 0x80070005) dans
le shell de la session agent, non élevé (pas dans le groupe Administrators du token
courant). Un `New-ScheduledTaskPrincipal -LogonType Interactive` exige la création depuis
une session avec élévation UAC, que l'agent ne peut pas fournir. Arbitrage : livrer
`scripts/setup_task.ps1` (calqué sur MaxVoyage, idempotent) et `scripts/start_bot.ps1`
(boucle de relance + verrou anti-double-instance par PID, car pas de port à sonder comme
le serveur web MaxVoyage) tels quels, testés uniquement en foreground (`python
scripts/bot/bot.py` démarre, journalise, aucun secret). Yann doit lancer lui-même
`scripts\setup_task.ps1` en PowerShell administrateur une fois, puis
`Start-ScheduledTask -TaskName MaxBudget-Bot`.

## D-012 — Correctifs grammaire découverts en écrivant les tests (2026-09-06)
En écrivant les ≥15 cas de test de `commandes.py`, deux écarts trouvés par rapport au
brief (« août 2026 » sans « en », « rembours… » = positif) :
1. `RE_MOIS_NOM` exigeait `\ben (mois)` : « impots 345 aout 2026 » (sans « en ») ne
   matchait pas alors que le brief liste explicitement ce format. Corrigé en rendant
   « en » optionnel dans le regex.
2. Le mot-clé « rembours » servait à déterminer le signe (positif) mais restait dans le
   libellé passé au fuzzy match, faisant chuter le ratio sous le seuil 0,75 et renvoyant
   une ambiguïté au lieu d'écrire la charge. Corrigé en retirant « rembours\w* » du
   libellé avant le matching (le signe reste déterminé sur le texte d'origine).
Mnémonique : un cas du brief non testé littéralement (« août 2026 » vs « en août ») est un
bug qui dort.

## D-013 — MaxBudget supervisé par MaxOps, liens dans l'en-tête (2026-09-05)
Bloc MaxBudget ajouté à `../MaxOps/services.yaml` (process bot, tâche, API Telegram
avec garde anti-409, site Pages, fraîcheur log). Champ générique `links:` ajouté à
MaxOps (app.py + index.html) : site, GitHub, dashboard Supabase pour chaque projet.
MaxOps n'est pas un dépôt git : modifications non versionnées, documentées dans son README.

## D-014 — MaxOps : page en cartes KPI et sondage progressif (2026-09-05)
La page restait figée sur « Sondage… » : `/api/status` sondait tout d'un bloc en
~15 s (un process PowerShell par tâche planifiée, plus un aller-retour HTTPS vers
GitHub Pages). Découpé en `/api/projects` (inventaire, aucune sonde) puis
`/api/status/<projet>` appelé en parallèle : squelette immédiat, chaque carte se
remplit dès sa réponse. Rendu refait en cartes : verdict par projet, KPI « N / total »,
jauge une barre par sonde, liens, détail trié du plus grave au plus sain.
`/api/status` conservé pour le watchdog et le selftest.

## D-015 — refonte design : `mouvements` remplace `virements` (2026-09-06)
Le handoff design (inbox/design_handoff_maxbudget_refonte) demandait une check-list de
virements cochables, pas seulement les deux versements au commun. La table `virements`
(clé annee+mois+prenom) ne pouvait pas porter un mouvement quelconque : elle est remplacée
par un couple modèle/occurrence — `mouvements_recurrents` (défini une fois, mode
fixe/charge/part) et `mouvements` (une ligne par mois, générée à l'ouverture, `fait_le`
horodaté). Les deux versements au commun deviennent des récurrents `mode='part'`, ce qui
les rend modifiables comme les autres. Migration 005 additive : `virements` conservée
telle quelle, ses lignes recopiées ; elle sera retirée quand plus rien ne la lira.
Le montant d'un mouvement est recalculé à l'affichage tant qu'il n'est pas fait, puis figé
au moment de la coche — sinon un changement de charge réécrirait un virement déjà parti.

## D-016 — la règle de répartition devient surchargeable au mois (2026-09-06)
`lignes.regle` (nullable) surcharge `charges.regle` pour un mois donné ; `calculer()` lit
`ligne.regle ?? charge.regle`. Motif : certains mois demandent un partage différent sans
changer le réglage permanent de la charge. `calc.js` accepte les deux formes de dictionnaire
`lignes` (nombre nu ou objet `{montant_centimes, regle}`) pour ne pas casser `calc_cli.mjs`
ni les tests existants — équivalence vérifiée par un test dédié.

## D-017 — le rappel replie sur les récurrents quand le mois est vierge (2026-09-06)
L'Edge Function lit les `mouvements` en base, or ceux-ci ne sont créés qu'à l'ouverture du
mois dans l'app. Le rappel du 1er tombe précisément avant cette ouverture : il aurait
annoncé « aucun mouvement à faire » alors qu'il y en a. Elle liste donc les récurrents
actifs (titre, jour, qui) sans montant, celui-ci dépendant des charges du mois pas encore
saisies. Le bot, lui, génère les occurrences manquantes (scripts/bot/mouvements.py) parce
qu'il écrit ; la fonction de rappel ne fait que lire et n'a pas à créer de lignes.

## D-018 — MaxBudget devient MaxHome, suite mono-dépôt et mono-foyer (2026-09-06)
Le produit s'élargit au foyer entier (Budget, Tâches, bientôt Courses). Un seul dépôt, un
seul site, un seul projet Supabase, une seule Auth : les modules sont des écrans de la même
app, `membres`, la RLS `est_membre()` et le bot restent partagés. Renommage fait partout où
le nom est vivant (dépôt GitHub → Pages sur /MaxHome/, projet Supabase `maxhome`, secrets
`MAXHOME_TELEGRAM_*`, tâche planifiée `MaxHome-Bot`, MaxOps) ; le dossier local, le handle
`@BudgetCYM_bot` et les archives mémoire gardent l'ancien nom. Pas de `foyer_id` tant qu'un
seul couple utilise l'app : passer multi-foyer sera une migration additive, pas une refonte.
Les écrans s'assemblent à partir de blocs partagés (`frontend/blocs.js` : ligne cochable,
carte-liste, chiffres, ligne de réglage, panneau) plutôt que redessinés par module.

## D-019 — module Tâches : points = pénibilité, importance = ordre (2026-09-06)
Même patron que les mouvements : `taches_recurrentes` (modèle) génèrent des `taches`
(occurrences datées par période : le jour, le dimanche, le dernier du mois). Les points
d'une tâche faite sont sa pénibilité (la contrainte), figés à la coche ; l'importance ne
rapporte rien, elle trie la liste — sinon on récompense l'urgence, pas l'effort. Une
occurrence non faite dont la période est finie depuis plus d'un jour est purgée : on ne
rattrape pas un biberon d'avant-hier, et la liste « en retard » ne s'empile pas. Les tâches
« au besoin » (poubelle, verre) ne se génèrent pas : un geste les crée déjà faites.
