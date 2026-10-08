// Règles PURES de l'écran Alertes (veille vols, D-056) : valeurs par défaut d'une alerte,
// lecture et contrôle du formulaire, résumé d'une ligne. Sans DOM ni réseau — testé dans
// tests/test_voyages.mjs. La table veille_alertes fait foi ; MaxVoyage la recopie chaque matin.

import { formatPeriode } from "../agenda/calendrier.js";
import { prixRond } from "./pepites.js";

export const JOURS = [[0, "Lun"], [1, "Mar"], [2, "Mer"], [3, "Jeu"], [4, "Ven"], [5, "Sam"], [6, "Dim"]];
export const ORIGINES = [["ORY", "Orly"], ["ORY,CDG", "Orly ou Roissy-CDG"]];
const IATA = /^[A-Z]{3}$/;

/** Réglages de départ selon le type : une semaine de vacances ou un week-end du vendredi. */
export function defautsType(type) {
  return type === "weekend"
    ? { nuits_min: 2, nuits_max: 2, marge_avant: 0, marge_apres: 0, jours_depart: [4], recherches_max: 40, directs_seulement: true }
    : { nuits_min: 7, nuits_max: 14, marge_avant: 2, marge_apres: 2, jours_depart: null, recherches_max: 8, directs_seulement: false };
}

/** Voyageurs d'une alerte neuve : ceux de la première alerte existante (la famille), sinon 2 adultes. */
export function voyageursParDefaut(alertes) {
  const a = alertes[0];
  return a ? { adultes: a.adultes, enfants_naissances: a.enfants_naissances } : { adultes: 2, enfants_naissances: [] };
}

const entier = (v, nom, min, max) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${nom} : un nombre entre ${min} et ${max}.`);
  return n;
};

/** Valeurs lues du formulaire (chaînes) → colonnes de veille_alertes. Lève un message lisible. */
export function valeursAlerte(lu) {
  if (!lu.nom) throw new Error("Donnez un nom au projet.");
  if (!lu.debut || !lu.fin) throw new Error("Les deux dates de la période sont obligatoires.");
  if (lu.fin < lu.debut) throw new Error("La fin de la période est avant son début.");
  const destinations = String(lu.destinations ?? "").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (!destinations.length) throw new Error("Ajoutez au moins une destination.");
  const inconnue = destinations.find((c) => !IATA.test(c));
  if (inconnue) throw new Error(`Destination inconnue : ${inconnue}.`);
  const nuits_min = entier(lu.nuits_min, "Nuits (au moins)", 1, 60);
  const nuits_max = entier(lu.nuits_max, "Nuits (au plus)", 1, 60);
  if (nuits_max < nuits_min) throw new Error("Le nombre de nuits maximum est plus petit que le minimum.");
  const prix = lu.prix_max == null ? null : Number(String(lu.prix_max).replace(",", ".").replace(/\s/g, ""));
  if (prix != null && !(prix >= 0)) throw new Error("Prix maximum : un montant en euros.");
  return {
    nom: lu.nom, type: lu.type === "weekend" ? "weekend" : "vacances",
    periode_libelle: lu.periode_libelle || lu.nom, debut: lu.debut, fin: lu.fin,
    marge_avant: entier(lu.marge_avant ?? 0, "Jours avant", 0, 14),
    marge_apres: entier(lu.marge_apres ?? 0, "Jours après", 0, 14),
    nuits_min, nuits_max,
    jours_depart: lu.jours_depart?.length ? [...lu.jours_depart].sort((a, b) => a - b) : null,
    origines: String(lu.origines || "ORY").split(","),
    destinations: [...new Set(destinations)],
    prix_max_pp_centimes: prix == null ? null : Math.round(prix * 100),
    directs_seulement: Boolean(lu.directs_seulement),
    recherches_max: entier(lu.recherches_max ?? 8, "Dates testées", 1, 120),
    active: Boolean(lu.active),
  };
}

/** « Salvador, Fortaleza, Recife +2 » : les villes d'abord, le code si MaxVoyage ne le connaît pas. */
export function villes(codes, nomDe, max = 3) {
  const noms = codes.map((c) => nomDe(c) ?? c);
  return noms.length > max ? `${noms.slice(0, max).join(", ")} +${noms.length - max}` : noms.join(", ");
}

/** Sous-titre d'une alerte dans la liste : période, nuits, villes, prix plafond. */
export function resumeAlerte(a, nomDe) {
  const nuits = a.nuits_min === a.nuits_max ? `${a.nuits_min} nuit${a.nuits_min > 1 ? "s" : ""}` : `${a.nuits_min} à ${a.nuits_max} nuits`;
  return [
    a.type === "weekend" ? `Week-ends ${formatPeriode(a.debut, a.fin)}` : `${a.periode_libelle} · ${formatPeriode(a.debut, a.fin)}`,
    nuits, villes(a.destinations, nomDe),
    a.prix_max_pp_centimes != null ? `bon plan sous ${prixRond(a.prix_max_pp_centimes)}/pers` : null,
    a.directs_seulement ? "directs" : null,
    a.active ? null : "en pause",
  ].filter(Boolean).join(" · ");
}
