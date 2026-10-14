// Vocabulaire PUR de la fiche voyage V3 (brief fiche-voyage-v3.md) : mots et couleurs des statuts,
// pastille, jours courts/longs, heure d'une résa, lien sûr. Sans état ni réseau — partagé par les
// rendus feuille de route / planning / activités / infos (fiche-*.js), que le lot « partage »
// rappelle tels quels.
import { txt } from "../socle/ui-base.js";
import { depuisIso } from "./calendrier.js";

/** Le mot de chaque statut : la couleur n'est jamais seule. */
export const MOT_STATUT = { paye: "Payé", acte: "Acté", possible: "Possible", ecarte: "Écarté" };
/** Les trois statuts toujours en évidence (légende), dans l'ordre d'avancement. */
export const STATUTS_AFFICHES = ["paye", "acte", "possible"];
/** Couleur de marqueur de carte par statut (texte/pastille : fiche-voyage.css). */
export const COULEUR_STATUT = { paye: "#1d6f42", acte: "#1d5b96", possible: "#5f6368", ecarte: "#5f6368" };

export const pastilleStatut = (statut) => `<span class="fv-statut fv-${statut}">${MOT_STATUT[statut]}</span>`;

export const rendreLegende = () => `<div class="fv-legende" aria-label="Légende des statuts">${
  STATUTS_AFFICHES.map((s) => `<span class="fv-leg fv-${s}">${MOT_STATUT[s]}</span>`).join("")}</div>`;

/** « sam. 3 » */
export const jourCourt = (iso) => depuisIso(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });

/** « Samedi 3 octobre » */
export function jourLong(iso) {
  const t = depuisIso(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** « 10h30 » pour une date-heure ; « » pour une date seule ou minuit (pas d'heure saisie). */
export function heureDe(debut) {
  const m = /T(\d{2}):(\d{2})/.exec(debut ?? "");
  if (!m || (m[1] === "00" && m[2] === "00")) return "";
  return m[2] === "00" ? `${Number(m[1])}h` : `${Number(m[1])}h${m[2]}`;
}

/** Une URL n'est un lien que si elle est en http(s) : jamais de `javascript:` dans un href. */
export const lienSur = (url) => (/^https?:\/\//i.test(url ?? "") ? txt(url) : null);

export const lienItineraire = (lieu) =>
  `https://www.google.com/maps/dir/?api=1&destination=${Number(lieu.lat)},${Number(lieu.lng)}`;
