-- Qui a coché un mouvement, et le virement au commun pointe vers le compte commun.
-- Additif, idempotent.
--
-- Pourquoi : chaque déplacement d'argent du mois (virement au commun, charge envoyée vers un
-- livret ou le compte du crédit) se coche un à un ; on veut voir qui l'a fait. `fait_par` est
-- posé avec `fait_le` (écran Mois et bot Telegram), remis à null quand on décoche.
-- Les coches passées n'ont pas d'auteur connu : elles restent à null, pas de fausse précision.
alter table mouvements add column if not exists fait_par text references membres(prenom);

-- Les récurrents « part » ont été créés avant qu'un compte commun existe (005_refonte.sql) :
-- compte_vers null, l'écran affichait « Comptes à définir ». Ils pointent vers le premier compte
-- commun, comme compteSource() côté front. Les occurrences non cochées suivent ; une occurrence
-- cochée est un fait passé, on n'y touche pas.
update mouvements_recurrents
   set compte_vers = (select id from comptes where commun order by id limit 1)
 where mode = 'part' and compte_vers is null
   and exists (select 1 from comptes where commun);
update mouvements m
   set compte_vers = r.compte_vers
  from mouvements_recurrents r
 where m.recurrent_id = r.id and r.mode = 'part' and m.compte_vers is null
   and m.fait_le is null and r.compte_vers is not null;

select count(*) as mouvements, count(fait_par) as avec_auteur,
       count(*) filter (where compte_vers is null) as sans_destination
  from mouvements;
