-- MaxHome — module Courses (Lot 2). Additif, idempotent.
-- Une seule liste commune. Pas de modèle/occurrence ici : un article est ajouté, coché, puis
-- vidé — le cycle est trop court pour justifier un récurrent (contrairement aux tâches).

create table if not exists courses (
  id bigint generated always as identity primary key,
  libelle text not null,
  quantite text,                                   -- texte libre : « 2 », « 1 kg », « une plaquette »
  rayon text not null default 'Autre',
  ajoute_par text references membres(prenom),
  ajoute_le timestamptz not null default now(),
  coche_le timestamptz,                            -- coché dans le magasin
  coche_par text references membres(prenom)
);
create index if not exists courses_coche_le on courses (coche_le);

-- Rayons proposés : ordre de parcours d'un magasin, pas alphabétique.
create table if not exists courses_rayons (
  nom text primary key,
  ordre int not null default 0
);
insert into courses_rayons (nom, ordre)
select * from (values
  ('Fruits et légumes', 10), ('Boucherie', 20), ('Crèmerie', 30), ('Épicerie', 40),
  ('Surgelés', 50), ('Boissons', 60), ('Entretien', 70), ('Bébé', 80), ('Autre', 99)
) as v(nom, ordre)
on conflict (nom) do nothing;

-- ---------- RLS ----------
alter table courses        enable row level security;
alter table courses_rayons enable row level security;
drop policy if exists courses_rw        on courses;
drop policy if exists courses_rayons_rw on courses_rayons;
create policy courses_rw        on courses        for all using (est_membre()) with check (est_membre());
create policy courses_rayons_rw on courses_rayons for all using (est_membre()) with check (est_membre());

select (select count(*) from courses_rayons) as rayons, (select count(*) from courses) as articles;
