// Règles pures de l'écran Pépites (frontend/voyages/pepites.js). Lancer : node tests/test_voyages.mjs
import assert from "node:assert/strict";
import { ageReleve, libelleReleve, releveAncien, prixRond, duree, ligneVol, reperesOffre, nbBonsPlans,
  PERIME_APRES_JOURS } from "../frontend/voyages/pepites.js";
import { defautsType, voyageursParDefaut, valeursAlerte, villes, resumeAlerte } from "../frontend/voyages/alertes.js";

let n = 0;
// Les libellés portent des espaces insécables (pas de coupure à 320 px) : on compare en clair.
const clair = (s) => s.replace(/[\u00a0\u202f]/g, " ");
const test = (nom, f) => { f(); n += 1; console.log(`ok ${n} - ${nom}`); };

test("âge du relevé en jours, jamais négatif", () => {
  assert.equal(ageReleve("2026-10-07", "2026-10-07"), 0);
  assert.equal(ageReleve("2026-10-06", "2026-10-07"), 1);
  assert.equal(ageReleve("2026-09-30", "2026-10-07"), 7);
  assert.equal(ageReleve("2026-10-08", "2026-10-07"), 0);
});

test("libellé du relevé : aujourd'hui, hier, il y a n jours", () => {
  assert.equal(libelleReleve("2026-10-07", "2026-10-07"), "Prix relevés aujourd’hui");
  assert.equal(libelleReleve("2026-10-06", "2026-10-07"), "Prix relevés hier");
  assert.equal(libelleReleve("2026-10-04", "2026-10-07"), "Prix relevés il y a 3 jours");
});

test(`relevé ancien au-delà de ${PERIME_APRES_JOURS} jours`, () => {
  assert.equal(releveAncien("2026-10-05", "2026-10-07"), false);
  assert.equal(releveAncien("2026-10-04", "2026-10-07"), true);
});

test("prix arrondi à l'euro, séparateur de milliers français", () => {
  assert.equal(clair(prixRond(19600)), "196 €");
  assert.equal(clair(prixRond(62467)), "625 €");
  assert.equal(clair(prixRond(124567)), "1 246 €");
});

test("durée en heures et minutes", () => {
  assert.equal(clair(duree(195)), "3 h 15");
  assert.equal(clair(duree(120)), "2 h");
  assert.equal(clair(duree(65)), "1 h 05");
  assert.equal(duree(null), "");
});

test("ligne du vol : direct ou escales, compagnies, durée", () => {
  assert.equal(clair(ligneVol({ escales: 0, compagnies: ["Transavia"], duree_aller_min: 195 })), "Direct · Transavia · 3 h 15");
  assert.equal(ligneVol({ escales: 2, compagnies: [], duree_aller_min: null }), "2 escales");
});

test("repères : bon plan, baisse chiffrée, nouveau — chacun avec son texte", () => {
  assert.deepEqual(reperesOffre({ sous_seuil: true, tendance: "baisse", baisse_pp_centimes: 4267 }).map((r) => clair(r.texte)),
    ["✓ Bon plan", "↓ 43 € depuis hier"]);
  assert.deepEqual(reperesOffre({ sous_seuil: false, tendance: "nouveau" }).map((r) => r.texte), ["Nouveau"]);
  assert.deepEqual(reperesOffre({ sous_seuil: false, tendance: null }), []);
});

test("nombre de bons plans sur tout l'instantané, instantané absent compris", () => {
  const contenu = { periodes: [{ offres: [{ sous_seuil: true }, { sous_seuil: false }] }, { offres: [{ sous_seuil: true }] }] };
  assert.equal(nbBonsPlans(contenu), 2);
  assert.equal(nbBonsPlans(undefined), 0);
});

// ---------- alertes (D-056) ----------
const saisie = (surcharges = {}) => ({
  nom: "Février au soleil", type: "vacances", periode_libelle: "Vacances d'Hiver", debut: "2027-02-06", fin: "2027-02-22",
  marge_avant: "2", marge_apres: "2", nuits_min: "7", nuits_max: "14", jours_depart: [], origines: "ORY,CDG",
  destinations: "lis, OPO,LIS", prix_max: "300,50", directs_seulement: false, recherches_max: "8", active: true, ...surcharges,
});

test("saisie d'alerte → colonnes : codes en majuscules dédoublonnés, prix en centimes, origines en liste", () => {
  const v = valeursAlerte(saisie());
  assert.deepEqual(v.destinations, ["LIS", "OPO"]);
  assert.equal(v.prix_max_pp_centimes, 30050);
  assert.deepEqual(v.origines, ["ORY", "CDG"]);
  assert.equal(v.jours_depart, null);
  assert.equal(v.nuits_min, 7);
  assert.equal(v.type, "vacances");
});

test("saisie d'alerte : jours triés, prix vide = pas de seuil, libellé par défaut = nom", () => {
  const v = valeursAlerte(saisie({ jours_depart: [4, 2], prix_max: null, periode_libelle: null }));
  assert.deepEqual(v.jours_depart, [2, 4]);
  assert.equal(v.prix_max_pp_centimes, null);
  assert.equal(v.periode_libelle, "Février au soleil");
});

test("saisie d'alerte refusée avec un message lisible", () => {
  assert.throws(() => valeursAlerte(saisie({ destinations: "" })), /au moins une destination/);
  assert.throws(() => valeursAlerte(saisie({ destinations: "Lisbonne" })), /Destination inconnue/);
  assert.throws(() => valeursAlerte(saisie({ fin: "2027-02-01" })), /avant son début/);
  assert.throws(() => valeursAlerte(saisie({ nuits_min: "10", nuits_max: "7" })), /plus petit que le minimum/);
  assert.throws(() => valeursAlerte(saisie({ nom: null })), /nom/);
  assert.throws(() => valeursAlerte(saisie({ recherches_max: "500" })), /entre 1 et 120/);
});

test("défauts par type : week-end du vendredi en 2 nuits, vacances de 7 à 14 nuits", () => {
  assert.deepEqual(defautsType("weekend").jours_depart, [4]);
  assert.equal(defautsType("weekend").nuits_max, 2);
  assert.equal(defautsType("vacances").nuits_min, 7);
});

test("voyageurs d'une alerte neuve : ceux de la famille, sinon 2 adultes", () => {
  assert.deepEqual(voyageursParDefaut([{ adultes: 2, enfants_naissances: ["2022-01-01"] }]), { adultes: 2, enfants_naissances: ["2022-01-01"] });
  assert.deepEqual(voyageursParDefaut([]), { adultes: 2, enfants_naissances: [] });
});

test("villes et résumé d'alerte lisibles, code brut si l'aéroport est inconnu", () => {
  const nomDe = (c) => ({ LIS: "Lisbonne", OPO: "Porto", MAD: "Madrid" }[c] ?? null);
  assert.equal(villes(["LIS", "OPO", "MAD", "XYZ"], nomDe), "Lisbonne, Porto, Madrid +1");
  const r = clair(resumeAlerte({ type: "vacances", periode_libelle: "Vacances d'Hiver", debut: "2027-02-06", fin: "2027-02-22",
    nuits_min: 7, nuits_max: 14, destinations: ["LIS", "XYZ"], prix_max_pp_centimes: 30000, directs_seulement: true, active: false }, nomDe));
  assert.match(r, /^Vacances d'Hiver · /);
  assert.match(r, /7 à 14 nuits · Lisbonne, XYZ · bon plan sous 300 €\/pers · directs · en pause$/);
});

console.log(`${n} tests OK`);
