-- L'IBAN complet du compte, pour savoir où on envoie (utile pour les comptes externes).
-- Additif, idempotent.
--
-- Pourquoi : jusqu'ici seuls les 4 derniers chiffres (iban_masque) étaient stockés, par
-- prudence. Yann : « ça m'arrangerait de savoir où on envoie ». La policy comptes_rw (RLS,
-- 002_lot_a.sql) porte sur la ligne entière (using/with check sur est_membre()), donc les
-- nouvelles colonnes sont déjà couvertes — pas de policy à ajouter. iban_masque reste (lu par
-- ui-mouvements.js pour le détail d'un mouvement).
alter table comptes add column if not exists iban text;
alter table comptes add column if not exists bic text;
