-- Note libre sur une charge : POURQUOI elle a ce montant (copro 350 -> 420 EUR, etc.).
-- Idempotent, sans aucun drop (L-056) : rejouable sans effet. `note_le` = date de la derniere
-- ecriture de la note ; les deux colonnes sont NULL quand il n'y a pas de note.
-- RLS : la policy `charges_rw` (schema.sql, for all using/with check est_membre()) est par
-- LIGNE, elle couvre donc les nouvelles colonnes sans rien changer.

alter table charges add column if not exists note text;
alter table charges add column if not exists note_le timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'charges_note_longueur') then
    alter table charges add constraint charges_note_longueur
      check (note is null or char_length(note) <= 500);
  end if;
end $$;
