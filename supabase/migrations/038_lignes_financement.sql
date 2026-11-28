-- Financement d'une ligne du mois : D'OU VIENT L'ARGENT d'un extra (charge ponctuelle).
-- NULL = comportement d'avant : la ligne est comptee normalement (toutes les lignes existantes,
-- anciens extras compris, ne changent pas : aucune migration de donnees).
--   'a_financer' : extra en attente, EXCLU du calcul (ni virements, ni total, ni reste a vivre)
--   'joint'      : le compte joint l'absorbe, personne ne vire plus
--   'chacun'     : chacun ajoute ce mois-ci, compte selon la regle de l'extra (50/50 ou prorata)
-- Regle de calcul : frontend/budget/calc.js (compteDansLeCommun), un seul moteur (bot compris).
-- Idempotent, sans aucun drop (L-056) : rejouable sans effet.
-- RLS : la policy `lignes_rw` (schema.sql, for all using/with check est_membre()) est par LIGNE, elle couvre
-- donc la nouvelle colonne sans rien changer.

alter table lignes add column if not exists financement text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lignes_financement_valeurs') then
    alter table lignes add constraint lignes_financement_valeurs
      check (financement is null or financement in ('a_financer', 'joint', 'chacun'));
  end if;
end $$;

comment on column lignes.financement is
  'Financement d''une ligne du mois : NULL = compte normalement ; a_financer = en attente, hors calcul ; joint = absorbe par le compte joint ; chacun = chacun ajoute ce mois-ci.';
