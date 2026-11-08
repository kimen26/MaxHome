// Liste sous la grille « Agenda · Mois » : événements groupés par jour, une ligne par événement
// (heure, étiquette de la personne en toutes lettres, titre). Produit du HTML, ne touche pas au
// DOM. Tout titre vient de Google ou de la base : échappé avec `txt`. Jamais de hauteur fixe ni
// d'overflow:hidden sur du texte (rules/mobile-parents.md).

import { txt } from "../socle/ui-base.js";
import { titreSection } from "../socle/blocs.js";
import { formatPeriode, formatHeure, nbJours, relatif } from "./calendrier.js";

export const TYPES = { vacances: "Vacances", voyage: "Voyage", ferie: "Férié" };

/** Classe CSS de la couleur d'une personne : Max → « qui-max ». */
export const classeQui = (qui) => `qui-${qui.toLowerCase()}`;

/** Pastille ronde : l'INITIALE de la personne ; la couleur ne porte jamais seule (la légende et
 *  les étiquettes de la liste disent le prénom en toutes lettres). */
export const pastilleQui = (qui) => `<span class="agenda-qui ${classeQui(qui)}" aria-hidden="true">${txt(qui[0])}</span>`;

/** Un événement Google se touche pour le modifier (bouton) ; vacances, fériés et voyages ne se
 *  modifient pas ici : simples blocs, sans curseur de lien. */
function htmlEvenementFoyer(e) {
  const heure = e.heureDebut ? formatHeure(e.heureDebut) : "Journée";
  const periode = e.debut === e.fin ? "" : `<span class="sous">${txt(formatPeriode(e.debut, e.fin))}</span>`;
  return `<button type="button" class="agenda-evt a-foyer agenda-evt-modifiable" data-evt="${txt(e.id)}"
      aria-label="${txt(`Modifier : ${e.qui}, ${e.titre}`)}">
    <span class="agenda-evt-gauche">
      <span class="agenda-evt-heure">${txt(heure)}</span>
      <span class="agenda-qui-nom ${classeQui(e.qui)}">${txt(e.qui)}</span>
    </span>
    <span class="agenda-evt-corps"><span class="agenda-evt-titre">${txt(e.titre)}</span>${periode}</span>
    <span class="agenda-evt-fleche" aria-hidden="true">›</span>
  </button>`;
}

function htmlEvenementPeriode(e, a) {
  const duree = e.type === "ferie" ? "" : ` · ${nbJours(e.debut, e.fin)} j`;
  const lieu = e.type === "voyage" && e.lieu ? ` · ${txt(e.lieu)}` : "";
  return `<div class="agenda-evt a-${e.type}">
    <span class="agenda-evt-type">${TYPES[e.type]}</span>
    <span class="agenda-evt-corps">
      <span class="agenda-evt-titre">${txt(e.titre)}${lieu}</span>
      <span class="sous">${txt(formatPeriode(e.debut, e.fin))}${duree} · ${txt(relatif(e, a))}</span>
    </span>
  </div>`;
}

export const htmlEvenement = (e, a) => (e.type === "foyer" ? htmlEvenementFoyer(e) : htmlEvenementPeriode(e, a));

/** « sam. 7 nov. », précédé de « Aujourd’hui · » si c'est aujourd'hui. */
export const enteteJour = (iso, a) => `${iso === a ? "Aujourd’hui · " : ""}${formatPeriode(iso, iso)}`;

/** Liste groupée : `jours` = [{ iso, evenements }]. */
export function htmlListe(jours, a) {
  return jours.map((j) => `<section class="agenda-jourliste">${titreSection(enteteJour(j.iso, a))}
    ${j.evenements.map((e) => htmlEvenement(e, a)).join("")}</section>`).join("");
}
