// « Prochaine étape » (D-047 §V2) : la prochaine résa/dépense datée, en carte mise en avant.
// Pur assemblage HTML, pas d'état propre — rendu par ui-fiche-voyage.js à chaque rafraîchissement.

import { $, txt } from "../socle/ui-base.js";
import { TYPES_RESA, prochaineEtape } from "./carnet.js";

export function rendreProchaineEtape(resas) {
  const etape = prochaineEtape(resas, new Date().toISOString());
  if (!etape) return "";
  const type = TYPES_RESA.find((t) => t.valeur === etape.type) ?? TYPES_RESA.at(-1);
  const avecHeure = etape.debut && !/T00:00(:00)?$/.test(etape.debut);
  const quand = new Date(etape.debut).toLocaleString("fr-FR",
    { weekday: "long", day: "numeric", month: "long", ...(avecHeure && { hour: "2-digit", minute: "2-digit" }) });
  const quandMaj = quand.charAt(0).toUpperCase() + quand.slice(1);
  return `<div class="carte-etape">
    <span class="etape-etiquette">Prochaine étape</span>
    <span class="etape-type">${type.emoji} ${txt(type.libelle)}</span>
    <h3 class="etape-titre">${txt(etape.titre)}</h3>
    <p class="etape-quand">${txt(quandMaj)}</p>
    ${etape.code ? `<span class="etape-code">${txt(etape.code)}</span>` : ""}
  </div>`;
}
