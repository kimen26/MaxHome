// Feuille de route de la fiche voyage V3 : une carte par jour (jour court, titre court, statut en
// mot), bordure haute de la couleur du statut, SANS météo. Rendu PUR (HTML depuis les données) :
// le lot « partage » le rappelle tel quel. Le défilement horizontal interne est du CSS.
import { txt } from "../socle/ui-base.js";
import { planningParJour } from "./planning.js";
import { MOT_STATUT, jourCourt } from "./fiche-statuts.js";

/** Cartes-jours cliquables (`data-jour` = AAAA-MM-JJ) ; l'appelant branche le tap. */
export function rendreFeuilleRoute(voyage, lieux, resas) {
  const cartes = planningParJour(voyage, lieux, resas).map((j) => `<button type="button" class="fv-jc fv-${j.statut}" data-jour="${j.jour}">
      <span class="fv-jc-j">${txt(jourCourt(j.jour))}</span>
      <span class="fv-jc-t">${txt(j.titreCourt)}</span>
      <span class="fv-jc-s">${MOT_STATUT[j.statut]}</span>
    </button>`);
  return `<nav class="fv-route" aria-label="Feuille de route">${cartes.join("")}</nav>`;
}
