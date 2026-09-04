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
