-- Garder le lien avec nos proches (brief garder-le-lien.md, lot 2). Additif, idempotent, sans
-- aucun drop (L-056) : tables, index et politiques se créent si absents.
--
-- `proches` : une ligne par personne à qui l'on veut écrire de temps en temps. `qui` dit lequel
-- de nous deux relance ; `rythme_jours` null = pas de relance. Ni prénom ni note ne vivent dans le
-- dépôt : ils n'existent qu'ici (invariant 1). `proche_echanges` : ce qu'on s'est dit, une phrase.

create table if not exists proches (
  id            bigint generated always as identity primary key,
  prenom        text not null check (char_length(prenom) between 1 and 60),
  qui           text not null default 'nous' check (qui in ('Yann', 'Claudia', 'nous')),
  rythme_jours  integer check (rythme_jours is null or rythme_jours between 1 and 3650),
  anniv_jour    integer check (anniv_jour is null or anniv_jour between 1 and 31),
  anniv_mois    integer check (anniv_mois is null or anniv_mois between 1 and 12),
  anniv_annee   integer check (anniv_annee is null or anniv_annee between 1900 and 2100),
  note          text check (note is null or char_length(note) <= 500),
  actif         boolean not null default true,
  cree_le       date not null default current_date,
  -- Un anniversaire se donne en entier (jour ET mois) ; l'année seule n'a aucun sens.
  check ((anniv_jour is null) = (anniv_mois is null)),
  check (anniv_annee is null or anniv_jour is not null)
);

-- Un prénom une seule fois, sans tenir compte de la casse.
create unique index if not exists proches_prenom_unique on proches (lower(prenom));

create table if not exists proche_echanges (
  id         bigint generated always as identity primary key,
  proche_id  bigint not null references proches(id) on delete cascade,
  le         date not null default current_date,
  texte      text not null check (char_length(texte) between 1 and 500),
  par        text,
  cree_le    timestamptz not null default now()
);

create index if not exists proche_echanges_proche on proche_echanges (proche_id, le desc);

alter table proches         enable row level security;
alter table proche_echanges enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'proches' and policyname = 'proches_rw') then
    create policy proches_rw on proches for all using (est_membre()) with check (est_membre());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'proche_echanges' and policyname = 'proche_echanges_rw') then
    create policy proche_echanges_rw on proche_echanges for all using (est_membre()) with check (est_membre());
  end if;
end $$;
