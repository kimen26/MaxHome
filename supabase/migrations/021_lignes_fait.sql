-- Chaque charge du mois se valide, avec qui et quand. Additif, idempotent.
--
-- Pourquoi : Yann veut valider TOUTES les lignes du mois (prélèvements, virements vers un livret
-- ou le compte du crédit), une à une, dans leur catégorie, avec le prénom et la date. La coche
-- vit sur la ligne du mois (`lignes`), pas sur la charge : chaque mois se valide à nouveau.
-- Les mois passés restent non validés (null) : on ne sait pas qui a fait quoi, pas d'invention.
alter table lignes add column if not exists fait_le timestamptz;
alter table lignes add column if not exists fait_par text references membres(prenom);

select count(*) as lignes, count(fait_le) as validees from lignes;
