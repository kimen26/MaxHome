-- Lot A — migration additive. Ne dropper ni ne réécrire aucune ligne existante.
-- Exécuter via : python scripts/sql.py supabase/migrations/002_lot_a.sql

-- ---------- charges : nouvelles colonnes ----------
alter table charges add column if not exists categorie text not null default 'Autre'
  check (categorie in ('Logement','Max','Épargne','Alimentation','Impôts','Banque','Autre'));
alter table charges add column if not exists regle text not null default 'egales'
  check (regle in ('egales','proport','cle','perso'));
alter table charges add column if not exists cle_pct int;
alter table charges add column if not exists payeur text references membres(prenom);
alter table charges add column if not exists ponctuel boolean not null default false;

-- Remplir regle depuis type (type reste en lecture seule, jamais dropé).
update charges set regle = type where type in ('egales','proport');

-- Catégorisation des 16 charges existantes (par libellé).
update charges set categorie = 'Logement' where libelle in
  ('Crédit Immobiliaire','Charges Feuillantines','Taxe foncière','BPCE Assurances','TOTAL Electricité');
update charges set categorie = 'Max' where libelle in
  ('Crèche Max','Crèche CAF','Ecole','Livret Max');
update charges set categorie = 'Épargne' where libelle in
  ('PEL','LDD Solidaire','Livret Vacances');
update charges set categorie = 'Alimentation' where libelle = 'Alimentation';
update charges set categorie = 'Impôts' where libelle = 'Impots';
update charges set categorie = 'Banque' where libelle = 'Frais bancaires';
update charges set categorie = 'Autre' where libelle = 'Extras';

-- ---------- ajustements ----------
create table if not exists ajustements (
  id bigint generated always as identity primary key,
  annee int not null,
  mois  int not null check (mois between 1 and 12),
  de    text not null references membres(prenom),
  vers  text not null references membres(prenom),
  montant_centimes int not null,
  motif text
);

-- ---------- comptes ----------
create table if not exists comptes (
  id bigint generated always as identity primary key,
  nom text not null,
  titulaire text,
  iban_masque text,   -- 4 derniers chiffres seulement, jamais l'IBAN complet
  note text,
  commun boolean not null default false
);

-- ---------- virements ----------
create table if not exists virements (
  annee int not null,
  mois  int not null check (mois between 1 and 12),
  prenom text not null references membres(prenom),
  montant_centimes int not null,
  fait_le timestamptz,
  primary key (annee, mois, prenom)
);

-- ---------- RLS (même politique que les tables existantes) ----------
alter table ajustements enable row level security;
alter table comptes     enable row level security;
alter table virements   enable row level security;

drop policy if exists ajustements_rw on ajustements;
drop policy if exists comptes_rw     on comptes;
drop policy if exists virements_rw   on virements;
create policy ajustements_rw on ajustements for all using (est_membre()) with check (est_membre());
create policy comptes_rw     on comptes     for all using (est_membre()) with check (est_membre());
create policy virements_rw   on virements   for all using (est_membre()) with check (est_membre());
