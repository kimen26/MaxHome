// Règles PURES du module Proches : quels jours sont libres pour un sondage « Proposer une date »,
// raccourcis de période, validation de la période. Sans DOM ni réseau — testé dans
// tests/test_proches.mjs. Dates AAAA-MM-JJ locales (L-004 : jamais toISOString()).
//
// Principe 1 du brief (docs/briefs/proposer-date.md) : la sortie ne porte JAMAIS le titre d'un
// événement ni d'un voyage — seulement { jour, libre, ferie, vacances }. Le titre d'un férié ou
// d'une période de vacances est une donnée publique, il peut sortir.

import { couvre, decalerJours, depuisIso, feries, jourIso, nbJours, sansPastille } from "../agenda/calendrier.js";

/** Durée maximale d'un sondage, en jours (même borne que la base : `jours` jsonb, 62 au plus). */
export const JOURS_MAX = 62;
/** Horizon de l'agenda Google chargé par l'Agenda (mois après aujourd'hui) : au-delà, « libre »
 *  ne voudrait rien dire, l'agenda n'y est pas lu. */
export const MOIS_HORIZON = 12;

const SAMEDI = 6, DIMANCHE = 0;
const estWeekEnd = (iso) => [SAMEDI, DIMANCHE].includes(depuisIso(iso).getDay());

/** Fériés (métropole) qui touchent la période : `feries(année)` pour chaque année couverte. */
export function feriesDePeriode(debut, fin) {
  const annees = [];
  for (let a = depuisIso(debut).getFullYear(); a <= depuisIso(fin).getFullYear(); a++) annees.push(a);
  return annees.flatMap((a) => feries(a));
}

/** Message d'erreur en français si la période est refusée, sinon null. `auj` est injecté. */
export function erreurPeriode(debut, fin, auj) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(debut ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(fin ?? "")) {
    return "Choisissez un premier et un dernier jour.";
  }
  if (fin < debut) return "Le dernier jour doit venir après le premier.";
  if (fin < auj) return "Cette période est déjà passée.";
  if (nbJours(debut, fin) > JOURS_MAX) return `La période est trop longue : ${JOURS_MAX} jours au plus.`;
  const d = depuisIso(auj);
  const horizon = jourIso(new Date(d.getFullYear(), d.getMonth() + MOIS_HORIZON, d.getDate()));
  if (fin > horizon) return "Au-delà d'un an, l'agenda n'est pas encore lu : choisissez une période plus proche.";
  return null;
}

/**
 * Jours de la période avec leur état : `[{ jour, libre, ferie, vacances }]`.
 * Pris = un événement Google (hors télétravail, qui n'empêche pas de se voir) ou un voyage
 * couvre le jour. `ferie` / `vacances` : titre public de la période qui couvre le jour, sinon null.
 * `weekendsSeuls` : on ne garde que les samedis et dimanches.
 * Lève une erreur si la période est invalide ou dépasse JOURS_MAX (le contrôle « passé / trop loin »
 * est celui de l'écran, `erreurPeriode`, qui connaît la date du jour).
 */
export function joursLibres(debut, fin, { google = [], voyages = [], vacances = [], feries: fer = [], weekendsSeuls = false } = {}) {
  if (!debut || !fin || fin < debut) throw new Error("Période invalide : le dernier jour précède le premier.");
  if (nbJours(debut, fin) > JOURS_MAX) throw new Error(`Période trop longue : ${JOURS_MAX} jours au plus.`);
  const evenementsPris = google.filter((g) => g?.debut && g?.fin && !sansPastille(g.titre));
  const sortie = [];
  for (let jour = debut; jour <= fin; jour = decalerJours(jour, 1)) {
    if (weekendsSeuls && !estWeekEnd(jour)) continue;
    const pris = evenementsPris.some((e) => couvre(e, jour)) || voyages.some((v) => v?.debut && v?.fin && couvre(v, jour));
    sortie.push({
      jour,
      libre: !pris,
      ferie: fer.find((f) => couvre(f, jour))?.titre ?? null,
      vacances: vacances.find((v) => couvre(v, jour))?.titre ?? null,
    });
  }
  return sortie;
}

// ---------- raccourcis de période (la date du jour est INJECTÉE : testable) ----------

/** Samedi de ce week-end : aujourd'hui si on est samedi ou dimanche, sinon le prochain samedi. */
function debutWeekEnd(auj) {
  const j = depuisIso(auj).getDay();
  return j === SAMEDI || j === DIMANCHE ? auj : decalerJours(auj, (SAMEDI - j + 7) % 7);
}

/** « Ce week-end » : du samedi (ou d'aujourd'hui) au dimanche. */
export function periodeCeWeekEnd(auj) {
  const debut = debutWeekEnd(auj);
  const fin = depuisIso(debut).getDay() === DIMANCHE ? debut : decalerJours(debut, 1);
  return { debut, fin, weekendsSeuls: true };
}

/** « Les 4 prochains week-ends » : de ce week-end au dimanche du quatrième. */
export function periodeQuatreWeekEnds(auj) {
  const { debut } = periodeCeWeekEnd(auj);
  const samedi = depuisIso(debut).getDay() === DIMANCHE ? decalerJours(debut, -1) : debut;
  return { debut, fin: decalerJours(samedi, 22), weekendsSeuls: true };
}

/** « Ce mois-ci » : d'aujourd'hui à la fin du mois, tous les jours. */
export function periodeCeMois(auj) {
  const d = depuisIso(auj);
  return { debut: auj, fin: jourIso(new Date(d.getFullYear(), d.getMonth() + 1, 0)), weekendsSeuls: false };
}
