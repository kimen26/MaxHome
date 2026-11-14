// Module Proches : jours libres, raccourcis de période, validation, classement des réponses.
// Dates fixes injectées (2026-11-14 est un samedi) : aucun test ne dépend du jour où il tourne.
import assert from "node:assert/strict";
import { joursLibres, feriesDePeriode, erreurPeriode, periodeCeWeekEnd, periodeQuatreWeekEnds,
  periodeCeMois, JOURS_MAX } from "../frontend/proches/jours-libres.js";
import { champsSondage, classerReponses, lienSondage, TITRE_MAX, MESSAGE_MAX } from "../frontend/proches/suivi.js";

// Données FICTIVES, avec des titres reconnaissables pour prouver qu'ils ne sortent jamais.
const GOOGLE = [
  { id: "g1", titre: "SECRET-rendez-vous-medical", debut: "2026-11-16", fin: "2026-11-16", heureDebut: "10:00", heureFin: "11:00" },
  { id: "g2", titre: "SECRET-sejour-cousins", debut: "2026-11-18", fin: "2026-11-19" },
  { id: "g3", titre: "Claudia télétravail", debut: "2026-11-17", fin: "2026-11-17" },
];
const VOYAGES = [{ id: 1, titre: "SECRET-voyage-mer", lieu: "SECRET-lieu", debut: "2026-11-21", fin: "2026-11-22" }];
const VACANCES = [{ titre: "Vacances d'exemple", debut: "2026-11-12", fin: "2026-11-15" }];
const FERIES = [{ titre: "Armistice 1918", debut: "2026-11-11", fin: "2026-11-11" }];
const contexte = { google: GOOGLE, voyages: VOYAGES, vacances: VACANCES, feries: FERIES };
const parJour = (liste) => Object.fromEntries(liste.map((j) => [j.jour, j]));

// ---------- joursLibres ----------
const semaine = joursLibres("2026-11-11", "2026-11-22", contexte);
const j = parJour(semaine);
assert.equal(semaine.length, 12, "une entrée par jour, bornes incluses");
assert.equal(j["2026-11-16"].libre, false, "un événement Google rend le jour pris");
assert.equal(j["2026-11-18"].libre, false, "un événement sur deux jours : premier jour pris");
assert.equal(j["2026-11-19"].libre, false, "… et dernier jour pris");
assert.equal(j["2026-11-20"].libre, true, "jour sans rien : libre");
assert.equal(j["2026-11-21"].libre, false, "un voyage qui couvre le jour le rend pris");
assert.equal(j["2026-11-22"].libre, false, "voyage : dernier jour inclus");
assert.equal(j["2026-11-17"].libre, true, "le télétravail n'empêche pas de se voir");
assert.equal(j["2026-11-11"].ferie, "Armistice 1918", "férié étiqueté");
assert.equal(j["2026-11-12"].ferie, null);
assert.equal(j["2026-11-12"].vacances, "Vacances d'exemple", "vacances étiquetées");
assert.equal(j["2026-11-15"].vacances, "Vacances d'exemple");
assert.equal(j["2026-11-16"].vacances, null);
assert.equal(j["2026-11-11"].libre, true, "un férié reste libre (le créateur garde la main)");

// ---------- principe 1 : aucun titre d'événement ni de voyage dans la sortie ----------
for (const entree of semaine) assert.deepEqual(Object.keys(entree).sort(), ["ferie", "jour", "libre", "vacances"]);
const sortie = JSON.stringify(semaine);
for (const secret of ["SECRET", "rendez-vous", "cousins", "mer", "10:00", "g1"]) {
  assert.ok(!sortie.includes(secret), `« ${secret} » ne doit jamais sortir de joursLibres`);
}
const champs = champsSondage({ titre: "Raclette", message: "", jours: semaine, reponsesVisibles: false }, "Yann");
assert.ok(!JSON.stringify(champs).includes("SECRET"), "rien de secret dans ce qui part en base");
// Même si l'appelant glisse des champs en trop dans un jour, seuls les quatre champs partent.
const intrus = champsSondage({ titre: "T", jours: [{ jour: "2026-11-20", libre: true, ferie: null, vacances: null, titre: "SECRET-x" }] }, "Yann");
assert.deepEqual(Object.keys(intrus.jours[0]).sort(), ["ferie", "jour", "libre", "vacances"]);

