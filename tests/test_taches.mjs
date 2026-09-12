import assert from "node:assert/strict";
import { echeance, occurrencesManquantes, groupe, trier, balance, jourIso, decalerJours, perimees,
  ECHELLE_QUART, partsTexte, parts, partsDe, creditDe } from "../frontend/taches/taches.js";
import { suivante } from "../frontend/socle/blocs-cycle.js";

// Échéances : 2026-09-06 est un dimanche.
assert.equal(echeance("quotidien", "2026-09-06"), "2026-09-06");
assert.equal(echeance("hebdo", "2026-09-06"), "2026-09-06", "un dimanche est sa propre fin de semaine");
assert.equal(echeance("hebdo", "2026-09-07"), "2026-09-13", "lundi -> dimanche suivant");
assert.equal(echeance("hebdo", "2026-09-12"), "2026-09-13");
assert.equal(echeance("mensuel", "2026-02-10"), "2026-02-28");
assert.equal(echeance("mensuel", "2028-02-10"), "2028-02-29");
assert.equal(echeance("au_besoin", "2026-09-06"), null);
assert.equal(decalerJours("2026-12-31", 1), "2027-01-01");
assert.equal(jourIso(new Date(2026, 8, 6, 23, 30)), "2026-09-06", "date locale, pas UTC");

// Occurrences : 2 biberons par jour, une machine par semaine, la poubelle jamais générée.
const recurrents = [
  { id: 1, titre: "Biberons", categorie: "Enfant", frequence: "quotidien", fois: 2, penibilite: 1, importance: 3, actif: true, attribue_a: null, parts_quart: 4, obligatoire: true },
  { id: 2, titre: "Machine", categorie: "Linge", frequence: "hebdo", fois: 1, penibilite: 1, importance: 2, actif: true, attribue_a: "Yann", parts_quart: 4, obligatoire: false },
  { id: 3, titre: "Poubelle", categorie: "Déchets", frequence: "au_besoin", fois: 1, penibilite: 3, importance: 2, actif: true, parts_quart: 12, obligatoire: true },
  { id: 4, titre: "Inactive", categorie: "Ménage", frequence: "quotidien", fois: 1, penibilite: 1, importance: 1, actif: false, parts_quart: 4, obligatoire: false },
];
const m = occurrencesManquantes(recurrents, [], "2026-09-07");
assert.deepEqual(m.map((t) => [t.recurrent_id, t.echeance, t.rang, t.qui]),
  [[1, "2026-09-07", 1, null], [1, "2026-09-07", 2, null], [2, "2026-09-13", 1, "Yann"]]);
const dejaLa = [{ recurrent_id: 1, echeance: "2026-09-07", rang: 1 }, { recurrent_id: 2, echeance: "2026-09-13", rang: 1 }];
assert.deepEqual(occurrencesManquantes(recurrents, dejaLa, "2026-09-07").map((t) => t.rang), [2], "seul le 2e biberon manque");
assert.equal(occurrencesManquantes(recurrents, m, "2026-09-07").length, 0, "idempotent");

// Groupes et tri.
const jour = "2026-09-07";
assert.equal(groupe({ echeance: "2026-09-06" }, jour), "retard");
assert.equal(groupe({ echeance: "2026-09-07" }, jour), "aujourdhui");
assert.equal(groupe({ echeance: "2026-09-13" }, jour), "semaine");
assert.equal(groupe({ echeance: "2026-09-30" }, jour), "mois");
const tries = trier([
  { id: 10, recurrent_id: 2, echeance: "2026-09-07", rang: 1, fait_le: null },       // non obligatoire
  { id: 11, recurrent_id: 1, echeance: "2026-09-07", rang: 2, fait_le: null },       // obligatoire, non faite
  { id: 12, recurrent_id: 1, echeance: "2026-09-07", rang: 1, fait_le: null },       // obligatoire, non faite
  { id: 13, recurrent_id: 3, echeance: "2026-09-06", rang: 1, fait_le: "2026-09-06T10:00:00Z" }, // échéance plus tôt
], recurrents);
assert.deepEqual(tries.map((t) => t.id), [13, 12, 11, 10],
  "échéance d'abord, puis obligatoire non fait avant le reste à cadence égale, puis rang");
