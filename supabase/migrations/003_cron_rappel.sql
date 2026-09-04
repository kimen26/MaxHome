-- Planification du rappel Telegram — À EXÉCUTER SEULEMENT une fois
-- supabase/functions/rappel-virements DÉPLOYÉE (secrets Telegram configurés).
-- Non appliquée au Lot A : secrets absents de .env (voir rapport).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'rappel-virements-1er',
  '0 8 1 * *',  -- 09:00 Europe/Paris = 08:00 UTC (hiver ; en été décaler à 07:00 UTC si besoin)
  $$
  select net.http_post(
    url := 'https://REF_PROJET.supabase.co/functions/v1/rappel-virements',
    headers := jsonb_build_object('Authorization', 'Bearer SERVICE_ROLE_KEY')
  );
  $$
);

select cron.schedule(
  'rappel-virements-5',
  '0 8 5 * *',
  $$
  select net.http_post(
    url := 'https://REF_PROJET.supabase.co/functions/v1/rappel-virements',
    headers := jsonb_build_object('Authorization', 'Bearer SERVICE_ROLE_KEY')
  );
  $$
);
