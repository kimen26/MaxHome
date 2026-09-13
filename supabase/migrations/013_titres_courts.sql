-- Titres courts (maquette du handoff).
--
-- Pourquoi : l'écran Jour affiche deux colonnes de cartes sur un écran de 360 px. Une ligne y
-- vaut ~150 px de large : au-delà d'une quinzaine de caractères, le titre est tronqué et la
-- liste ne se lit plus d'un coup d'œil — or c'est toute la raison d'être de cet écran. La
-- maquette l'avait déjà tranché (« Petit déj … », « Dents … »), la base ne l'avait pas suivi.
-- On raccourcit donc les LIBELLÉS, jamais les parts, les moments ni les fréquences.
--
-- Le prénom de l'enfant n'apparaît pas ici : il est posé en base par scripts/renommer_enfant.py
-- (dépôt public, invariant 1). On cible par motif, comme 012_moment.sql.
--
-- Idempotent : chaque update ne touche que les lignes encore au long libellé ; rejouer ne fait
-- rien. Réversible à la main, aucune donnée perdue (seul `titre` change).

update taches_recurrentes set titre = 'Petit déj ' || split_part(titre, ' de ', 2)
  where titre like 'Petit déjeuner de %';

update taches_recurrentes set titre = 'Dents ' || split_part(titre, ' de ', 2)
  where titre like 'Brosser les dents de %';

update taches_recurrentes set titre = 'Dépose école'
  where titre like 'Déposer %' and frequence = 'quotidien';

update taches_recurrentes set titre = 'Chercher ' || split_part(titre, 'chercher ', 2)
  where titre like 'Aller chercher %';

update taches_recurrentes set titre = 'Bain' where titre like 'Bain de %';

update taches_recurrentes set titre = 'Préparer le lait' where titre = 'Préparer le lait du soir';
update taches_recurrentes set titre = 'Biberons'         where titre = 'Laver les biberons';
update taches_recurrentes set titre = 'Table'            where titre = 'Mettre et débarrasser la table';
update taches_recurrentes set titre = 'LV - ranger'      where titre = 'Ranger la vaisselle';
update taches_recurrentes set titre = 'LV - vider'       where titre = 'Vaisselle';
update taches_recurrentes set titre = 'Lessive'          where titre = 'Lancer une machine';
update taches_recurrentes set titre = 'Linge'            where titre = 'Étendre et plier le linge';
update taches_recurrentes set titre = 'Sols'             where titre = 'Aspirateur et sols';
update taches_recurrentes set titre = 'Draps'            where titre = 'Changer les draps';
update taches_recurrentes set titre = 'Vitres'           where titre = 'Nettoyer les vitres';
update taches_recurrentes set titre = 'Poubelle'         where titre = 'Sortir la poubelle';
update taches_recurrentes set titre = 'Verre'            where titre = 'Sortir le verre';
update taches_recurrentes set titre = 'Cuisine'          where titre = 'Faire à manger';
update taches_recurrentes set titre = 'Garage'           where titre = 'Trier le garage';
update taches_recurrentes set titre = 'Cadres'           where titre = 'Accrocher les cadres';
update taches_recurrentes set titre = 'Étagère'          where titre like 'Monter l%étagère';

-- Les occurrences DÉJÀ créées portent une copie du titre (dénormalisé pour garder l'historique
-- même si le récurrent est supprimé). On aligne celles qui restent à faire ; les tâches déjà
-- faites gardent le libellé sous lequel elles ont été cochées — une archive ne se réécrit pas.
update taches t set titre = r.titre
  from taches_recurrentes r
  where t.recurrent_id = r.id and t.fait_le is null and t.titre <> r.titre;
