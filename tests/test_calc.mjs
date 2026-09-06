import assert from "node:assert/strict";
import { calculer, repartir, versCentimes, montantLigne, regleEffective, montantTheorique } from "../frontend/budget/calc.js";

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

// Règle du mois : lignes au format objet, `regle` surcharge celle de la charge.
const chargesRegle = [{ id: 1, libelle: "Alimentation", categorie: "Alimentation", regle: "egales" }];
const revDeuxTiers = { Yann: 200000, Claudia: 100000 };
const parDefaut = calculer(chargesRegle, { 1: { montant_centimes: -30000 } }, revDeuxTiers);
assert.equal(parDefaut.totaux.egales, -30000, "sans regle de mois, la charge garde la sienne");
assert.equal(parDefaut.parts.Yann, -15000, "egales = moitie chacun");

const surchargee = calculer(chargesRegle, { 1: { montant_centimes: -30000, regle: "proport" } }, revDeuxTiers);
assert.equal(surchargee.totaux.egales, 0, "la regle du mois retire la charge des egales");
assert.equal(surchargee.totaux.proport, -30000);
assert.equal(surchargee.parts.Yann, -20000, "prorata 2/3 pour Yann");

// La surcharge vaut aussi pour 'cle' et 'perso'.
const versCle = calculer([{ id: 1, libelle: "X", categorie: "Autre", regle: "egales", cle_pct: 80 }],
  { 1: { montant_centimes: -10000, regle: "cle" } }, { Yann: 100000, Claudia: 100000 });
assert.equal(versCle.partCle.Yann, -8000, "cle_pct de la charge s'applique a la regle du mois");

const versPerso = calculer([{ id: 1, libelle: "X", categorie: "Autre", regle: "egales", payeur: "Yann" }],
  { 1: { montant_centimes: -5000, regle: "perso" } }, { Yann: 200000, Claudia: 200000 });
assert.equal(versPerso.totalCommun, 0, "passee en perso, la charge sort du commun");
assert.equal(versPerso.reste.Yann, 195000);

// Format ancien (nombre nu) et nouveau (objet) donnent le meme resultat.
const ancien = calculer(chargesFevrier, lignesFevrier, revenusFevrier);
const nouveau = calculer(chargesFevrier, { 1: { montant_centimes: -159207 }, 2: { montant_centimes: -425271 } }, revenusFevrier);
assert.deepEqual(nouveau.parts, ancien.parts, "les deux formats de lignes sont equivalents");

assert.equal(montantLigne(-500), -500);
assert.equal(montantLigne({ montant_centimes: -500 }), -500);
assert.equal(montantLigne(undefined), 0);
assert.equal(regleEffective({ regle: "egales" }, { regle: "proport" }), "proport");
assert.equal(regleEffective({ regle: "egales" }, { regle: null }), "egales");
assert.equal(regleEffective({ regle: "egales" }, -500), "egales");

// montantTheorique : fixe / suit une charge / part d'une personne ; mode inconnu = erreur.
const contexte = { lignes: { 7: { montant_centimes: -12345, regle: null } }, resultat: { aVerser: { Yann: -323615 } } };
assert.equal(montantTheorique(null, contexte), null, "ponctuel : pas de théorique");
assert.equal(montantTheorique({ mode: "fixe", montant_centimes: 5000 }, contexte), 5000);
assert.equal(montantTheorique({ mode: "charge", charge_id: 7 }, contexte), -12345);
assert.equal(montantTheorique({ mode: "charge", charge_id: 99 }, contexte), 0, "charge sans montant ce mois");
assert.equal(montantTheorique({ mode: "part", prenom_part: "Yann" }, contexte), 323615, "part = virement positif");
assert.throws(() => montantTheorique({ mode: "??" }, contexte), /inconnu/);

console.log("test_calc OK");
