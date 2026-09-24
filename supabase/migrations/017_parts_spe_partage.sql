-- MaxHome — Réglages des tâches refondus (D-038). Additif, idempotent.
--
-- 1. « Part spé » : des parts propres à chaque personne pour une même tâche (déposer le petit
--    ne coûte pas pareil aux deux). Remplace `ecart_prenom` (« un cran de plus pour X »), qui ne
--    savait dire qu'un cran. `parts_spe` null = « part équiv » : `parts_quart` pour tout le monde.
--    Forme : {"Claudia": 12, "Yann": 8}, en quarts de part, valeurs de l'échelle.
-- 2. Fait à deux : chacun prend SES parts (plein), ou un tiers / deux tiers s'il a moins fait.
--    `taches.parts_quart` = parts pleines figées de `qui`, `parts_quart2` = celles de `qui2`,
--    `tiers` / `tiers2` = la part retenue (1, 2 ou 3 tiers). Une ligne « à deux » d'avant cette
--    migration (`qui2` rempli, `parts_quart2` null) garde son ancienne règle : base divisée en
--    deux. On ne réécrit pas la balance des semaines passées.

alter table taches_recurrentes add column if not exists parts_spe jsonb;

alter table taches add column if not exists parts_quart2 int;
alter table taches add column if not exists tiers smallint not null default 3;
alter table taches add column if not exists tiers2 smallint;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'taches_tiers_check') then
    alter table taches add constraint taches_tiers_check check (tiers between 1 and 3);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'taches_tiers2_check') then
    alter table taches add constraint taches_tiers2_check check (tiers2 is null or tiers2 between 1 and 3);
  end if;
end $$;

-- ---------- reprise de l'écart en part spé (une seule fois : parts_spe encore vide) ----------
-- La personne de l'écart prend le cran suivant de l'échelle (plafond 8 parts = 32 quarts),
-- l'autre garde la base : exactement ce que `partsDe` calculait avant.
update taches_recurrentes r
set parts_spe = (
  select jsonb_object_agg(m.prenom,
    case when m.prenom = r.ecart_prenom then
      case r.parts_quart when 2 then 4 when 4 then 8 when 8 then 12 when 12 then 20 else 32 end
    else r.parts_quart end)
  from membres m)
where r.ecart_prenom is not null and r.parts_spe is null;

-- ---------- contrôle final ----------
select
  (select count(*) from taches_recurrentes where parts_spe is not null) as taches_part_spe,
  (select count(*) from taches where qui2 is not null and parts_quart2 is null) as a_deux_anciennes;
