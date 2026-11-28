// Quel virement, vers quel compte, quel mouvement du mois pour UNE charge (D-050, D-054) : la
// sélection partagée entre la liste du mois (ui-mois-liste.js : case « Payer … → compte final »)
// et la feuille de réglage de la charge (feuille-virement.js : section « Virement »). Pur, sans
// DOM : testé en node (tests/test_libelles.mjs).

import { aReserve, estMoisPaiement, prochainMoisPaiement } from "./reserve.js";

/** Récurrent actif en mode « charge » de cette charge (au plus un, compte-charge.js) — ou null. */
export const recurrentDeCharge = (recurrents, chargeId) =>
  recurrents.find((r) => r.actif && r.mode === "charge" && r.charge_id === chargeId) ?? null;

/** Même récurrent, seulement s'il porte une réserve relais (D-054) — ou null. */
export const recurrentReserveDe = (recurrents, chargeId) => {
  const r = recurrentDeCharge(recurrents, chargeId);
  return r && aReserve(r) ? r : null;
};

/** Mouvement d'étape 2 (paiement) du mois pour ce récurrent : recurrent_id + etape = 2
 *  (028_mouvements_etape.sql — l'étape 1 est le virement habituel du même récurrent). */
export const mouvementPaiementDe = (mouvements, recurrent) =>
  mouvements.find((m) => m.recurrent_id === recurrent.id && m.etape === 2) ?? null;

/** Mouvement du virement habituel (étape 1 ou sans étape) du mois pour ce récurrent. */
export const mouvementHabituelDe = (mouvements, recurrent) =>
  mouvements.find((m) => m.recurrent_id === recurrent.id && (m.etape == null || m.etape === 1)) ?? null;

const porteUnLibelle = (compte) => Boolean(compte?.libelle_virement || compte?.libelle_variable);

/**
 * Ce que la feuille d'une charge doit dire du virement, ou null s'il n'y a rien à dire (pas de
 * récurrent actif en mode charge, compte inconnu, compte sans libellé ni libellé variable).
 * Le compte qui compte est le compte FINAL (`relais_vers`) quand il y a une réserve, sinon
 * `compte_vers`. @param {{recurrents, comptes, mouvements, mois}} etat — `mois` : 1-12.
 * @returns {{recurrent, compte, tampon, mouvement, moisPaiement, aPayerCeMois}|null}
 *   `tampon` : compte tampon (réserve) ou null ; `moisPaiement` : prochain mois de paiement
 *   (ce mois inclus s'il en est un), null sans réserve ; `aPayerCeMois` : mois de paiement.
 */
export function virementDeCharge(charge, etat) {
  const recurrent = recurrentDeCharge(etat.recurrents, charge.id);
  if (!recurrent) return null;
  const reserve = aReserve(recurrent);
  const compte = etat.comptes.find((c) => c.id === (reserve ? recurrent.relais_vers : recurrent.compte_vers));
  if (!compte || !porteUnLibelle(compte)) return null;
  const aPayerCeMois = reserve && estMoisPaiement(recurrent, etat.mois);
  return {
    recurrent, compte, aPayerCeMois,
    tampon: reserve ? etat.comptes.find((c) => c.id === recurrent.compte_vers) ?? null : null,
    mouvement: reserve ? mouvementPaiementDe(etat.mouvements, recurrent) : mouvementHabituelDe(etat.mouvements, recurrent),
    moisPaiement: !reserve ? null : aPayerCeMois ? etat.mois : prochainMoisPaiement(recurrent, etat.mois),
  };
}