const trieFaite = trier([
  { id: 21, recurrent_id: 2, echeance: "2026-09-07", rang: 1, fait_le: null },                    // non obligatoire, pas faite
  { id: 20, recurrent_id: 3, echeance: "2026-09-07", rang: 1, fait_le: "2026-09-07T08:00:00Z" },  // obligatoire mais déjà faite, id plus petit
], recurrents);
assert.deepEqual(trieFaite.map((t) => t.id), [20, 21],
  "obligatoire déjà faite ne trie plus par obligatoire : à égalité, l'ordre stable retombe sur id");

// Balance sur 7 jours : seules les tâches faites, dans la fenêtre, comptent. Valeurs en quarts.
const recBalance = [
  { id: 1, obligatoire: false },
  { id: 2, obligatoire: false },
  { id: 3, obligatoire: true },
];
const faites = [
  { recurrent_id: 1, qui: "Yann", qui2: null, parts_quart: 12, categorie: "Cuisine", fait_le: new Date(2026, 8, 5, 20).toISOString() },
  { recurrent_id: 2, qui: "Claudia", qui2: null, parts_quart: 16, categorie: "Linge", fait_le: new Date(2026, 8, 6, 9).toISOString() },
  { recurrent_id: 1, qui: "Claudia", qui2: null, parts_quart: 4, categorie: "Cuisine", fait_le: new Date(2026, 8, 6, 12).toISOString() },
  { recurrent_id: 3, qui: "Yann", qui2: null, parts_quart: 20, categorie: "Ménage", fait_le: new Date(2026, 7, 1).toISOString() },  // hors fenêtre
  { recurrent_id: 3, qui: "Yann", qui2: null, parts_quart: 20, categorie: "Ménage", fait_le: null },                                // pas faite
];
const b = balance(faites, recBalance, ["Claudia", "Yann"], "2026-08-31", "2026-09-06");
assert.deepEqual(b.parts, { Claudia: 20, Yann: 12 });
assert.equal(b.total, 32);
assert.ok(Math.abs(b.ratio.Claudia - 0.625) < 1e-9);
assert.deepEqual(b.parCategorie.Cuisine, { Claudia: 4, Yann: 12 });
const vide = balance([], recBalance, ["Claudia", "Yann"], "2026-08-31", "2026-09-06");
assert.equal(vide.ratio.Claudia, 0.5, "sans tâche, moitié-moitié");

// balance à deux : les deux personnes créditées, total conservé.
const aDeux = [
  { recurrent_id: 1, qui: "Yann", qui2: "Claudia", parts_quart: 8, categorie: "Cuisine", fait_le: new Date(2026, 8, 6, 18).toISOString() },
];
const bDeux = balance(aDeux, recBalance, ["Claudia", "Yann"], "2026-08-31", "2026-09-06");
assert.deepEqual(bDeux.parts, { Claudia: 4, Yann: 4 }, "0,5 + 0,5 = la base, divisée exactement");
assert.equal(bDeux.total, 8, "le total est conservé, jamais multiplié par le partage à deux");

// balance({obligatoireSeul: true}) sur un jeu mixte : n'agrège que les récurrents obligatoires.
const mixte = [
  { recurrent_id: 1, qui: "Yann", qui2: null, parts_quart: 12, categorie: "Cuisine", fait_le: new Date(2026, 8, 6, 8).toISOString() },   // non obligatoire
  { recurrent_id: 3, qui: "Claudia", qui2: null, parts_quart: 20, categorie: "Ménage", fait_le: new Date(2026, 8, 6, 9).toISOString() }, // obligatoire
];
const bOblig = balance(mixte, recBalance, ["Claudia", "Yann"], "2026-08-31", "2026-09-06", { obligatoireSeul: true });
assert.deepEqual(bOblig.parts, { Claudia: 20, Yann: 0 }, "seule la tâche du récurrent obligatoire compte");
assert.equal(bOblig.total, 20);

