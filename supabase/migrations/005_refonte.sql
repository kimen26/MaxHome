-- Refonte design — migration additive. Ne dropper ni ne réécrire aucune ligne existante.
-- Exécuter via : python scripts/sql.py supabase/migrations/005_refonte.sql

-- ---------- lignes : règle du mois (null = règle par défaut de la charge) ----------
alter table lignes add column if not exists regle text
  check (regle is null or regle in ('egales','proport','cle','perso'));

-- ---------- charges : montant préaffiché ----------
alter table charges add column if not exists montant_defaut int;
alter table charges add column if not exists defaut_dernier boolean not null default true;

-- ---------- mouvements récurrents : le modèle, défini une fois ----------
create table if not exists mouvements_recurrents (
  id bigint generated always as identity primary key,
  titre text not null,
  compte_de   bigint references comptes(id),
  compte_vers bigint references comptes(id),
  mode text not null default 'fixe' check (mode in ('fixe','charge','part')),
  montant_centimes int,                                  -- mode 'fixe'
  charge_id bigint references charges(id),               -- mode 'charge'
  prenom_part text references membres(prenom),           -- mode 'part'
  qui text references membres(prenom),
  jour int check (jour is null or jour between 1 and 31),
  consigne text,
  ordre int not null default 0,
  actif boolean not null default true
);

-- ---------- mouvements : l'occurrence d'un mois ----------
create table if not exists mouvements (
  id bigint generated always as identity primary key,
  annee int not null,
  mois  int not null check (mois between 1 and 12),
  recurrent_id bigint references mouvements_recurrents(id) on delete set null,
  titre text not null,
  compte_de   bigint references comptes(id),
  compte_vers bigint references comptes(id),
  montant_centimes int not null default 0,   -- figé au moment où fait_le est renseigné
  qui text references membres(prenom),
  consigne text,                             -- surcharge de la consigne du récurrent
  fait_le timestamptz
);
create unique index if not exists mouvements_recurrent_mois
  on mouvements (annee, mois, recurrent_id) where recurrent_id is not null;
create index if not exists mouvements_mois on mouvements (annee, mois);

-- ---------- reprise des virements existants ----------
-- Un récurrent « calculé » par membre : le virement au compte commun.
insert into mouvements_recurrents (titre, compte_vers, mode, prenom_part, qui, jour, ordre)
select 'Virement au commun — ' || m.prenom,
       (select id from comptes where commun order by id limit 1),
       'part', m.prenom, m.prenom, 5, m.ordre
from membres m
where not exists (
  select 1 from mouvements_recurrents r where r.mode = 'part' and r.prenom_part = m.prenom
);

-- Les virements déjà saisis deviennent des occurrences (montant et fait_le conservés).
insert into mouvements (annee, mois, recurrent_id, titre, compte_vers, montant_centimes, qui, fait_le)
select v.annee, v.mois, r.id, r.titre, r.compte_vers, v.montant_centimes, v.prenom, v.fait_le
from virements v
join mouvements_recurrents r on r.mode = 'part' and r.prenom_part = v.prenom
on conflict (annee, mois, recurrent_id) where recurrent_id is not null do nothing;

-- ---------- RLS ----------
alter table mouvements_recurrents enable row level security;
alter table mouvements            enable row level security;

drop policy if exists mouvements_recurrents_rw on mouvements_recurrents;
drop policy if exists mouvements_rw            on mouvements;
create policy mouvements_recurrents_rw on mouvements_recurrents for all using (est_membre()) with check (est_membre());
create policy mouvements_rw            on mouvements            for all using (est_membre()) with check (est_membre());
