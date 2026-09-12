-- MaxHome — module Tâches (Lot 1) : les parts remplacent la pénibilité. Additif, idempotent.
-- Pourquoi : une échelle 0,5·1·2·3·5·8 choisie à la main, stockée en quarts (entiers, comme les
-- centimes) remplace la pénibilité 1-5 et son plancher à 1 point. « obligatoire » devient un axe
-- séparé (ne rapporte rien, sert au tri et à un KPI dédié). « Fait à deux » divise les parts, sans
-- jamais les multiplier — cf. docs/briefs/maxhome-parts.md et inbox/.../logique-metier.md.
-- penibilite et importance restent en base sans usage : retrait dans une migration ultérieure,
-- une fois le barème validé à l'usage (pas de recalcul de l'historique).

alter table taches_recurrentes add column if not exists parts_quart int not null default 4
  check (parts_quart in (2, 4, 8, 12, 20, 32));
alter table taches_recurrentes add column if not exists obligatoire boolean not null default false;
alter table taches_recurrentes add column if not exists partageable boolean not null default false;
alter table taches_recurrentes add column if not exists ecart_prenom text references membres(prenom);
alter table taches_recurrentes add column if not exists minutes int;   -- repère affiché, hors calcul

alter table taches add column if not exists qui2 text references membres(prenom);
alter table taches add column if not exists parts_quart int not null default 0;  -- figé à la coche

-- add constraint n'a pas de "if not exists" : on retire puis on repose, idempotent par construction.
alter table taches drop constraint if exists taches_deux_personnes_distinctes;
alter table taches add constraint taches_deux_personnes_distinctes
  check (qui2 is null or (qui is not null and qui2 <> qui));

-- ---------- reprise de l'existant ----------
-- pénibilité 1..5 -> cran d'échelle (en quarts) ; obligatoire = l'ancienne importance "Le jour même".
--
-- Idempotence : on ne peut pas se fier à « parts_quart = 4 » pour savoir si la reprise a déjà eu
-- lieu — 4 est à la fois la valeur par défaut ET la valeur légitime d'une pénibilité 1. Rejouer
-- la migration sur ce critère écraserait le réglage manuel de toutes les tâches réglées à 1 part,
-- et rétablirait des drapeaux que Claudia ou Yann auraient retirés depuis. Une colonne témoin
-- marque la reprise ; elle est posée À LA FIN, une fois les trois `update` passés, et tous
-- gardent sur `not parts_reprises`. Le drapeau se retire à la main pour rejouer volontairement.
alter table taches_recurrentes add column if not exists parts_reprises boolean not null default false;

update taches_recurrentes set
  parts_quart = case penibilite
    when 1 then 4 when 2 then 8 when 3 then 12 when 4 then 20 else 32
  end,
  obligatoire = (importance = 3)
where not parts_reprises;

-- occurrences déjà cochées : les points figés deviennent des parts figées (1 point = 1 part = 4 quarts).
update taches set parts_quart = points * 4 where parts_quart = 0;

-- ---------- tâches obligatoires de départ (logique-metier.md §3) ----------
-- Rapprochement des titres du handoff avec les 15 titres réels de 006_taches.sql (vocabulaire
-- différent, ex. "bain" -> "Bain du petit"). "biberon" et "relaver le biberon" n'ont qu'un seul
-- titre correspondant en base ("Laver les biberons") : les deux gestes du handoff sont couverts
-- par cette unique tâche récurrente. Aucune tâche de départ ne correspond à "petit déj Max",
-- "habiller Max", "dents Max" ou "préparer le lait" : elles n'existent pas encore en base, donc
-- rien à marquer (voir le rapport de l'agent pour le détail).
update taches_recurrentes set obligatoire = true
where not parts_reprises and titre in (
  'Laver les biberons',            -- biberon + relaver le biberon
  'Déposer le petit',              -- dépose école
  'Aller chercher le petit',       -- chercher le petit
  'Bain du petit',                 -- bain
  'Faire à manger',
  'Courses',
  'Lancer une machine',            -- lessive
  'Sortir la poubelle'             -- poubelle
);

-- ---------- tâches partageables de départ (logique-metier.md §4) ----------
-- "draps", "vitres", "monter l'étagère", "trier le garage", "accrocher les cadres" n'ont pas de
-- titre correspondant parmi les 15 tâches de départ : rien à marquer pour elles non plus.
update taches_recurrentes set partageable = true
where not parts_reprises and titre in (
  'Bain du petit',                 -- bain
  'Faire à manger',
  'Courses'
);

-- Reprise terminée : le témoin est posé en dernier, donc les trois `update` ci-dessus ont
-- tous vu « not parts_reprises ». Une relance de la migration ne touchera plus aucune ligne.
update taches_recurrentes set parts_reprises = true where not parts_reprises;

-- ---------- contrôle final (patron 006/007) ----------
select
  (select count(*) from taches_recurrentes) as recurrentes,
  (select count(*) from taches) as taches,
  (select count(*) from taches_recurrentes where obligatoire) as recurrentes_obligatoires,
  (select count(*) from taches_recurrentes where partageable) as recurrentes_partageables,
  (select count(*) from taches_recurrentes where parts_quart not in (2,4,8,12,20,32)) as parts_invalides;
