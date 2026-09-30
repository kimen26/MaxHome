// Bandeau d'en-tête de la fiche voyage (D-047 §V2) : fond couleur d'accent du voyage, titre,
// lieu, dates, gros compteur J-n / En cours / Terminé, 3 pastilles chiffres (résas · à faire ;
// engagé / prévu ; lieux). Sans état propre : un pur assemblage HTML, rendu par ui-fiche-voyage.js
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

export function rendreBandeau(voyage, { resas, lieux, enveloppes }) {
  const couleur = couleurVoyage(voyage.id);
  const aFaire = resas.filter((r) => r.statut === "a_reserver").length;
  const { totaux } = budgetParPoste(resas, enveloppes);
  const nbLieux = lieux.filter((l) => l.statut !== "ecarte").length;
  return `<div class="fiche-bandeau" style="background:${couleur}">
    <button type="button" class="btn-lien bandeau-retour" data-retour-voyages>← Voyages</button>
    <h2 class="bandeau-titre">${txt(voyage.titre)}</h2>
    <p class="bandeau-sous">${txt(voyage.lieu ?? "")}${voyage.lieu ? " · " : ""}${txt(formatPeriode(voyage.debut, voyage.fin, { annee: true }))}</p>
    <span class="bandeau-decompte">${txt(decompteTexte(voyage))}</span>
    <div class="bandeau-pastilles">
      <span class="bandeau-pastille"><span class="bp-valeur">${txt(resas.length)}</span><span class="bp-etiquette">résa${resas.length > 1 ? "s" : ""}${aFaire ? ` · ${txt(aFaire)} à faire` : ""}</span></span>
      <span class="bandeau-pastille"><span class="bp-valeur">${txt(eurosRonds(totaux.engage))}</span><span class="bp-etiquette">${totaux.prevu ? `sur ${txt(eurosRonds(totaux.prevu))}` : "engagés"}</span></span>
      <span class="bandeau-pastille"><span class="bp-valeur">${txt(nbLieux)}</span><span class="bp-etiquette">lieu${nbLieux > 1 ? "x" : ""}</span></span>
    </div>
  </div>`;
}
