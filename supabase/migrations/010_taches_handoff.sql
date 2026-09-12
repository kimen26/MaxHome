-- MaxHome — tâches du handoff absentes de la base, et alignement du barème. Additif, idempotent.
-- Source : inbox/design_handoff_maxhome_taches/logique-metier.md §1, §3, §4.
--
-- 008 a repris l'existant (pénibilité -> parts) mais ne pouvait pas inventer les tâches que le
-- handoff cite et que 006 n'avait jamais créées : « petit déj Max », « habiller Max »,
-- « dents Max », « préparer le lait » (obligatoires du quotidien) et les chantiers partageables
-- « draps », « vitres », « monter l'étagère », « trier le garage », « accrocher les cadres ».
-- Elles sont ajoutées ici, avec les valeurs de l'échelle données par le handoff.
--
-- Les titres reprennent le vocabulaire de 006 (« le petit », pas « Max ») : le prénom de l'enfant
-- n'a pas à entrer dans un dépôt public (invariant 1), et l'app sert un seul foyer.

-- ---------- 1. nouvelles tâches (insérées une seule fois, repérées par leur titre) ----------
insert into taches_recurrentes
  (titre, categorie, frequence, fois, penibilite, importance, ordre, actif,
   parts_quart, obligatoire, partageable, minutes, parts_reprises)
select v.titre, v.categorie, v.frequence, v.fois, v.penibilite, v.importance, v.ordre, true,
       v.parts_quart, v.obligatoire, v.partageable, v.minutes, true
from (values
  -- Le quotidien de l'enfant : non négociable, mais léger en parts (§1 : 0,5 = le lait du soir).
  ('Petit déjeuner du petit',   'Enfant', 'quotidien', 1, 1, 3, 14,  4, true,  false, 10),
  ('Habiller le petit',         'Enfant', 'quotidien', 1, 1, 3, 15,  4, true,  false, 10),
  ('Brosser les dents du petit','Enfant', 'quotidien', 2, 1, 3, 16,  4, true,  false,  5),
  ('Préparer le lait du soir',  'Enfant', 'quotidien', 1, 1, 3, 17,  2, true,  false,  5),
  -- Les chantiers : lourds, et typiquement faits à deux (§4).
  ('Changer les draps',         'Ménage', 'hebdo',     1, 2, 2, 52,  8, false, true,  20),
  ('Nettoyer les vitres',       'Ménage', 'mensuel',   1, 3, 1, 53, 12, false, true,  45),
  ('Monter l''étagère',         'Maison', 'au_besoin', 1, 3, 1, 70, 20, false, true,  90),
  ('Trier le garage',           'Maison', 'au_besoin', 1, 4, 1, 71, 20, false, true,  90),
  ('Accrocher les cadres',      'Maison', 'au_besoin', 1, 2, 1, 72,  8, false, true,  30)
) as v(titre, categorie, frequence, fois, penibilite, importance, ordre,
       parts_quart, obligatoire, partageable, minutes)
where not exists (select 1 from taches_recurrentes t where t.titre = v.titre);

-- ---------- 2. alignement du barème sur le handoff ----------
-- 008 a converti mécaniquement la pénibilité 1-5, ce qui donne des valeurs que le handoff
-- contredit sur trois tâches. On ne corrige QUE si la valeur est encore celle issue de la
-- conversion : si Claudia ou Yann l'ont déjà réglée à la main, on ne touche à rien.

-- §1 : « 8 — nettoyer la salle de bain. Le haut de l'échelle. » Et c'est une tâche mensuelle
-- dans la maquette (carte « Ce mois »), pas hebdomadaire.
update taches_recurrentes set parts_quart = 32, frequence = 'mensuel', minutes = 90
where titre = 'Salle de bain' and parts_quart = 20 and frequence = 'hebdo';

-- §1 : « 1 — … la poubelle. » La conversion depuis la pénibilité 3 donnait 3 parts.
update taches_recurrentes set parts_quart = 4, minutes = 5
where titre in ('Sortir la poubelle', 'Sortir le verre') and parts_quart = 12;

-- ---------- contrôle final ----------
select
  (select count(*) from taches_recurrentes where actif) as recurrentes_actives,
  (select count(*) from taches_recurrentes where actif and obligatoire) as obligatoires,
  (select count(*) from taches_recurrentes where actif and partageable) as partageables,
  (select count(*) from taches_recurrentes where parts_quart not in (2,4,8,12,20,32)) as parts_invalides,
  (select count(*) from taches) as occurrences;
