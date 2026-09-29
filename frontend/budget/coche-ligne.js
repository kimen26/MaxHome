// Bascule de la coche d'UNE ligne de charge (validation, D-046, Yann 2026-09-29) — partagé par
// ui-mois-charges.js (charges par catégorie) et ui-mouvements.js (« Ce mois seulement ») pour
// ne pas dupliquer la règle à deux endroits. Une charge envoyée vers un autre compte (mode
// "charge" d'un récurrent, compte-charge.js) a SON mouvement du mois : le coche/décoche de la
// ligne bascule ce mouvement pareil, montant figé à la coche — même geste que
// `basculer.appliquer` de ui-mouvements.js.
// Cycle optimiste/rollback (D-024) : `preparerBascule` mute l'état AVANT tout appel réseau
// (l'appelant rend l'écran juste après), `ecrireBascule` fait l'écriture ; en cas d'échec
// l'appelant restaure `avant` lui-même — pas de logique HTML ni de rollback ici, seulement
// le calcul, comme calc.js.

import { montantTheorique } from "./calc.js";

/** Champs à écrire sur `lignes` pour cocher (fait_le = maintenant, fait_par = prenom ou null)
 *  ou décocher (les deux à null) — pur. */
export const champsBascule = (dejaFait, prenom) =>
  dejaFait ? { fait_le: null, fait_par: null } : { fait_le: new Date().toISOString(), fait_par: prenom ?? null };

/** Récurrent en mode "charge" pour `chargeId`, et son mouvement du mois s'il existe — pur. */
const recurrentDeCharge = (etat, chargeId) =>
  etat.recurrents.find((r) => r.actif && r.mode === "charge" && r.charge_id === chargeId) ?? null;
const mouvementDe = (etat, recurrentId) => etat.mouvements.find((m) => m.recurrent_id === recurrentId) ?? null;

/** Champs à écrire sur le mouvement lié quand sa ligne bascule : montant figé au moment de la
 *  coche (comme ui-mouvements.js), à null au moment de la décoche. `null` si aucun mouvement
 *  lié n'existe (rien à faire côté mouvements). Pur. */
export function champsMouvementLie(etat, chargeId, champsLigne) {
  const recurrent = recurrentDeCharge(etat, chargeId);
  if (!recurrent) return null;
  const mouvement = mouvementDe(etat, recurrent.id);
  if (!mouvement) return null;
  if (!champsLigne.fait_le) return { id: mouvement.id, champs: { fait_le: null, fait_par: null } };
  const fige = montantTheorique(recurrent, etat) ?? mouvement.montant_centimes;
  return { id: mouvement.id, champs: { fait_le: champsLigne.fait_le, fait_par: champsLigne.fait_par, montant_centimes: fige } };
}

/**
 * Calcule ce qu'il faut écrire pour basculer `chargeId`, sans rien muter ni écrire — refuse
 * (ok:false) si la charge n'a pas de ligne ce mois (pas de montant saisi, règle 3 du brief).
 * @returns { ok:false, message } ou { ok:true, message, champsLigne, mouvementLie }
 */
export function preparerBascule(etat, chargeId) {
  const avant = etat.lignes[chargeId];
  if (avant === undefined) {
    const charge = etat.charges.find((c) => c.id === chargeId);
    return { ok: false, message: `Saisis d'abord le montant de ${charge?.libelle ?? "cette charge"}.` };
  }
  const dejaFait = !!avant.fait_le;
  const champsLigne = champsBascule(dejaFait, etat.prenom);
  const mouvementLie = champsMouvementLie(etat, chargeId, champsLigne);
  return { ok: true, message: dejaFait ? "Validation annulée." : "Validé.", champsLigne, mouvementLie };
}

/** Mute `etat` selon le résultat de `preparerBascule` (ok:true) : à appeler juste avant de
 *  rendre l'écran, avant l'écriture réseau (optimiste). Renvoie l'état d'avant, pour rollback. */
export function appliquerBascule(etat, chargeId, { champsLigne, mouvementLie }) {
  const ligneAvant = etat.lignes[chargeId];
  etat.lignes[chargeId] = { ...ligneAvant, ...champsLigne };
  let mouvementAvant = null;
  if (mouvementLie) {
    const m = etat.mouvements.find((x) => x.id === mouvementLie.id);
    mouvementAvant = { ...m };
    Object.assign(m, mouvementLie.champs);
  }
  return { ligneAvant, mouvementAvant };
}

/** Restaure `etat` avec ce que `appliquerBascule` a renvoyé — rollback après échec réseau. */
export function annulerBascule(etat, chargeId, { ligneAvant, mouvementAvant }, mouvementLie) {
  etat.lignes[chargeId] = ligneAvant;
  if (mouvementLie && mouvementAvant) {
    const m = etat.mouvements.find((x) => x.id === mouvementLie.id);
    if (m) Object.assign(m, mouvementAvant);
  }
}

/** Écrit en base les champs préparés — aucune mutation d'état ici (déjà faite par appliquerBascule). */
export async function ecrireBascule(api, etat, chargeId, { champsLigne, mouvementLie }) {
  await api.majLigne(etat.annee, etat.mois, chargeId, champsLigne);
  if (mouvementLie) await api.majMouvement(mouvementLie.id, mouvementLie.champs);
}
