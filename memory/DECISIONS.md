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
