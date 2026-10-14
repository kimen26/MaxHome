// Onglet « Carte » de la fiche voyage V3 : Leaflet chargé à la demande, marqueurs colorés PAR STATUT
// (Payé · Acté · Possible, écartés masqués) ET légende en mots (jamais la couleur seule). Hors
// ligne / cdnjs bloqué : message clair dans le cadre, le reste de la fiche continue de
// fonctionner (brief carnet-voyage.md §Écrans point 3).

import { txt } from "../socle/ui-base.js";
import { statutLieu } from "./planning.js";
import { creerCarte } from "./carte.js";
import { COULEUR_STATUT, MOT_STATUT, STATUTS_AFFICHES, lienItineraire } from "./fiche-statuts.js";

/** Un point de carte par lieu localisé non écarté : position, nom, mot du statut, couleur. */
function pointsDeCarte(lieux, resas) {
  return lieux
    .filter((l) => l.statut !== "ecarte" && l.lat != null && l.lng != null)
    .map((l) => {
      const statut = statutLieu(l, resas);
      return { lat: l.lat, lng: l.lng, nom: l.nom, mot: MOT_STATUT[statut], couleur: COULEUR_STATUT[statut], itineraire: lienItineraire(l) };
    });
}

/** Légende des seuls statuts présents sur la carte, avec leur mot et le nombre de lieux. */
const legende = (points) => `<div class="carte-legende">${STATUTS_AFFICHES.map((s) => [s, points.filter((p) => p.mot === MOT_STATUT[s]).length])
  .filter(([, n]) => n)
  .map(([s, n]) => `<span class="carte-legende-item"><span class="carte-legende-puce" style="background:${COULEUR_STATUT[s]}"></span>${txt(MOT_STATUT[s])} (${n})</span>`).join("")}</div>`;

/** Rend l'onglet Carte dans `selecteur` : un message s'il n'y a aucun lieu localisé, sinon un
 *  cadre avec la carte (ou un message d'indisponibilité si Leaflet ne charge pas) et sa légende. */
export async function rendreCarteVoyage(selecteur, lieux, resas) {
  const conteneur = document.querySelector(selecteur);
  if (!conteneur) return;
  const points = pointsDeCarte(lieux, resas);
  if (!points.length) {
    conteneur.innerHTML = `<p class="vide">Aucun lieu localisé pour l'instant : ajoute une position depuis Activités.</p>`;
    return;
  }
  conteneur.innerHTML = `<div class="fiche-carte">
    <div id="carte-leaflet" class="carte-cadre"></div>
    ${legende(points)}
  </div>`;
  try {
    await creerCarte(conteneur.querySelector("#carte-leaflet"), points);
  } catch (e) {
    console.error("carte indisponible", e);
    conteneur.querySelector("#carte-leaflet").innerHTML = `<p class="carte-indisponible">Carte indisponible hors ligne.</p>`;
  }
}
