-- Date du dernier achat d'un classique (aide à la saisie : « les derniers aliments »).
-- Additif, idempotent.
--
-- Pourquoi : la ligne d'ajout de l'écran Courses propose désormais, pendant qu'on tape, les
-- articles déjà achetés — les plus récents d'abord. `courses_classiques` ne portait qu'une
-- fréquence (`fois`) : elle dit « souvent », pas « récemment ». `dernier_le` est posé à
-- chaque « Vider le panier » (le seul geste qui alimente les classiques, api.js).
--
-- Reprise des lignes existantes : `default now()` les date toutes de cette migration. On ne
-- connaît pas leur vraie date (jamais tracée) ; toutes égales, elles se départagent par `fois`,
-- ce que la fonction de suggestion fait déjà — pas de fausse précision.
alter table courses_classiques add column if not exists dernier_le timestamptz not null default now();

select count(*) as classiques, count(dernier_le) as dates from courses_classiques;
