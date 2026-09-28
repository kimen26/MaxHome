-- MaxHome — Tâches : le temps fait les parts, créneaux, étapes, variantes (D-041). Additif, idempotent.
--
-- 1. 1 part = 5 minutes, 0,5 part sous 3 minutes. `minutes` devient la SOURCE ; `parts_quart`
--    reste la valeur figée à la coche et lue partout (bot, rappel, balance), recalculée à
--    l'enregistrement. L'échelle 0,5·1·2·3·5·8 n'est plus une contrainte : on retire le check.
-- 2. Créneaux (tâche quotidienne) : [{"moment": "matin|midi|soir|nuit", "jours": "tous|semaine|we"}].
--    Une occurrence par créneau actif ce jour-là ; son moment est écrit sur l'occurrence
--    (`taches.moment`), c'est lui que lisent l'écran Jour, le bot et le rappel.
-- 3. Étapes : une tâche peut en regrouper d'autres (`parent_id`). Le parent ne crée aucune
--    occurrence, ses étapes suivent son rythme ; une étape `facultatif` n'en crée pas non plus
--    (on l'ajoute quand elle a eu lieu : la vaisselle à la main).
-- 4. Variantes : [{"nom": "Réchauffer", "minutes": 5}, …] — on choisit à la coche, les parts
--    suivent (`taches.variante`).
-- 5. Répétable : la tâche peut se refaire au-delà du prévu dans sa période (un biberon de plus
--    après la sieste, des courses en plus) — chaque fois en plus est une occurrence de plus.

alter table taches_recurrentes drop constraint if exists taches_recurrentes_parts_quart_check;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'taches_recurrentes_parts_quart_positif') then
    alter table taches_recurrentes add constraint taches_recurrentes_parts_quart_positif check (parts_quart > 0);
  end if;
end $$;

alter table taches_recurrentes add column if not exists creneaux jsonb;
alter table taches_recurrentes add column if not exists parent_id bigint references taches_recurrentes(id) on delete set null;
alter table taches_recurrentes add column if not exists facultatif boolean not null default false;
alter table taches_recurrentes add column if not exists variantes jsonb;

alter table taches_recurrentes add column if not exists repetable boolean not null default false;

alter table taches add column if not exists moment text;
alter table taches add column if not exists variante text;

select
  (select count(*) from taches_recurrentes where creneaux is not null) as avec_creneaux,
  (select count(*) from taches_recurrentes where parent_id is not null) as etapes;
