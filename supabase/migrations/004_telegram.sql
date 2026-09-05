-- Lot B bis — allowlist Telegram. Migration additive.
-- Exécuter via : python scripts/sql.py supabase/migrations/004_telegram.sql

create table if not exists telegram_membres (
  telegram_id bigint primary key,
  prenom text references membres(prenom)
);

alter table telegram_membres enable row level security;

-- Le bot écrit avec la clé service_role (contourne la RLS, voulu) ; côté client
-- (aucun usage prévu ici), même politique que les autres tables.
drop policy if exists telegram_membres_rw on telegram_membres;
create policy telegram_membres_rw on telegram_membres for all
  using (est_membre()) with check (est_membre());

insert into telegram_membres (telegram_id, prenom) values (6433455282, 'Yann')
on conflict (telegram_id) do update set prenom = excluded.prenom;
