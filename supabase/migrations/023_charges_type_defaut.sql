-- Donne à charges.type un défaut aligné sur regle. Additif, idempotent.
--
-- Pourquoi : type (colonne héritée du schéma V0, cf. 002_lot_a.sql) est NOT NULL sans défaut.
-- regle l'a remplacée fonctionnellement (002_lot_a.sql la remplit depuis type, et plus aucun
-- code — front, bot, calc, Edge Functions — ne LIT plus charges.type, grep fait le 2026-10-01).
-- Mais deux points de création de charge ponctuelle ne la posaient pas :
--   - ui-mouvements.js (formulaireLigneDuMois, bouton « + Ajouter » de l'écran Mois)
--   - un troisième était déjà correct (ui-charges-ajout.js écrit type: regle)
-- → l'insert échouait en prod (NOT NULL violation). On ne drope pas type (consigne : jamais),
-- on la rend inoffensive : défaut 'proport', et un trigger la garde alignée sur regle à chaque
-- insert/update tant que l'appelant ne la fournit pas explicitement — ainsi aucun futur point
-- de création ne pourra retomber dans le même piège.
alter table charges alter column type set default 'proport';

create or replace function charges_type_suit_regle() returns trigger
language plpgsql as $$
begin
  if new.regle in ('egales', 'proport') then
    new.type := new.regle;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_charges_type_suit_regle on charges;
create trigger trg_charges_type_suit_regle
  before insert or update on charges
  for each row execute function charges_type_suit_regle();
