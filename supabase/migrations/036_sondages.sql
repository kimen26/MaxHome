-- Proposer une date à des proches (brief proposer-date.md, lot 1). Additif, idempotent, sans
-- aucun drop (L-056) : tables et fonctions se créent si absentes / se remplacent.
--
-- Un jeton (uuid aléatoire) ouvre une page publique sans session. Elle LIT par la fonction
-- `sondage_public` (seul chemin d'accès) et VOTE par l'Edge Function `sondage-voter` (clé service,
-- validation côté serveur). Aucune écriture anonyme directe : les tables restent réservées aux
-- deux comptes du foyer par la RLS. Supprimer la ligne `sondages` = le lien meurt, votes en cascade.

create table if not exists sondages (
  id                bigint generated always as identity primary key,
  jeton             uuid not null unique default gen_random_uuid(),
  titre             text not null check (char_length(titre) between 1 and 80),
  message           text check (message is null or char_length(message) <= 300),
  -- Jours FIGÉS à la création : [{jour:"AAAA-MM-JJ", libre:bool, ferie:text|null, vacances:text|null}]
  jours             jsonb not null check (jsonb_typeof(jours) = 'array' and jsonb_array_length(jours) between 1 and 62),
  reponses_visibles boolean not null default false,
  cree_par          text,
  cree_le           timestamptz not null default now()
);

create table if not exists sondage_votes (
  id          bigint generated always as identity primary key,
  sondage_id  bigint not null references sondages(id) on delete cascade,
  prenom      text not null check (char_length(prenom) between 1 and 40),
  -- Prénom sans casse ni accents (calculé par l'Edge Function) : un même invité qui revote remplace.
  prenom_cle  text not null check (char_length(prenom_cle) between 1 and 40),
  jours       text[] not null check (cardinality(jours) between 1 and 62),
  vote_le     timestamptz not null default now(),
  unique (sondage_id, prenom_cle)
);

alter table sondages      enable row level security;
alter table sondage_votes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'sondages' and policyname = 'sondages_rw') then
    create policy sondages_rw on sondages for all using (est_membre()) with check (est_membre());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'sondage_votes' and policyname = 'sondage_votes_rw') then
    create policy sondage_votes_rw on sondage_votes for all using (est_membre()) with check (est_membre());
  end if;
end $$;

-- Ce que voit un porteur de lien : titre, mot, jours, interrupteur, et les votes (prénom + jours)
-- SEULEMENT si le créateur a rendu les réponses visibles. Jamais id, jeton, cree_par ni dates.
-- Jeton inconnu → null. security definer : la fonction lit à la place de l'anonyme, d'où la liste
-- blanche (ajouter une colonne ne l'expose JAMAIS ici).
create or replace function public.sondage_public(p_jeton uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'titre', s.titre, 'message', s.message, 'jours', s.jours, 'reponses_visibles', s.reponses_visibles
  ) || case when s.reponses_visibles then jsonb_build_object('votes', coalesce((
      select jsonb_agg(jsonb_build_object('prenom', v.prenom, 'jours', to_jsonb(v.jours)) order by v.vote_le, v.id)
      from sondage_votes v where v.sondage_id = s.id), '[]'::jsonb))
    else '{}'::jsonb end
  from sondages s
  where s.jeton = p_jeton;
$$;

revoke all on function public.sondage_public(uuid) from public;
grant execute on function public.sondage_public(uuid) to anon, authenticated;

-- Purge : un sondage dont le dernier jour est passé depuis plus de 7 jours est détruit (votes en
-- cascade). Pas de security definer : exécutée par pg_cron (superuser), jamais appelable par l'app.
create or replace function public.purger_sondages() returns integer
language sql as $$
  with supprimes as (
    delete from sondages s
    where (select max((j->>'jour')::date) from jsonb_array_elements(s.jours) j) < current_date - 7
    returning 1
  )
  select count(*)::integer from supprimes;
$$;
revoke all on function public.purger_sondages() from public;

-- Planification quotidienne (03:30 UTC). Rejouable : on retire l'ancienne planification d'abord.
create extension if not exists pg_cron;
select cron.unschedule(jobname) from cron.job where jobname = 'purge-sondages';
select cron.schedule('purge-sondages', '30 3 * * *', 'select public.purger_sondages()');
