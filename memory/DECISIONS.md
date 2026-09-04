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
