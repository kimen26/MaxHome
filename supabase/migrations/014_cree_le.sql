-- Date d'ajout d'un travail Todo (maquette, feuille « Travaux en attente », §8 du handoff).
-- Additif, idempotent.
--
-- Pourquoi : la méta de la feuille Todo doit dire « ajouté il y a 12 j · 45 min », mais aucune
-- colonne ne portait la date de création d'une tâche récurrente (brief refonte-fidélité,
-- §« ce que le modèle ne portait pas »). `cree_le` est ajoutée sur `taches_recurrentes` (le
-- travail « au besoin » du Todo EST un récurrent, cf. ui-taches-ajout.js) — jamais sur
-- `taches`, qui n'a pas de rôle dans cet écran.
--
-- Stratégie de reprise pour les lignes déjà en base, honnête plutôt que fausse précision :
-- `default now()` peuple déjà `cree_le` à l'instant de cette migration pour TOUTES les lignes
-- existantes (comportement Postgres standard pour un ajout de colonne avec défaut) — ce qui
-- dirait « ajouté aujourd'hui » à des travaux en attente depuis des semaines, un mensonge pire
-- que l'absence de méta. On ne prétend pas connaître leur vraie date de création (jamais
-- tracée) : on retombe sur l'échéance de leur plus ancienne occurrence connue quand il y en a
-- une (signe qu'un jour la tâche a existé), sinon on laisse `now()` — un travail « au besoin »
-- qui n'a jamais eu d'occurrence est, de fait, tout juste réglé.
alter table taches_recurrentes add column if not exists cree_le timestamptz not null default now();

update taches_recurrentes r set cree_le = plus_ancienne.echeance::timestamptz
from (
  select recurrent_id, min(echeance) as echeance
  from taches
  where recurrent_id is not null
  group by recurrent_id
) as plus_ancienne
where r.id = plus_ancienne.recurrent_id
  -- Ne retouche que les lignes que CETTE migration vient de peupler par défaut (cf. commentaire
  -- ci-dessus) : une ligne créée après coup, à sa vraie date, n'est jamais réécrite ici.
  and r.cree_le::date = now()::date
  and plus_ancienne.echeance::timestamptz < r.cree_le;