// ---------- week-ends seuls ----------
const we = joursLibres("2026-11-11", "2026-11-22", { ...contexte, weekendsSeuls: true });
assert.deepEqual(we.map((x) => x.jour), ["2026-11-14", "2026-11-15", "2026-11-21", "2026-11-22"]);
assert.equal(we[1].vacances, "Vacances d'exemple");

// ---------- période invalide ou trop longue ----------
assert.throws(() => joursLibres("2026-11-20", "2026-11-10", contexte), /Période invalide/);
assert.equal(joursLibres("2026-11-14", "2026-11-14", {}).length, 1, "un seul jour");
assert.equal(joursLibres("2026-11-14", "2027-01-14", {}).length, JOURS_MAX, "62 jours : accepté");
assert.throws(() => joursLibres("2026-11-14", "2027-01-15", {}), /trop longue/, "63 jours : refusé");
assert.equal(erreurPeriode("2026-11-14", "2027-01-14", "2026-11-14"), null);
assert.match(erreurPeriode("2026-11-14", "2027-01-15", "2026-11-14"), /62 jours/);
assert.match(erreurPeriode("2026-11-20", "2026-11-10", "2026-11-14"), /après le premier/);
assert.match(erreurPeriode("2026-10-01", "2026-10-10", "2026-11-14"), /déjà passée/);
assert.match(erreurPeriode("", "2026-11-10", "2026-11-14"), /premier et un dernier/);
assert.match(erreurPeriode("2027-12-01", "2027-12-10", "2026-11-14"), /Au-delà d'un an/);
assert.equal(erreurPeriode("2027-11-14", "2027-11-14", "2026-11-14"), null, "pile à un an : accepté");

// ---------- fériés de la période (à cheval sur deux années) ----------
const fer = feriesDePeriode("2026-12-20", "2027-01-05");
assert.ok(fer.some((f) => f.debut === "2026-12-25") && fer.some((f) => f.debut === "2027-01-01"));
const noel = joursLibres("2026-12-24", "2027-01-01", { feries: fer });
assert.equal(parJour(noel)["2026-12-25"].ferie, "Noël");
assert.equal(parJour(noel)["2027-01-01"].ferie, "Jour de l’an");

// ---------- raccourcis (date du jour injectée) ----------
assert.deepEqual(periodeCeWeekEnd("2026-11-11"), { debut: "2026-11-14", fin: "2026-11-15", weekendsSeuls: true }, "mercredi : le week-end qui vient");
assert.deepEqual(periodeCeWeekEnd("2026-11-14"), { debut: "2026-11-14", fin: "2026-11-15", weekendsSeuls: true }, "samedi : ce samedi");
assert.deepEqual(periodeCeWeekEnd("2026-11-15"), { debut: "2026-11-15", fin: "2026-11-15", weekendsSeuls: true }, "dimanche : le dimanche qui reste");
assert.deepEqual(periodeCeWeekEnd("2026-11-13"), { debut: "2026-11-14", fin: "2026-11-15", weekendsSeuls: true }, "vendredi");
assert.deepEqual(periodeQuatreWeekEnds("2026-11-11"), { debut: "2026-11-14", fin: "2026-12-06", weekendsSeuls: true });
assert.deepEqual(periodeQuatreWeekEnds("2026-11-15"), { debut: "2026-11-15", fin: "2026-12-06", weekendsSeuls: true }, "dimanche : le quatrième dimanche reste le 6 déc.");
const quatre = joursLibres(...Object.values(periodeQuatreWeekEnds("2026-11-11")).slice(0, 2), { weekendsSeuls: true });
assert.equal(quatre.length, 8, "quatre week-ends = huit jours");
assert.deepEqual(periodeCeMois("2026-11-14"), { debut: "2026-11-14", fin: "2026-11-30", weekendsSeuls: false });
assert.deepEqual(periodeCeMois("2026-02-10"), { debut: "2026-02-10", fin: "2026-02-28", weekendsSeuls: false });
assert.deepEqual(periodeCeMois("2028-02-10"), { debut: "2028-02-10", fin: "2028-02-29", weekendsSeuls: false }, "année bissextile");
for (const f of [periodeCeWeekEnd, periodeQuatreWeekEnds, periodeCeMois]) {
  const p = f("2026-11-14");
  assert.equal(erreurPeriode(p.debut, p.fin, "2026-11-14"), null, `${f.name} donne une période acceptée`);
}

// ---------- validation du formulaire ----------
const jours = [{ jour: "2026-11-21", libre: true, ferie: null, vacances: null }];
assert.throws(() => champsSondage({ titre: "  ", jours }, "Yann"), /titre/);
assert.throws(() => champsSondage({ titre: "x".repeat(TITRE_MAX + 1), jours }, "Yann"), /trop long/);
assert.equal(champsSondage({ titre: "x".repeat(TITRE_MAX), jours }, "Yann").titre.length, TITRE_MAX);
assert.throws(() => champsSondage({ titre: "T", message: "m".repeat(MESSAGE_MAX + 1), jours }, "Yann"), /mot est trop long/);
assert.throws(() => champsSondage({ titre: "T", jours: [] }, "Yann"), /Aucun jour/);
assert.throws(() => champsSondage({ titre: "T", jours: [{ ...jours[0], libre: false }] }, "Yann"), /Aucun jour libre/);
assert.throws(() => champsSondage({ titre: "T", jours: Array.from({ length: JOURS_MAX + 1 }, () => jours[0]) }, "Yann"), /62 jours/);
const ok = champsSondage({ titre: " Raclette ", message: "", jours, reponsesVisibles: 1 }, "Yann");
assert.deepEqual(ok, { titre: "Raclette", message: null, jours, reponses_visibles: true, cree_par: "Yann" });
assert.equal(champsSondage({ titre: "T", message: " Venez ! ", jours }, null).message, "Venez !");

// ---------- lien partagé : sous-chemin GitHub Pages comme dossier local ----------
const jeton = "11111111-2222-4333-8444-555555555555";
assert.equal(lienSondage(jeton, "https://kimen26.github.io/MaxHome/"), `https://kimen26.github.io/MaxHome/sondage.html?j=${jeton}`);
assert.equal(lienSondage(jeton, "https://kimen26.github.io/MaxHome/index.html"), `https://kimen26.github.io/MaxHome/sondage.html?j=${jeton}`);
assert.equal(lienSondage(jeton, "http://localhost:8080/"), `http://localhost:8080/sondage.html?j=${jeton}`);

// ---------- classement des réponses : le jour le plus coché en tête ----------
const votes = [
  { prenom: "Paul", jours: ["2026-11-21", "2026-11-28"] },
  { prenom: "Léa", jours: ["2026-11-28", "2026-11-22"] },
  { prenom: "Sam", jours: ["2026-11-28", "2026-11-21", "2026-11-28"] }, // doublon dans un vote : compté une fois
];
assert.deepEqual(classerReponses(votes), [
  { jour: "2026-11-28", n: 3, prenoms: ["Paul", "Léa", "Sam"] },
  { jour: "2026-11-21", n: 2, prenoms: ["Paul", "Sam"] },
  { jour: "2026-11-22", n: 1, prenoms: ["Léa"] },
]);
assert.deepEqual(classerReponses([]), []);
assert.deepEqual(classerReponses(undefined), []);
assert.deepEqual(classerReponses([{ prenom: "Paul", jours: ["2026-12-05", "2026-11-21"] }]).map((x) => x.jour), ["2026-11-21", "2026-12-05"], "égalité : le plus proche d'abord");

console.log("test_proches : OK");
