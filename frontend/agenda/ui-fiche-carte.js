// Section « Carte » de la fiche voyage : Leaflet chargé à la demande, marqueurs colorés par
// catégorie ET légende en mots (jamais la couleur seule), cachée s'il n'y a aucun lieu
// localisé. Hors ligne / cdnjs bloqué : message clair dans le cadre, le reste de la fiche
// continue de fonctionner (brief carnet-voyage.md §Écrans point 3).

import { txt } from "../socle/ui-base.js";
import { titreSection } from "../socle/blocs.js";
import { CATEGORIES_LIEU } from "./carnet.js";
import { creerCarte } from "./carte.js";

const couleurDe = (categorie) => CATEGORIES_LIEU.find((c) => c.valeur === categorie)?.couleur ?? "#495057";

/** Légende des seules catégories présentes sur la carte : une entrée sans marqueur ne dit rien. */
const legende = (lieux) => `<div class="carte-legende">${CATEGORIES_LIEU.filter((c) => lieux.some((l) => l.categorie === c.valeur)).map((c) =>
  `<span class="carte-legende-item"><span class="carte-legende-puce" style="background:${c.couleur}"></span>${txt(c.libelle)}</span>`).join("")}</div>`;

/** Rend la section Carte dans `selecteur` : rien si aucun lieu localisé, sinon un cadre avec
 *  la carte (ou un message d'indisponibilité si Leaflet ne charge pas) et sa légende. */
export async function rendreCarteVoyage(selecteur, lieux) {
  const conteneur = document.querySelector(selecteur);
  if (!conteneur) return;
  const localises = lieux.filter((l) => l.lat != null && l.lng != null);
  if (!localises.length) { conteneur.innerHTML = ""; return; }

  conteneur.innerHTML = `<div class="fiche-carte">
    ${titreSection("Carte")}
    <div id="carte-leaflet" class="carte-cadre"></div>
    ${legende(localises)}
  </div>`;

  try {
    await creerCarte(conteneur.querySelector("#carte-leaflet"), localises, couleurDe);
  } catch (e) {
    console.error("carte indisponible", e);
    conteneur.querySelector("#carte-leaflet").innerHTML =
      `<p class="carte-indisponible">Carte indisponible hors ligne.</p>`;
  }
}
