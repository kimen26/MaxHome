-- MaxHome — module Courses : cartographie du magasin + Repas (Lot 5). Additif, idempotent.
-- Source : inbox/design_handoff_maxhome_taches/logique-metier.md §6 et §7.
--
-- Reséquence courses_rayons selon le parcours réel du magasin (plus l'alphabet), remappe
-- courses.rayon en conséquence (rayon est un text libre, sans FK vers courses_rayons.nom —
-- remapper ne casse aucune intégrité référentielle, mais un article laissé sur un ancien
-- libellé disparaît de l'écran : celui-ci n'affiche que les rayons connus de courses_rayons).
-- Ajoute repas / repas_ingredients / courses_classiques.

-- ---------- 1. Nouveaux groupes du parcours (ordre 10 à 99) ----------
insert into courses_rayons (nom, ordre)
select * from (values
  ('Beauté, SDB, bébé',        10),
  ('Vêtements, livres, jeux',  20),
  ('Papier et lavage',         30),
  ('Fruits et légumes',        40),
  ('Frais, jus, yaourts',      50),
  ('Surgelés',                 60),
  ('Épices et grignotage',     70),
  ('Épicerie, alcool, lait',   80),
  ('Boucherie',                90),
  ('Autre',                    99)
) as v(nom, ordre)
on conflict (nom) do update set ordre = excluded.ordre;

-- ---------- 2. Remap des articles existants (courses.rayon) ----------
-- Correspondance directe (§6) : un ancien rayon → un seul nouveau, pas d'ambiguïté.
update courses set rayon = 'Beauté, SDB, bébé'      where rayon = 'Bébé';
update courses set rayon = 'Papier et lavage'       where rayon = 'Entretien';
-- Fruits et légumes, Surgelés, Boucherie, Autre : libellés inchangés, rien à faire.

-- Crèmerie, Boissons et Épicerie se scindent en DEUX destinations selon le produit
-- (yaourts/beurre/fromage vs lait/œufs ; jus vs eau/bière ; générique vs café/apéro/gâteaux).
-- Le nom du rayon ne dit pas le produit, et deviner depuis le libellé de l'article serait
-- fragile : on ne tranche donc pas à la place de l'utilisateur.
-- Règle retenue : router vers « Épicerie, alcool, lait », qui contient la composante commune
-- aux trois anciens rayons (épicerie sèche, lait, boissons) et qui reste dans la seconde
-- moitié du parcours comme eux. Un article mal rangé se corrige d'un tap dans l'app ;
-- 007_courses.sql ne seedait aucun article, donc seuls les articles réellement saisis par
-- Claudia et Yann sont concernés — un volume faible, et tous visibles dans la liste.
update courses set rayon = 'Épicerie, alcool, lait' where rayon in ('Crèmerie', 'Boissons', 'Épicerie');
-- « Épices et grignotage » et « Frais, jus, yaourts » ne reçoivent rien automatiquement :
-- aucun ancien rayon ne leur correspond sans connaître le produit. Ils se remplissent à l'usage.

-- ---------- 3. Anciens groupes retirés (remplacés par les nouveaux du parcours) ----------
-- Ne retirer qu'après le remap ci-dessus : plus aucun article ne les référence.
delete from courses_rayons where nom in ('Bébé', 'Entretien', 'Crèmerie', 'Boissons', 'Épicerie');

-- ---------- 4. Repas ----------
create table if not exists repas (
  id bigint generated always as identity primary key,
  titre text not null,
  detail text,                      -- « 2 dîners · four »
  actif boolean not null default true,
  ordre int not null default 0
);
create table if not exists repas_ingredients (
  id bigint generated always as identity primary key,
  repas_id bigint not null references repas(id) on delete cascade,
  libelle text not null,
  quantite text,
  rayon text not null default 'Autre' references courses_rayons(nom) on update cascade
);
create index if not exists repas_ingredients_repas_id on repas_ingredients (repas_id);

-- Propositions de départ (génériques), idempotent : rien si repas contient déjà des lignes.
insert into repas (titre, detail, ordre)
select * from (values
  ('Poulet-légumes rôtis',   '2 dîners · four',    10),
  ('Saumon, riz, brocolis',  '2 dîners · plaque',  20),
  ('Dahl de lentilles',      '2 dîners · casserole', 30)
) as v(titre, detail, ordre)
where not exists (select 1 from repas);

insert into repas_ingredients (repas_id, libelle, quantite, rayon)
select r.id, v.libelle, v.quantite, v.rayon
from (values
  ('Poulet-légumes rôtis',  'Poulet',            null,      'Boucherie'),
  ('Poulet-légumes rôtis',  'Courgettes',        '3',       'Fruits et légumes'),
  ('Poulet-légumes rôtis',  'Patates douces',    '1 kg',    'Fruits et légumes'),
  ('Saumon, riz, brocolis', 'Pavés de saumon',   '4',       'Boucherie'),
  ('Saumon, riz, brocolis', 'Riz basmati',       '1 kg',    'Épicerie, alcool, lait'),
  ('Saumon, riz, brocolis', 'Brocolis',          '2',       'Fruits et légumes'),
  ('Dahl de lentilles',     'Lentilles corail',  '500 g',   'Épicerie, alcool, lait'),
  ('Dahl de lentilles',     'Lait de coco',      '2',       'Épicerie, alcool, lait'),
  ('Dahl de lentilles',     'Épinards',          null,      'Fruits et légumes')
) as v(repas_titre, libelle, quantite, rayon)
join repas r on r.titre = v.repas_titre
where not exists (
  select 1 from repas_ingredients ri
  where ri.repas_id = r.id and ri.libelle = v.libelle
);

-- ---------- 5. Classiques (achats fréquents, alimentés depuis « Vider le panier ») ----------
create table if not exists courses_classiques (
  libelle text primary key,
  quantite text,
  rayon text not null default 'Autre' references courses_rayons(nom) on update cascade,
  fois int not null default 1
);

-- ---------- RLS ----------
alter table repas               enable row level security;
alter table repas_ingredients   enable row level security;
alter table courses_classiques  enable row level security;
drop policy if exists repas_rw              on repas;
drop policy if exists repas_ingredients_rw  on repas_ingredients;
drop policy if exists courses_classiques_rw on courses_classiques;
create policy repas_rw              on repas              for all using (est_membre()) with check (est_membre());
create policy repas_ingredients_rw  on repas_ingredients  for all using (est_membre()) with check (est_membre());
create policy courses_classiques_rw on courses_classiques for all using (est_membre()) with check (est_membre());

-- ---------- contrôle final ----------
select
  (select count(*) from courses_rayons)       as rayons,
  (select count(*) from courses)              as articles,
  (select count(*) from repas)                as repas,
  (select count(*) from repas_ingredients)    as repas_ingredients,
  (select count(*) from courses_classiques)   as classiques;
