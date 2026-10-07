// Règles PURES de l'écran Pépites (veille vols de MaxVoyage, docs/briefs/veille-vols.md) :
// fraîcheur du relevé, prix arrondis, repères d'une offre. Sans DOM ni réseau — testé dans
// tests/test_voyages.mjs. MaxHome ne recalcule rien des prix : il lit l'instantané tel quel.

import { nbJours } from "../agenda/calendrier.js";

/** Au-delà, le relevé est signalé comme vieux : le PC de MaxVoyage n'a pas tourné. */
export const PERIME_APRES_JOURS = 2;

/** Offres montrées d'emblée par période ; le reste se déplie. */
export const OFFRES_VISIBLES = 5;

/** Jours écoulés depuis le relevé (0 = aujourd'hui). */
export const ageReleve = (releveLe, auj) => Math.max(0, nbJours(releveLe, auj) - 1);

export function libelleReleve(releveLe, auj) {
  const n = ageReleve(releveLe, auj);
  if (n === 0) return "Prix relevés aujourd’hui";
  if (n === 1) return "Prix relevés hier";
  return `Prix relevés il y a ${n} jours`;
}

export const releveAncien = (releveLe, auj) => ageReleve(releveLe, auj) > PERIME_APRES_JOURS;

// Espaces insécables : « 2 h 30 » ou « 196 € » ne se coupent jamais en fin de ligne à 320 px.
const INSECABLE = " ";

/** 19600 → « 196 € » ; 124567 → « 1 246 € » : au téléphone, l'euro près suffit. */
export const prixRond = (centimes) =>
  `${Math.round(centimes / 100).toLocaleString("fr-FR")}${INSECABLE}€`;

/** 195 → « 3 h 15 » ; 120 → « 2 h » ; inconnue → "". */
export function duree(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}${INSECABLE}h${INSECABLE}${String(m).padStart(2, "0")}` : `${h}${INSECABLE}h`;
}

/** « Direct · Transavia · 3 h 15 » ; une escale ou plus le dit en toutes lettres. */
export function ligneVol(offre) {
  const escales = offre.escales === 0 ? "Direct" : `${offre.escales} escale${offre.escales > 1 ? "s" : ""}`;
  return [escales, (offre.compagnies ?? []).join(", "), duree(offre.duree_aller_min)].filter(Boolean).join(" · ");
}

/** Repères d'une offre, chacun avec son libellé (jamais la couleur seule) : bon plan (prix sous
 *  le seuil de l'alerte MaxVoyage), en baisse depuis hier, nouvelle. `ton` choisit la couleur. */
export function reperesOffre(offre) {
  const reperes = [];
  if (offre.sous_seuil) reperes.push({ texte: "✓ Bon plan", ton: "bon" });
  if (offre.tendance === "baisse" && offre.baisse_pp_centimes > 0) {
    reperes.push({ texte: `↓ ${prixRond(offre.baisse_pp_centimes)} depuis hier`, ton: "bon" });
  }
  if (offre.tendance === "nouveau") reperes.push({ texte: "Nouveau", ton: "neutre" });
  return reperes;
}

/** Nombre de bons plans (offres sous le seuil) dans tout l'instantané (résumé de l'accueil). */
export const nbBonsPlans = (contenu) =>
  (contenu?.periodes ?? []).reduce((n, p) => n + p.offres.filter((o) => o.sous_seuil).length, 0);
