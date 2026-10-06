-- Réserve relais (D-054) : le paiement (étape 2) d'une charge mise en réserve est un second
-- mouvement du même récurrent dans le mois. L'unicité (annee, mois, recurrent_id) l'interdisait :
-- elle porte désormais aussi sur l'étape (1 = virement habituel, 2 = paiement depuis le tampon).
alter table mouvements add column if not exists etape smallint not null default 1
  check (etape in (1, 2));
drop index if exists mouvements_recurrent_mois;
create unique index mouvements_recurrent_mois on mouvements (annee, mois, recurrent_id, etape);
