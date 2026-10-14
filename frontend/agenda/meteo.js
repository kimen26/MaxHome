// Météo de la fiche voyage V3 (brief fiche-voyage-v3.md) : Open-Meteo, plusieurs modèles, un
// verdict honnête. Synthèse et position PURES ; `chargerMeteo` est le seul endroit qui fait
// `fetch`. Testé dans tests/test_planning.mjs.
import { joursDuVoyage, ajouterJours, couvreNuit } from "./planning.js";

export const MODELES_METEO = ["meteofrance_seamless", "ecmwf_ifs025", "gfs_seamless", "icon_seamless"];
const URL_METEO = "https://api.open-meteo.com/v1/forecast";
const SEUIL_PLUIE_MM = 1;
const PORTEE_JOURS = 15;
const TTL_CACHE_MS = 3 * 3600 * 1000;
const PRECISION = 100; // arrondi à 0,01°

/** Table WMO courte : [code max inclus, icône, mot]. */
const WMO = [[1, "☀️", "Beau"], [2, "⛅", "Éclaircies"], [3, "☁️", "Couvert"], [48, "🌫️", "Brouillard"],
  [57, "🌦️", "Bruine"], [67, "🌧️", "Pluie"], [77, "❄️", "Neige"], [82, "🌦️", "Averses"], [99, "⛈️", "Orage"]];

const iconeDe = (code) => WMO.find(([max]) => code <= max) ?? WMO[WMO.length - 1];

function mediane(valeurs) {
  const v = [...valeurs].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Code météo majoritaire (par famille d'icône) ; à égalité, le plus sévère (code le plus haut). */
function codeMajoritaire(codes) {
  const familles = new Map();
  for (const c of codes) {
    const cle = iconeDe(c)[2];
    familles.set(cle, [...(familles.get(cle) ?? []), c]);
  }
  const [gagnants] = [...familles.values()]
    .sort((a, b) => b.length - a.length || Math.max(...b) - Math.max(...a));
  return Math.max(...gagnants);
}

/**
 * Synthèse par jour d'une réponse Open-Meteo multi-modèles (champs suffixés par modèle ; null =
 * modèle muet, exclu). Jour sans aucun modèle → absent.
 * → Map jour → { jour, min, max, mm, nbPluie, nbModeles, verdict: "pluie"|"sec"|"incertain", icone, mot }
 */
export function syntheseMeteo(reponse, modeles = MODELES_METEO) {
  const d = reponse.daily;
  const resultat = new Map();
  d.time.forEach((jour, i) => {
    const val = (champ) => modeles.map((m) => d[`${champ}_${m}`]?.[i]).filter((x) => x != null);
    const pluies = val("precipitation_sum");
    if (!pluies.length) return;
    const nbPluie = pluies.filter((p) => p >= SEUIL_PLUIE_MM).length;
    const codes = val("weather_code");
    const [, icone, mot] = iconeDe(codes.length ? codeMajoritaire(codes) : 3);
    const verdict = nbPluie >= Math.ceil((2 * pluies.length) / 3) && nbPluie > 0 ? "pluie"
      : nbPluie === 0 ? "sec" : "incertain";
    resultat.set(jour, {
      jour, min: mediane(val("temperature_2m_min")), max: mediane(val("temperature_2m_max")),
      mm: mediane(pluies), nbPluie, nbModeles: pluies.length, verdict, icone, mot,
    });
  });
  return resultat;
}

/** Texte affiché d'une synthèse : « 🌧️ Pluie · 8° à 12° · 15 mm · 4 modèles sur 4 ». */
export function libelleMeteo(s, totalModeles = MODELES_METEO.length) {
  const modeles = `${s.nbModeles} modèles sur ${totalModeles}`;
  if (s.verdict === "sec") return `Sec · ${modeles}`;
  if (s.verdict === "incertain") return `Pluie possible · ${modeles}`;
  return `${s.icone} ${s.mot} · ${Math.round(s.min)}° à ${Math.round(s.max)}° · ${Math.round(s.mm)} mm · ${modeles}`;
}

/** Position de la météo d'un jour : le lieu lié à la résa logement de la nuit, sinon le
 *  barycentre des lieux localisés (hors écartés) ; null si rien de localisé. */
export function positionMeteo(jour, lieux, resas) {
  const nuit = resas.find((r) => couvreNuit(r, jour) && r.lieu_id);
  const lieuNuit = nuit && lieux.find((l) => l.id === nuit.lieu_id);
  if (lieuNuit?.lat != null && lieuNuit?.lng != null) return { lat: lieuNuit.lat, lng: lieuNuit.lng };
  const places = lieux.filter((l) => l.statut !== "ecarte" && l.lat != null && l.lng != null);
  if (!places.length) return null;
  const moy = (champ) => places.reduce((s, l) => s + l[champ], 0) / places.length;
  return { lat: moy("lat"), lng: moy("lng") };
}

const arrondi = (x) => Math.round(x * PRECISION) / PRECISION;

function lireCache(cle) {
  try {
    const brut = JSON.parse(sessionStorage.getItem(cle));
    return brut && Date.now() - brut.t < TTL_CACHE_MS ? brut.data : null;
  } catch { return null; } // stockage absent ou illisible : on refetch
}

function ecrireCache(cle, data) {
  try { sessionStorage.setItem(cle, JSON.stringify({ t: Date.now(), data })); } catch { /* stockage absent : pas de cache */ }
}

async function recupererGroupe(lat, lng, debut, fin) {
  const cle = `meteo:${lat},${lng}:${debut}:${fin}`;
  const cache = lireCache(cle);
  if (cache) return cache;
  const params = new URLSearchParams({
    latitude: lat, longitude: lng, daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
    models: MODELES_METEO.join(","), timezone: "Europe/Paris", start_date: debut, end_date: fin,
  });
  const rep = await fetch(`${URL_METEO}?${params}`);
  if (!rep.ok) throw new Error(`Open-Meteo HTTP ${rep.status}`);
  const data = [...syntheseMeteo(await rep.json()).values()];
  ecrireCache(cle, data);
  return data;
}

/**
 * Météo des jours du voyage compris entre `aujourdHui` et +15 jours (les autres : rien).
 * Un appel par position arrondie. Échec → console.error et jours de ce groupe absents.
 * → Map jour → synthèse
 */
export async function chargerMeteo(voyage, lieux, resas, aujourdHui) {
  const limite = ajouterJours(aujourdHui, PORTEE_JOURS);
  const groupes = new Map();
  for (const jour of joursDuVoyage(voyage).filter((j) => j >= aujourdHui && j <= limite)) {
    const pos = positionMeteo(jour, lieux, resas);
    if (!pos) continue;
    const cle = `${arrondi(pos.lat)},${arrondi(pos.lng)}`;
    groupes.set(cle, [...(groupes.get(cle) ?? []), jour]);
  }
  const meteo = new Map();
  for (const [cle, jours] of groupes) {
    const [lat, lng] = cle.split(",");
    try {
      for (const s of await recupererGroupe(lat, lng, jours[0], jours[jours.length - 1])) {
        if (jours.includes(s.jour)) meteo.set(s.jour, s);
      }
    } catch (e) {
      console.error("Météo indisponible", e);
    }
  }
  return meteo;
}
