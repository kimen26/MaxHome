// Bandeau d'en-tête de la fiche voyage (D-047 §V2) : fond couleur d'accent du voyage, titre,
// lieu, dates, gros compteur J-n / En cours / Terminé, 2 pastilles chiffres (X € payés / Y € ;
// n à faire). Sans état propre : un pur assemblage HTML, rendu par ui-fiche-voyage.js
// à chaque rafraîchissement.

import { txt } from "../socle/ui-base.js";
import { formatPeriode, jourIso } from "./calendrier.js";
import { joursAvant, couleurVoyage, budgetParPoste } from "./carnet.js";

/** Montant arrondi À L'EURO, sans centimes : la pastille du bandeau donne un ordre de grandeur
 *  d'un coup d'œil (relecture point 3), le détail exact reste dans la section Budget plus bas.
 *  Espace insécable FINE (U+202F) entre le nombre et le symbole — jamais un double espace
 *  (relecture 2 §C : toLocaleString("fr-FR") en pose déjà une, en ajouter une manuellement en
 *  donnait deux). */
const eurosRonds = (c) => `${Math.round(c / 100)} €`;

function decompteTexte(voyage) {
  const d = joursAvant(voyage, jourIso(new Date()));
  if (d === "en cours") return "En cours";
  if (d === "passé") return "Terminé";
  return `J-${d}`;
}

export function rendreBandeau(voyage, { resas, enveloppes, todos = [] }) {
  const couleur = couleurVoyage(voyage.id);
  const aFaire = todos.filter((t) => !t.fait_le).length;
  const { totaux } = budgetParPoste(resas, enveloppes);
  return `<div class="fiche-bandeau" style="background:${couleur}">
    <button type="button" class="btn-lien bandeau-retour" data-retour-voyages>← Voyages</button>
    <h2 class="bandeau-titre">${txt(voyage.titre)}</h2>
    <p class="bandeau-sous">${txt(voyage.lieu ?? "")}${voyage.lieu ? " · " : ""}${txt(formatPeriode(voyage.debut, voyage.fin, { annee: true }))}</p>
    <span class="bandeau-decompte">${txt(decompteTexte(voyage))}</span>
    <div class="bandeau-pastilles">
      <span class="bandeau-pastille"><span class="bp-valeur">${txt(eurosRonds(totaux.engage))}</span><span class="bp-etiquette">payés${totaux.prevu ? ` / ${txt(eurosRonds(totaux.prevu))}` : ""}</span></span>
      <span class="bandeau-pastille"><span class="bp-valeur">${txt(aFaire)}</span><span class="bp-etiquette">à faire</span></span>
    </div>
  </div>`;
}
