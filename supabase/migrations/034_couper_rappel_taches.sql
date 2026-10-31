-- Coupe le rappel des tâches du soir (D-059, décision de Yann le 2026-10-31). Idempotent, sans
-- aucun drop de table (L-056) : on retire seulement la planification pg_cron `rappel-taches`.
-- Rejouable : si le job n'existe plus, le select ne retourne aucune ligne et ne fait rien.
-- La fonction supabase/functions/rappel-taches/ reste dans le dépôt (réactivable via
-- scripts/deploy_rappels.py en la remettant dans RAPPELS).

select cron.unschedule(jobname) from cron.job where jobname = 'rappel-taches';
