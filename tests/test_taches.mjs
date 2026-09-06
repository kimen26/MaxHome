import assert from "node:assert/strict";
import { echeance, occurrencesManquantes, groupe, trier, balance, jourIso, decalerJours, perimees } from "../frontend/taches.js";

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
  { id: 1, titre: "Biberons", categorie: "Enfant", frequence: "quotidien", fois: 2, penibilite: 1, importance: 3, actif: true, attribue_a: null },
  { id: 2, titre: "Machine", categorie: "Linge", frequence: "hebdo", fois: 1, penibilite: 1, importance: 2, actif: true, attribue_a: "Yann" },
  { id: 3, titre: "Poubelle", categorie: "Déchets", frequence: "au_besoin", fois: 1, penibilite: 3, importance: 2, actif: true },
  { id: 4, titre: "Inactive", categorie: "Ménage", frequence: "quotidien", fois: 1, penibilite: 1, importance: 1, actif: false },
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
  { id: 10, recurrent_id: 2, echeance: "2026-09-13", rang: 1 },
  { id: 11, recurrent_id: 1, echeance: "2026-09-07", rang: 2 },
  { id: 12, recurrent_id: 1, echeance: "2026-09-07", rang: 1 },
], recurrents);
assert.deepEqual(tries.map((t) => t.id), [12, 11, 10], "importance 3 avant 2, rang 1 avant 2");

// Balance sur 7 jours : seules les tâches faites, dans la fenêtre, comptent.
const faites = [
  { qui: "Yann", points: 3, categorie: "Cuisine", fait_le: new Date(2026, 8, 5, 20).toISOString() },
  { qui: "Claudia", points: 4, categorie: "Linge", fait_le: new Date(2026, 8, 6, 9).toISOString() },
  { qui: "Claudia", points: 1, categorie: "Cuisine", fait_le: new Date(2026, 8, 6, 12).toISOString() },
  { qui: "Yann", points: 5, categorie: "Ménage", fait_le: new Date(2026, 7, 1).toISOString() },  // hors fenêtre
  { qui: "Yann", points: 5, categorie: "Ménage", fait_le: null },                                 // pas faite
];
const b = balance(faites, ["Claudia", "Yann"], "2026-08-31", "2026-09-06");
assert.deepEqual(b.points, { Claudia: 5, Yann: 3 });
assert.equal(b.total, 8);
assert.ok(Math.abs(b.ratio.Claudia - 0.625) < 1e-9);
assert.deepEqual(b.parCategorie.Cuisine, { Claudia: 1, Yann: 3 });
const vide = balance([], ["Claudia", "Yann"], "2026-08-31", "2026-09-06");
assert.equal(vide.ratio.Claudia, 0.5, "sans tâche, moitié-moitié");

// Périmées : avant-hier non faite part, hier reste (en retard), faite reste, hors liste reste.
const p = perimees([
  { id: 1, recurrent_id: 1, echeance: "2026-09-04", fait_le: null },
  { id: 2, recurrent_id: 1, echeance: "2026-09-05", fait_le: null },
  { id: 3, recurrent_id: 1, echeance: "2026-09-01", fait_le: "2026-09-01T10:00:00Z" },
  { id: 4, recurrent_id: null, echeance: "2026-09-01", fait_le: null },
], "2026-09-06");
assert.deepEqual(p.map((t) => t.id), [1]);

console.log("test_taches OK");
