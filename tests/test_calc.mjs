import assert from "node:assert/strict";
import { calculer, repartir, versCentimes } from "../frontend/calc.js";

// Cas réel : Comptes 2026, février. Doit TOUJOURS donner Yann -3 236,15 ±1 ct.
const chargesFevrier = [
  { id: 1, libelle: "Crédit", categorie: "Logement", regle: "egales" },
  { id: 2, libelle: "Assurance", categorie: "Logement", regle: "proport" },
];
const lignesFevrier = { 1: -159207, 2: -425271 };
const revenusFevrier = { Yann: 612000, Claudia: 454611 };
const rf = calculer(chargesFevrier, lignesFevrier, revenusFevrier);
assert.equal(rf.total, -584478);
assert.equal(rf.totaux.egales, -159207);
assert.equal(rf.parts.Yann + rf.parts.Claudia, rf.total, "somme des parts = total");
assert.ok(Math.abs(rf.parts.Yann - -323615) <= 1, `Yann ${rf.parts.Yann}`);
assert.ok(Math.abs(rf.parts.Claudia - -260863) <= 1, `Claudia ${rf.parts.Claudia}`);
assert.ok(Math.abs(rf.ratio.Yann - 0.57378) < 1e-4);

// Reste d'arrondi va au premier, somme exacte.
const p = repartir(-1001, { A: 1, B: 1 });
assert.equal(p.A + p.B, -1001);

// Revenus à zéro : pas de division par zéro, proport partagé à parts égales.
const chargesSimples = [
  { id: 1, libelle: "Crédit", categorie: "Logement", regle: "egales" },
  { id: 2, libelle: "Assurance", categorie: "Logement", regle: "proport" },
];
const z = calculer(chargesSimples, lignesFevrier, { Yann: 0, Claudia: 0 });
assert.equal(z.parts.Yann + z.parts.Claudia, z.total);

assert.equal(versCentimes("1 450,37"), 145037);
assert.throws(() => versCentimes("abc"));

// Règle 'cle' : part du 1er membre = cle_pct %.
const chargesCle = [{ id: 1, libelle: "Test clé", categorie: "Autre", regle: "cle", cle_pct: 70 }];
const rc = calculer(chargesCle, { 1: -10000 }, { Yann: 100000, Claudia: 100000 });
assert.equal(rc.partCle.Yann, -7000);
assert.equal(rc.partCle.Claudia, -3000);
assert.equal(rc.parts.Yann + rc.parts.Claudia, -10000);

// Règle 'perso' : payée par une seule personne, hors compte commun, impacte son reste à vivre.
const chargesPerso = [
  { id: 1, libelle: "Commun", categorie: "Logement", regle: "egales" },
  { id: 2, libelle: "Perso Yann", categorie: "Autre", regle: "perso", payeur: "Yann" },
];
const rp = calculer(chargesPerso, { 1: -10000, 2: -5000 }, { Yann: 200000, Claudia: 200000 });
assert.equal(rp.totalCommun, -10000, "perso exclu du total commun");
assert.equal(rp.total, -15000, "perso inclus dans le total global");
assert.equal(rp.reste.Yann, 200000 + rp.aVerser.Yann - 5000, "perso impacte le reste du payeur (dépense de 5000)");
assert.equal(rp.reste.Claudia, 200000 + rp.aVerser.Claudia, "perso n'impacte pas l'autre membre");

// Ajustements : transfèrent montant de 'de' vers 'vers'.
const chargesAdj = [{ id: 1, libelle: "Commun", categorie: "Logement", regle: "egales" }];
const ra = calculer(chargesAdj, { 1: -10000 }, { Yann: 200000, Claudia: 200000 },
  [{ de: "Yann", vers: "Claudia", montant_centimes: 1000 }]);
assert.equal(ra.aVerser.Yann, ra.parts.Yann + 1000);
assert.equal(ra.aVerser.Claudia, ra.parts.Claudia - 1000);
assert.equal(ra.aVerser.Yann + ra.aVerser.Claudia, ra.parts.Yann + ra.parts.Claudia, "ajustement neutre sur la somme");

// Totaux par catégorie.
const chargesCat = [
  { id: 1, libelle: "A", categorie: "Logement", regle: "egales" },
  { id: 2, libelle: "B", categorie: "Alimentation", regle: "proport" },
];
const rcat = calculer(chargesCat, { 1: -1000, 2: -2000 }, { Yann: 100000, Claudia: 100000 });
assert.equal(rcat.parCategorie.Logement, -1000);
assert.equal(rcat.parCategorie.Alimentation, -2000);

console.log("test_calc OK");
