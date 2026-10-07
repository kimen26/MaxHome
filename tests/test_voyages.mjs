// Règles pures de l'écran Pépites (frontend/voyages/pepites.js). Lancer : node tests/test_voyages.mjs
import assert from "node:assert/strict";
import { ageReleve, libelleReleve, releveAncien, prixRond, duree, ligneVol, reperesOffre, nbBonsPlans,
  PERIME_APRES_JOURS } from "../frontend/voyages/pepites.js";

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

console.log(`${n} tests OK`);
