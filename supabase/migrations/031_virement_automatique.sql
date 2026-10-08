-- Virement automatique (D-057) : un récurrent « automatique » est un virement permanent programmé
-- à la banque. Il part seul : l'app l'affiche directement dans « Fait », sans case à cocher.
-- Non appliquée : à passer par Yann.
alter table mouvements_recurrents add column if not exists automatique boolean not null default false;