// Occurrence cochée puis barème changé : le crédit figé (taches.parts_quart) ne bouge pas
// même si le récurrent est modifié après coup.
const recModifie = [{ id: 1, obligatoire: false, parts_quart: 32 }]; // barème changé après la coche
const ancienneCoche = [
  { recurrent_id: 1, qui: "Yann", qui2: null, parts_quart: 4, categorie: "Cuisine", fait_le: new Date(2026, 8, 6, 8).toISOString() },
];
const bFige = balance(ancienneCoche, recModifie, ["Claudia", "Yann"], "2026-08-31", "2026-09-06");
assert.deepEqual(bFige.parts, { Claudia: 0, Yann: 4 }, "la balance passée lit taches.parts_quart, pas le récurrent courant");

// Les dix cas de logique-metier.md §10, littéralement (L-007 : un cas du brief non testé
// littéralement est un bug qui dort).
assert.equal(partsDe({ parts_quart: 8, ecart_prenom: null }, "Yann"), 8, "2 parts");
assert.equal(partsDe({ parts_quart: 8, ecart_prenom: "Claudia" }, "Claudia"), 12, "3 parts");
assert.equal(partsDe({ parts_quart: 8, ecart_prenom: "Claudia" }, "Yann"), 8, "2 parts, l'écart n'est pas pour Yann");
assert.equal(partsDe({ parts_quart: 32, ecart_prenom: "Yann" }, "Yann"), 32, "plafond de l'échelle");
assert.deepEqual(creditDe({ parts_quart: 8 }, { qui: "Yann", qui2: "Claudia" }), { Yann: 4, Claudia: 4 }, "1 + 1");
assert.deepEqual(creditDe({ parts_quart: 2 }, { qui: "Yann", qui2: "Claudia" }), { Yann: 1, Claudia: 1 },
  "0,25 + 0,25 — exact grâce aux quarts");
assert.deepEqual(creditDe({ parts_quart: 8, ecart_prenom: "Claudia" }, { qui: "Claudia", qui2: "Yann" }),
  { Claudia: 4, Yann: 4 }, "l'écart ne s'applique pas à deux");
// balance(..., {obligatoireSeul: true}) et « barème modifié après coche » : voir bOblig et bFige ci-dessus.
assert.equal(partsTexte(2), "0,5");
assert.equal(partsTexte(6), "1,5");
assert.equal(partsTexte(32), "8");

// parts() : accord singulier/pluriel, comme pts().
assert.equal(parts(2), "0,5 part");
assert.equal(parts(4), "1 part");
assert.equal(parts(6), "1,5 part", "en français, 1,5 reste au singulier");
assert.equal(parts(8), "2 parts", "le pluriel commence à 2");
assert.equal(parts(32), "8 parts");
assert.deepEqual(ECHELLE_QUART, [2, 4, 8, 12, 20, 32]);

// creditDe sur une tâche non cochée (qui null) : objet vide, aucun crédit à tort.
assert.deepEqual(creditDe({ parts_quart: 8 }, { qui: null, qui2: null }), {});

// Périmées : avant-hier non faite part, hier reste (en retard), faite reste, hors liste reste.
const p = perimees([
  { id: 1, recurrent_id: 1, echeance: "2026-09-04", fait_le: null },
  { id: 2, recurrent_id: 1, echeance: "2026-09-05", fait_le: null },
  { id: 3, recurrent_id: 1, echeance: "2026-09-01", fait_le: "2026-09-01T10:00:00Z" },
  { id: 4, recurrent_id: null, echeance: "2026-09-01", fait_le: null },
], "2026-09-06");
assert.deepEqual(p.map((t) => t.id), [1]);

// Bouton-cycle (blocs-cycle.js) : tap = valeur suivante, en boucle.
const ECHELLE = [0.5, 1, 2, 3, 5, 8];
assert.equal(suivante(ECHELLE, 1), 2, "cycle normal");
assert.equal(suivante(ECHELLE, 8), 0.5, "retour au début après la dernière valeur");
const ECART = [null, "Claudia", "Yann"];
assert.equal(suivante(ECART, null), "Claudia", "null est une valeur légitime du cycle");
assert.equal(suivante(ECART, "Claudia"), "Yann");
assert.equal(suivante(ECART, "Yann"), null, "boucle jusqu'à null");
assert.equal(suivante(ECHELLE, 99), 0.5, "valeur absente de la liste -> première valeur");

console.log("test_taches OK");
