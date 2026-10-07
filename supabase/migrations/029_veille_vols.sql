-- Veille vols (docs/briefs/veille-vols.md) : le dernier instantané des prix relevés par
-- MaxVoyage, publié chaque matin par scripts/publier_pepites.py (clé service_role, hors RLS).
-- Une seule ligne (id = 1), écrasée à chaque publication : l'historique vit dans MaxVoyage.
-- Le front ne fait que lire. Additif, idempotent.
create table if not exists veille_vols (
  id         int primary key default 1 check (id = 1),
  genere_le  timestamptz not null,
  contenu    jsonb not null
);

alter table veille_vols enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'veille_vols' and policyname = 'veille_vols_lecture') then
    create policy veille_vols_lecture on veille_vols for select using (est_membre());
  end if;
end $$;
