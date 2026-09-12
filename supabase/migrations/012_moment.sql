-- MaxHome — module Tâches : le moment Matin / Soir. Additif, idempotent.
-- Pourquoi : la maquette (design_handoff_maxhome_taches, écran Jour) affiche deux cartes côte à
-- côte « Matin » et « Soir » à la place d'une carte unique « Aujourd'hui ». Aucune colonne ne
-- portait ce moment (006_taches.sql, 008_parts.sql, 010_taches_handoff.sql) : on l'ajoute sur la
-- tâche récurrente, pas sur l'occurrence — le moment d'une routine (« habiller l'enfant ») ne change
-- pas d'un jour à l'autre, comme sa fréquence ou son obligation.
--
-- Nullable à dessein : une tâche hebdo/mensuelle/au besoin n'a pas de moment (les cartes Matin/
-- Soir ne concernent que le quotidien, cf. §1 du handoff) ; une quotidienne pas encore réglée
-- reste NULL plutôt que de forcer un choix arbitraire — l'écran Jour la montre alors dans une
-- carte « Sans moment » (cf. frontend/taches/ui-taches.js) pour qu'elle reste visible.

alter table taches_recurrentes add column if not exists moment text
  check (moment in ('matin', 'soir'));

-- ---------- reprise des tâches quotidiennes existantes ----------
-- Répartition à la routine du foyer : réveil/départ le matin, retour/repas du soir le soir.
-- "Faire à manger" et "Mettre et débarrasser la table" (2 fois/jour, midi + soir) n'ont qu'un
-- moment en base : on retient celui du repas structurant de la journée pour chacune.
-- Idempotent par construction : `where moment is null` ne retouche jamais un moment déjà réglé
-- à la main par Claudia ou Yann depuis Réglages · Parts.
-- Ciblage par MOTIF (`like 'Déposer %'`) et non par titre exact : le prénom de l'enfant est
-- appliqué en base par scripts/renommer_enfant.py et ne doit jamais entrer dans un fichier
-- versionné (dépôt public, invariant 1 et D-030). Le motif attrape les deux formes, avant et
-- après renommage.
update taches_recurrentes set moment = 'matin'
where frequence = 'quotidien' and moment is null and (
  titre = 'Laver les biberons'
  or titre like 'Déposer %'
  or titre like 'Petit déjeuner %'
  or titre like 'Habiller %'
  or titre like 'Brosser les dents %'
  or titre = 'Mettre et débarrasser la table'
  or titre = 'Ranger la vaisselle'
);

update taches_recurrentes set moment = 'soir'
where frequence = 'quotidien' and moment is null and (
  titre like 'Aller chercher %'
  or titre like 'Bain %'
  or titre = 'Préparer le lait du soir'
  or titre = 'Faire à manger'
  or titre = 'Vaisselle'
);

-- ---------- contrôle final ----------
select
  (select count(*) from taches_recurrentes where frequence = 'quotidien') as quotidiennes,
  (select count(*) from taches_recurrentes where frequence = 'quotidien' and moment = 'matin') as matin,
  (select count(*) from taches_recurrentes where frequence = 'quotidien' and moment = 'soir') as soir,
  (select count(*) from taches_recurrentes where frequence = 'quotidien' and moment is null) as sans_moment;
