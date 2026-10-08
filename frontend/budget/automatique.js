// Virement automatique (D-057) : un récurrent « automatique » est un virement permanent
// programmé à la banque — il part seul, personne n'a rien à cocher. Il reste visible et compté
// (calc.js ne change pas) mais son élément est FAIT pour l'affichage et le regroupement : état
// DÉRIVÉ du récurrent, jamais une coche écrite en base. Pur, sans DOM.

/** Valeur d'un élément automatique : non nulle donc « fait », mais jamais un prénom du cycle.
 *  Une chaîne (pas un Symbol) pour survivre à JSON.stringify vers le pont du bot. */
export const AUTOMATIQUE = "__automatique__";

export const estAutomatique = (valeur) => valeur === AUTOMATIQUE;

/** La ligne de charge `chargeId` suit-elle un récurrent actif en mode "charge" automatique ? */
export const chargeAutomatique = (recurrents, chargeId) => recurrents.some((r) =>
  r.actif !== false && r.mode === "charge" && r.charge_id === chargeId && r.automatique === true);

/** Le récurrent d'un mouvement est-il automatique ? */
export const mouvementAutomatique = (recurrents, mouvement) =>
  recurrents.find((r) => r.id === mouvement.recurrent_id)?.automatique === true;

/** Valeur d'un élément pour le classement fait / à faire : AUTOMATIQUE prime sur la coche. */
export const valeurClassement = (automatique, valeurCochee) => (automatique ? AUTOMATIQUE : valeurCochee);
