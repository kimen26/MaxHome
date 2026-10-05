// Rendu d'une fiche lieu (carte arrondie) : photo (ratio 16/9) ou bandeau de catégorie en haut,
// nom, catégorie, badge « Réservé » si une résa liée l'est, topo/horaires/notes/lien, bouton
// statut, badge « à localiser ». Brief carnet-voyage.md, lot « fiches visuelles ».

import { txt } from "../socle/ui-base.js";
import { CATEGORIES_LIEU, resaDuLieu } from "./carnet.js";

const LIBELLE_STATUT = { idee: "Idée", prevu: "Prévu", fait: "Fait", ecarte: "Écarté" };

/** Date-heure courte d'une résa, sans "00:00" (même règle que ui-fiche-resas.js::ligne). */
function quandResa(r) {
  if (!r.debut) return "";
  const avecHeure = !/T00:00(:00)?$/.test(r.debut);
  return new Date(r.debut).toLocaleString("fr-FR", { day: "2-digit", month: "short", ...(avecHeure && { hour: "2-digit", minute: "2-digit" }) });
}

/** Photo en haut (ratio 16/9, `object-fit:cover`) si on en a une URL signée. Sans photo, rien :
 *  un bandeau de catégorie répétait le libellé déjà écrit sous le nom et alourdissait chaque
 *  carte sur téléphone — le liseré gauche de la carte porte la couleur, le mot reste dessous. */
function enteteLieu(lieu, urlPhoto) {
  if (!urlPhoto) return "";
  return `<div class="fl-photo"><img src="${txt(urlPhoto)}" alt="${txt(lieu.nom)}" loading="lazy" width="640" height="360"></div>`;
}

/**
 * Carte d'un lieu. `urlPhoto` : URL signée déjà résolue par l'appelant (un seul appel groupé
 * pour tous les lieux visibles, jamais un par carte) ou `null` (pas de photo, ou échec hors
 * ligne — repli sur le bandeau de catégorie, la section continue de s'afficher).
 */
export function carteLieu(lieu, resas, urlPhoto) {
  const cat = CATEGORIES_LIEU.find((c) => c.valeur === lieu.categorie) ?? CATEGORIES_LIEU.at(-1);
  const resa = resaDuLieu(lieu, resas);
  const reserve = resa?.statut === "reserve";
  const sansPosition = lieu.lat == null;
  return `<div class="carte-lieu${lieu.statut === "ecarte" ? " ecarte" : ""}" data-lieu="${lieu.id}" style="border-left-color:${cat.couleur}">
    ${enteteLieu(lieu, urlPhoto)}
    <div class="fl-corps">
      <div class="fl-tete">
        <span class="fl-nom">${txt(lieu.nom)}</span>
        <button type="button" class="lieu-statut cible44" data-statut="${lieu.id}" aria-label="Statut : ${txt(LIBELLE_STATUT[lieu.statut])}, tap pour changer">
          ${txt(LIBELLE_STATUT[lieu.statut])}
        </button>
      </div>
      <span class="lieu-categorie"><span class="lieu-puce" style="background:${cat.couleur}"></span>${txt(cat.libelle)}</span>
      ${reserve ? `<span class="fl-badge-reserve">✓ Réservé${quandResa(resa) ? " · " + txt(quandResa(resa)) : ""}</span>` : ""}
      ${lieu.topo ? `<p class="fl-topo">${txt(lieu.topo)}</p>` : ""}
      ${lieu.horaires ? `<p class="fl-detail">Horaires : ${txt(lieu.horaires)}</p>` : ""}
      ${lieu.note ? `<p class="fl-detail">Nos notes : ${txt(lieu.note)}</p>` : ""}
      ${lieu.lien ? `<a href="${txt(lieu.lien)}" target="_blank" rel="noopener" class="btn-lien fl-lien">Site ↗</a>` : ""}
      ${sansPosition && lieu.statut !== "ecarte" ? `<span class="lieu-alocaliser">à localiser</span>` : ""}
    </div>
  </div>`;
}
