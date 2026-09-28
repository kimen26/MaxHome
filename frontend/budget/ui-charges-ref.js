// Écran « Réglages · Charges » : la liste des charges, une ligne chacune, qui DIT ses deux
// réglages sans rien demander — le montant habituel (« Toujours le même » ou « Change chaque
// mois ») et qui paie quoi. Tap sur une ligne → sa feuille de réglage (ui-charge-feuille.js),
// seul endroit où l'on change quelque chose (D-040). La version précédente mettait les choix
// en ligne (D-039) : seize charges × deux choix, illisible, et le « dernier » n'y servait à rien.

import { euros } from "./calc.js";
import { $, $$, txt } from "../socle/ui-base.js";
import { categoriesPresentes } from "./ui-mois-charges.js";
import { REGLES_COURANTES, libelleRegle, detailRegle } from "./repartition.js";
import { libelleFacon, montantHabituel } from "./habituel.js";

export function creerUiChargesRef(api, etat, cb) {
  // Les charges ponctuelles (« Ligne de ce mois ») n'ont pas de montant habituel : hors d'ici.
  const actives = () => etat.charges.filter((c) => c.actif !== false && !c.ponctuel);

  function rendre() {
    const parCat = {};
    for (const c of actives()) (parCat[c.categorie] ??= []).push(c);
    $("#charges-ref-corps").innerHTML = `
      <div class="carte-explication">
        <h3>Chaque charge a deux réglages</h3>
        <p><strong>Le montant</strong> : « Toujours le même » (crédit, assurance) ou « Change chaque
        mois » (électricité, courses), et on reprend alors le dernier.</p>
        <p><strong>Qui paie quoi</strong> : 50/50, ou au prorata des salaires du mois
        (ce mois : ${txt(detailRegle("proport", etat))}).</p>
        <p>Chaque mois, l'écran Budget propose « Remplir avec les montants habituels ».
        Touche une charge pour la régler.</p>
      </div>
      ${categoriesPresentes(parCat).map((k) => carteCategorie(k, parCat[k])).join("")}`;
    for (const b of $$("#charges-ref-corps [data-reglages]")) {
      b.addEventListener("click", () => cb.ouvrirReglagesCharge(Number(b.dataset.reglages), { enFeuille: true, apres: rendre }));
    }
  }

  const carteCategorie = (nom, items) => `<div class="carte carte-charges-ref">
      <div class="carte-tete"><span>${txt(nom.toUpperCase())}</span></div>
      ${items.map(ligneCharge).join("")}
    </div>`;

  function ligneCharge(c) {
    const hab = montantHabituel(c, etat.derniers);
    // Une règle rare dit la part de chacun : « Clé fixe » seul ne dit pas qui paie quoi.
    const partage = REGLES_COURANTES.includes(c.regle)
      ? libelleRegle(c.regle) : `${libelleRegle(c.regle)} (${detailRegle(c.regle, etat, c)})`;
    const montant = hab == null
      ? '<span class="lcr-montant vide">à noter</span>'
      : `<span class="lcr-montant mono">${euros(hab)}</span>`;
    return `<button type="button" class="ligne-charge-ref" data-reglages="${c.id}" data-regle="${c.regle}">
      <span class="lcr-corps">
        <span class="lcr-nom">${txt(c.libelle)}</span>
        <span class="lcr-infos">${txt(libelleFacon(c))} · ${txt(partage)}</span>
      </span>
      ${montant}
      <span class="lcr-chevron" aria-hidden="true">›</span>
    </button>`;
  }

  return { rendre };
}
