-- Réserve relais (D-054) : une charge mise de côté chaque mois sur un compte tampon
-- (compte_vers existant, mode "charge"), puis payée à son rythme vers un compte final.
-- Additif, idempotent. Le coordinateur applique cette migration — jamais ce code.
--
-- Étape 1 (mettre de côté, chaque mois) : déjà représentée par la ligne de charge habituelle
-- (son mouvement récurrent, mode "charge", compte_vers = tampon) — rien ne change au calcul.
-- Étape 2 (payer, au rythme choisi) : un simple déplacement tampon -> relais_vers, jamais une
-- dépense, jamais compté dans calc.js. relais_vers = NULL (défaut) : pas de réserve, comportement
-- actuel inchangé.
alter table mouvements_recurrents
  add column if not exists relais_vers bigint null references comptes(id),
  add column if not exists relais_tous_les int not null default 1
    check (relais_tous_les in (1, 2, 3, 6, 12)),
  add column if not exists relais_depart int null
    check (relais_depart between 1 and 12);
