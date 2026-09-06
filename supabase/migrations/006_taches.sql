-- MaxHome — module Tâches (Lot 1). Additif, idempotent.
-- Même patron que les mouvements (D-015) : un modèle défini une fois (taches_recurrentes),
-- des occurrences datées (taches) cochées avec fait_le. Les points se figent à la coche.

create table if not exists taches_recurrentes (
  id bigint generated always as identity primary key,
  titre text not null,
  categorie text not null default 'Maison',
  frequence text not null default 'quotidien'
    check (frequence in ('quotidien', 'hebdo', 'mensuel', 'au_besoin')),
  fois int not null default 1 check (fois between 1 and 10),           -- occurrences par période
  penibilite int not null default 2 check (penibilite between 1 and 5), -- la contrainte : donne les points
  importance int not null default 2 check (importance between 1 and 3), -- peut-elle attendre ? trie la liste
  attribue_a text references membres(prenom),                           -- qui s'en occupe d'habitude
  consigne text,
  ordre int not null default 0,
  actif boolean not null default true
);

create table if not exists taches (
  id bigint generated always as identity primary key,
  recurrent_id bigint references taches_recurrentes(id) on delete set null,
  titre text not null,
  categorie text not null default 'Maison',
  echeance date not null,                  -- fin de la période : le jour, le dimanche, le dernier du mois
  rang int not null default 1,             -- n-ième occurrence de la période (biberon : 2 par jour)
  qui text references membres(prenom),
  fait_le timestamptz,
  points int not null default 0            -- figés à la coche (pénibilité du moment)
);
create unique index if not exists taches_recurrent_echeance
  on taches (recurrent_id, echeance, rang) where recurrent_id is not null;
create index if not exists taches_echeance on taches (echeance);
create index if not exists taches_fait_le on taches (fait_le);

-- ---------- tâches de départ (génériques, modifiables) ----------
insert into taches_recurrentes (titre, categorie, frequence, fois, penibilite, importance, ordre)
select * from (values
  ('Laver les biberons',             'Enfant',  'quotidien', 2, 1, 3, 10),
  ('Bain du petit',                  'Enfant',  'quotidien', 1, 2, 2, 11),
  ('Déposer le petit',               'Enfant',  'quotidien', 1, 2, 3, 12),
  ('Aller chercher le petit',        'Enfant',  'quotidien', 1, 2, 3, 13),
  ('Faire à manger',                 'Cuisine', 'quotidien', 2, 3, 3, 20),
  ('Mettre et débarrasser la table', 'Cuisine', 'quotidien', 2, 1, 2, 21),
  ('Vaisselle',                      'Cuisine', 'quotidien', 1, 2, 2, 22),
  ('Ranger la vaisselle',            'Cuisine', 'quotidien', 1, 1, 1, 23),
  ('Lancer une machine',             'Linge',   'hebdo',     3, 1, 2, 30),
  ('Étendre et plier le linge',      'Linge',   'hebdo',     3, 4, 2, 31),
  ('Courses',                        'Courses', 'hebdo',     1, 3, 3, 40),
  ('Aspirateur et sols',             'Ménage',  'hebdo',     1, 3, 2, 50),
  ('Salle de bain',                  'Ménage',  'hebdo',     1, 4, 1, 51),
  ('Sortir la poubelle',             'Déchets', 'au_besoin', 1, 3, 2, 60),
  ('Sortir le verre',                'Déchets', 'au_besoin', 1, 3, 1, 61)
) as v(titre, categorie, frequence, fois, penibilite, importance, ordre)
where not exists (select 1 from taches_recurrentes);

-- ---------- RLS ----------
alter table taches_recurrentes enable row level security;
alter table taches             enable row level security;
drop policy if exists taches_recurrentes_rw on taches_recurrentes;
drop policy if exists taches_rw             on taches;
create policy taches_recurrentes_rw on taches_recurrentes for all using (est_membre()) with check (est_membre());
create policy taches_rw             on taches             for all using (est_membre()) with check (est_membre());

select (select count(*) from taches_recurrentes) as recurrentes, (select count(*) from taches) as taches;
