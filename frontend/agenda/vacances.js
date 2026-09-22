// Vacances scolaires par zone : lecture de l'API publique data.education.gouv.fr (la même
// source que MaxVoyage, backend/holidays.py), cache local de 7 jours, repli sur le cache
// périmé si le réseau manque. Le parseur est pur (testé) ; `chargerVacances` reçoit ses
// dépendances (fetch, stockage, horloge) pour être testable hors ligne.

import { decalerJours } from "./calendrier.js";

export const ZONES = ["Zone A", "Zone B", "Zone C"];
export const ZONE_DEFAUT = "Zone C";
export const URL_VACANCES =
  "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records";
export const TTL_CACHE_MS = 7 * 24 * 3600 * 1000;
// Un an en arrière : la vue Mois peut remonter dans le passé sans trou.
const RECUL_JOURS = 400;
export const cleCache = (zone) => `maxhome.vacances.${zone}`;

const PARIS = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

/** Horodatage ISO (UTC) → jour civil de Paris, AAAA-MM-JJ. */
export function jourParis(horodatage) {
  const d = new Date(horodatage);
  if (Number.isNaN(d.getTime())) return null;
  // fr-CA donne AAAA-MM-JJ ; on passe par les parts pour ne pas dépendre du séparateur.
  const p = Object.fromEntries(PARIS.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Enregistrements de l'API → périodes `{ titre, zone, debut, fin, anneeScolaire }` inclusives,
 * dédoublonnées (l'API répète une période par académie) et triées. L'API donne `end_date` à
 * minuit (Paris) du jour de la reprise : `fin` est donc la veille, dernier jour de vacances.
 */
export function parserVacances(enregistrements, zone) {
  const parCle = new Map();
  for (const r of enregistrements ?? []) {
    const debut = jourParis(r?.start_date);
    const finExclue = jourParis(r?.end_date);
    if (!debut || !finExclue || finExclue <= debut) continue; // ponts et bornes ponctuelles
    const fin = decalerJours(finExclue, -1);
    const titre = String(r.description ?? "Vacances");
    parCle.set(`${titre}|${debut}`, { titre, zone, debut, fin, anneeScolaire: String(r.annee_scolaire ?? "") });
  }
  return [...parCle.values()].sort((a, b) => a.debut.localeCompare(b.debut));
}

function urlPour(zone, depuisIso) {
  const u = new URL(URL_VACANCES);
  u.searchParams.set("where", `zones="${zone}" and end_date>date'${depuisIso}'`);
  u.searchParams.set("select", "description,start_date,end_date,annee_scolaire");
  u.searchParams.set("limit", "100");
  return u.toString();
}

function lireCache(stockage, zone) {
  try {
    const brut = stockage?.getItem(cleCache(zone));
    const v = brut ? JSON.parse(brut) : null;
    return v && Array.isArray(v.periodes) ? v : null;
  } catch { return null; }
}

/**
 * Périodes d'une zone : cache frais → tel quel ; sinon l'API, mise en cache ; si l'API échoue
 * et qu'un cache périmé existe, on le rend avec `perime: true` (l'écran le dit) ; sinon l'erreur
 * remonte — pas de liste vide silencieuse.
 */
export async function chargerVacances(zone, { fetchFn = globalThis.fetch, stockage = globalThis.localStorage,
  maintenant = Date.now(), aujourdhui = null } = {}) {
  if (!ZONES.includes(zone)) throw new Error(`Zone inconnue : ${zone}`);
  const cache = lireCache(stockage, zone);
  if (cache && maintenant - cache.quand < TTL_CACHE_MS) return { periodes: cache.periodes, perime: false };

  const auj = aujourdhui ?? new Date(maintenant);
  const depuis = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate() - RECUL_JOURS);
  const depuisIso = `${depuis.getFullYear()}-${String(depuis.getMonth() + 1).padStart(2, "0")}-${String(depuis.getDate()).padStart(2, "0")}`;
  try {
    const r = await fetchFn(urlPour(zone, depuisIso));
    if (!r.ok) throw new Error(`API vacances : HTTP ${r.status}`);
    const corps = await r.json();
    if (!Array.isArray(corps?.results)) throw new Error("API vacances : réponse sans `results`");
    const periodes = parserVacances(corps.results, zone);
    try { stockage?.setItem(cleCache(zone), JSON.stringify({ quand: maintenant, periodes })); } catch { /* stockage plein ou privé : on vit sans cache */ }
    return { periodes, perime: false };
  } catch (e) {
    if (cache) return { periodes: cache.periodes, perime: true };
    throw e;
  }
}
