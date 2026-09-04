import assert from "node:assert/strict";
import { calculer, repartir, versCentimes } from "../frontend/calc.js";

// Cas réel : Comptes 2026, février.
const charges = [
  { id: 1, libelle: "Crédit", type: "egales" },
  { id: 2, libelle: "Assurance", type: "proport" },
];
const lignes = { 1: -159207, 2: -425271 };
const revenus = { Yann: 612000, Claudia: 454611 };
const r = calculer(charges, lignes, revenus);
assert.equal(r.total, -584478);
assert.equal(r.totaux.egales, -159207);
assert.equal(r.parts.Yann + r.parts.Claudia, r.total, "somme des parts = total");
assert.ok(Math.abs(r.parts.Yann - -323615) <= 1, `Yann ${r.parts.Yann}`);
assert.ok(Math.abs(r.parts.Claudia - -260863) <= 1, `Claudia ${r.parts.Claudia}`);
assert.ok(Math.abs(r.ratio.Yann - 0.57378) < 1e-4);

// Reste d'arrondi va au premier, somme exacte.
const p = repartir(-1001, { A: 1, B: 1 });
assert.equal(p.A + p.B, -1001);

// Revenus à zéro : pas de division par zéro, proport partagé à parts égales.
const z = calculer(charges, lignes, { Yann: 0, Claudia: 0 });
assert.equal(z.parts.Yann + z.parts.Claudia, z.total);

assert.equal(versCentimes("1 450,37"), 145037);
assert.throws(() => versCentimes("abc"));
console.log("test_calc OK");
