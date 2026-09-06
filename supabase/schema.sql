-- MaxHome — schéma V0. À exécuter dans Supabase > SQL Editor.
-- Montants en centimes (integer). Aucun float pour de l'argent.

create table if not exists membres (
  prenom text primary key,
  email  text not null unique,
  ordre  int  not null default 0
);

create table if not exists charges (
  id      bigint generated always as identity primary key,
  libelle text not null,
  type    text not null check (type in ('egales','proport')),
  ordre   int  not null default 0,
  actif   boolean not null default true
);

create table if not exists revenus (
  annee   int  not null,
  mois    int  not null check (mois between 1 and 12),
  prenom  text not null references membres(prenom),
  montant_centimes int not null default 0,
  primary key (annee, mois, prenom)
);

create table if not exists lignes (
  annee     int not null,
  mois      int not null check (mois between 1 and 12),
  charge_id bigint not null references charges(id),
  montant_centimes int not null default 0,   -- négatif = dépense, positif = remboursement (CAF)
  primary key (annee, mois, charge_id)
);

-- RLS : seuls les comptes dont l'email est dans membres voient et écrivent.
create or replace function est_membre() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membres where email = auth.jwt() ->> 'email');
$$;

alter table membres enable row level security;
alter table charges enable row level security;
alter table revenus enable row level security;
alter table lignes  enable row level security;

drop policy if exists membres_rw on membres;
drop policy if exists charges_rw on charges;
drop policy if exists revenus_rw on revenus;
drop policy if exists lignes_rw  on lignes;
create policy membres_rw on membres for select using (est_membre());
create policy charges_rw on charges for all using (est_membre()) with check (est_membre());
create policy revenus_rw on revenus for all using (est_membre()) with check (est_membre());
create policy lignes_rw  on lignes  for all using (est_membre()) with check (est_membre());

-- Membres : remplacer les emails avant d'exécuter.
insert into membres (prenom, email, ordre) values
  ('Yann',    'EMAIL_YANN',    1),
  ('Claudia', 'EMAIL_CLAUDIA', 2)
on conflict (prenom) do update set email = excluded.email;
