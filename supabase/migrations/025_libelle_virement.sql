-- Libellé à mettre sur le virement bancaire (référence), pour pouvoir le copier (Yann).
-- Additive, idempotente.
--
-- Pourquoi sur le COMPTE destinataire, pas sur la charge ni le récurrent : le libellé dépend de
-- QUI reçoit l'argent (le code client de la copropriété, le format attendu par l'école), pas de
-- la charge qui finance le virement — plusieurs charges peuvent partir vers le même compte avec
-- le même libellé un jour ; une charge/un récurrent par compte ne tiendrait pas ce cas. Un
-- libellé peut être FIXE (ex. copropriété : un code client statique, écrit une fois) ou VARIABLE
-- chaque mois (ex. école : « <Prénom NOM> Facture <numéro> ») : dans ce cas le modèle sur le
-- compte sert de PLACEHOLDER, la valeur réelle du mois est saisie sur le mouvement.
alter table comptes add column if not exists libelle_virement text;
alter table comptes add column if not exists libelle_variable boolean not null default false;

-- Valeur du mois (surcharge le modèle du compte quand libelle_variable est vrai, ou corrige un
-- mois pour un libellé fixe exceptionnellement différent).
alter table mouvements add column if not exists libelle_virement text;

comment on column comptes.libelle_virement is
  'Modèle/valeur par défaut du libellé de virement vers ce compte (D-050).';
comment on column comptes.libelle_variable is
  'Vrai si le libellé change chaque mois (ex. numéro de facture) : comptes.libelle_virement sert alors de modèle/placeholder, la valeur réelle vient de mouvements.libelle_virement (D-050).';
comment on column mouvements.libelle_virement is
  'Libellé de virement du mois, surcharge comptes.libelle_virement (D-050).';

-- RLS existante (002_lot_a.sql, policies comptes_rw / mouvements_rw) porte sur la ligne entière
-- via est_membre() : les nouvelles colonnes sont déjà couvertes, rien à ajouter.
