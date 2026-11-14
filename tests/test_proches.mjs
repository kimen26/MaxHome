// Module Proches : « Garder le lien » (libellés, validation, liste) puis « Proposer une date » : jours libres, raccourcis de période, validation, classement des réponses.
// Dates fixes injectées (2026-11-14 est un samedi) : aucun test ne dépend du jour où il tourne.
import assert from "node:assert/strict";
import { joursLibres, feriesDePeriode, erreurPeriode, periodeCeWeekEnd, periodeQuatreWeekEnds,
  periodeCeMois, JOURS_MAX } from "../frontend/proches/jours-libres.js";
import { champsProche, champsEchange, echangesDe, dernierEchange, duree, libelleRythme, texteAnniversaire, texteDate, texteDernier, texteRelance,
  RYTHMES_OPTIONS } from "../frontend/proches/lien.js";
import { htmlListeProches } from "../frontend/proches/ui-lien.js";
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

// =====================================================================================
// « Garder le lien » : libellés, validation, tri, liste (prénoms FICTIFS)
// =====================================================================================

// ---------- libellés de rythme (le null et les valeurs hors liste ne cassent rien) ----------
assert.deepEqual([7, 14, 30, 60, 90, 180, null].map(libelleRythme),
  ["chaque semaine", "toutes les 2 semaines", "chaque mois", "tous les 2 mois", "chaque trimestre", "tous les 6 mois", "pas de relance"]);
assert.equal(libelleRythme(45), "tous les 45 jours");
assert.deepEqual(RYTHMES_OPTIONS.at(-1), ["", "pas de relance"]);

// ---------- durées courtes ----------
assert.deepEqual([0, 5, 13, 14, 42, 59, 60, 95, 365].map(duree), ["0 j", "5 j", "13 j", "2 sem.", "6 sem.", "8 sem.", "2 mois", "3 mois", "12 mois"]);
assert.equal(texteRelance({ depuisJours: 42 }, 30), "6 sem. sans nouvelles · rythme : mois");
assert.equal(texteRelance({ depuisJours: 9 }, 7), "9 j sans nouvelles · rythme : semaine");
assert.equal(texteDernier(5), "dernier échange il y a 5 j");
assert.equal(texteDernier(0), "dernier échange aujourd'hui");
assert.equal(texteDernier(1), "dernier échange hier");

// ---------- anniversaires en toutes lettres ----------
assert.equal(texteAnniversaire({ dansJours: 3, age: 40 }, "Léa"), "Léa a 40 ans dans 3 jours");
assert.equal(texteAnniversaire({ dansJours: 0, age: 1 }, "Léa"), "Léa a 1 an aujourd'hui");
assert.equal(texteAnniversaire({ dansJours: 1, age: null }, "Paul"), "Anniversaire de Paul demain");
assert.equal(texteDate({ anniv_jour: 1, anniv_mois: 3, anniv_annee: 1984 }), "1er mars 1984");
assert.equal(texteDate({ anniv_jour: 12, anniv_mois: 12, anniv_annee: null }), "12 décembre");
assert.equal(texteDate({ anniv_jour: null }), "");

// ---------- échanges d'un proche : récent en tête, à égalité le dernier noté ----------
const echs = [
  { id: 1, proche_id: 1, le: "2026-10-01", texte: "a" }, { id: 2, proche_id: 1, le: "2026-11-01", texte: "b" },
  { id: 3, proche_id: 2, le: "2026-11-10", texte: "autre proche" }, { id: 4, proche_id: 1, le: "2026-11-01", texte: "c" },
];
assert.deepEqual(echangesDe(echs, 1).map((e) => e.id), [4, 2, 1]);
assert.equal(dernierEchange(echs, 1).texte, "c");
assert.equal(dernierEchange(echs, 9), null);

// ---------- validation d'un proche ----------
const lu = (o = {}) => ({ prenom: "Léa", qui: "nous", rythme_jours: "30", anniv_jour: null, anniv_mois: null, anniv_annee: null, note: null, ...o });
const autres = [{ id: 7, prenom: "Paul" }];
assert.deepEqual(champsProche(lu(), autres, 2026), { prenom: "Léa", qui: "nous", rythme_jours: 30, anniv_jour: null, anniv_mois: null, anniv_annee: null, note: null });
assert.equal(champsProche(lu({ rythme_jours: null }), autres, 2026).rythme_jours, null, "pas de relance");
assert.equal(champsProche(lu({ prenom: "  Léa  ", note: " 2 enfants " }), autres, 2026).note, "2 enfants");
assert.throws(() => champsProche(lu({ prenom: "  " }), autres, 2026), /prénom/);
assert.throws(() => champsProche(lu({ prenom: "x".repeat(61) }), autres, 2026), /trop long/);
assert.throws(() => champsProche(lu({ prenom: "PAUL" }), autres, 2026), /déjà dans la liste/, "unicité sans casse");
assert.equal(champsProche(lu({ prenom: "Paul" }), [], 2026).prenom, "Paul", "soi-même exclu des existants");
assert.throws(() => champsProche(lu({ qui: "Max" }), autres, 2026), /qui relance/);
assert.throws(() => champsProche(lu({ rythme_jours: "0" }), autres, 2026), /Rythme/);
assert.deepEqual(Object.values(champsProche(lu({ anniv_jour: "29", anniv_mois: "2", anniv_annee: "1984" }), autres, 2026)).slice(3, 6), [29, 2, 1984], "29 février accepté");
assert.throws(() => champsProche(lu({ anniv_jour: "31", anniv_mois: "4" }), autres, 2026), /n'existe pas/);
assert.throws(() => champsProche(lu({ anniv_jour: "30", anniv_mois: "2" }), autres, 2026), /n'existe pas/);
assert.throws(() => champsProche(lu({ anniv_jour: "12" }), autres, 2026), /jour ET le mois/);
assert.throws(() => champsProche(lu({ anniv_annee: "1984" }), autres, 2026), /ajoutez le jour et le mois/);
assert.throws(() => champsProche(lu({ anniv_jour: "1", anniv_mois: "1", anniv_annee: "2027" }), autres, 2026), /entre 1900 et 2026/);
assert.throws(() => champsProche(lu({ note: "x".repeat(501) }), autres, 2026), /note est trop longue/);

// ---------- validation d'un échange ----------
assert.deepEqual(champsEchange({ texte: " Café ensemble ", le: "2026-11-10" }, 3, "Yann", "2026-11-14"), { proche_id: 3, le: "2026-11-10", texte: "Café ensemble", par: "Yann" });
assert.equal(champsEchange({ texte: "Appel", le: null }, 3, null, "2026-11-14").le, "2026-11-14", "date du jour par défaut");
assert.equal(champsEchange({ texte: "Appel", le: "2026-11-14" }, 3, null, "2026-11-14").par, null);
assert.throws(() => champsEchange({ texte: "  ", le: "2026-11-10" }, 3, "Yann", "2026-11-14"), /une phrase/);
assert.throws(() => champsEchange({ texte: "x".repeat(501), le: null }, 3, "Yann", "2026-11-14"), /trop long/);
assert.throws(() => champsEchange({ texte: "Appel", le: "2026-11-15" }, 3, "Yann", "2026-11-14"), /futur/);
assert.throws(() => champsEchange({ texte: "Appel", le: "2026-02-30" }, 3, "Yann", "2026-11-14"), /pas valide/);
assert.throws(() => champsEchange({ texte: "Appel", le: "hier" }, 3, "Yann", "2026-11-14"), /pas valide/);

// ---------- la liste : à relancer en tête, anniversaires en bandeau, tout échappé ----------
const P = [
  { id: 1, prenom: "Camille", qui: "nous", rythme_jours: 30, actif: true, cree_le: "2026-01-01", anniv_jour: null, anniv_mois: null, anniv_annee: null },
  { id: 2, prenom: "Sacha", qui: "Yann", rythme_jours: 14, actif: true, cree_le: "2026-01-01", anniv_jour: null, anniv_mois: null, anniv_annee: null },
  { id: 3, prenom: "Lou", qui: "Claudia", rythme_jours: null, actif: true, cree_le: "2026-01-01", anniv_jour: 17, anniv_mois: 11, anniv_annee: 1986 },
  { id: 4, prenom: "<b>Zed</b>", qui: "nous", rythme_jours: 7, actif: true, cree_le: "2026-10-01", anniv_jour: null, anniv_mois: null, anniv_annee: null },
];
const E = [
  { id: 1, proche_id: 1, le: "2026-10-03", texte: "x" },   // 42 jours avant le 14/11 : à relancer (30)
  { id: 2, proche_id: 2, le: "2026-11-09", texte: "y" },   // 5 jours : à jour (14)
  { id: 3, proche_id: 3, le: "2026-11-01", texte: "z" },
];
const h = htmlListeProches(P, E, "2026-11-14");
assert.ok(h.includes("Lou a 40 ans dans 3 jours"), "bandeau anniversaires");
assert.ok(h.includes("6 sem. sans nouvelles · rythme : mois"));
assert.ok(h.includes("dernier échange il y a 5 j · toutes les 2 semaines"));
assert.ok(h.includes("dernier échange il y a 13 j · pas de relance"));
const ordre = [...h.matchAll(/class="pr-proche-nom">([^<]*)</g)].map((m) => m[1]);
assert.deepEqual(ordre, ["&lt;b&gt;Zed&lt;/b&gt;", "Camille", "Lou", "Sacha"], "relances (retard décroissant), puis les autres par prénom");
assert.ok(!h.includes("<b>Zed"), "prénom échappé");
assert.ok(h.indexOf("À relancer") < h.indexOf("Les autres"));
assert.ok(htmlListeProches([], [], "2026-11-14").includes("Aucun proche"));
assert.ok(!htmlListeProches([P[1]], E, "2026-11-14").includes("À relancer"), "personne à relancer : pas de section vide");

// =====================================================================================
// « Proposer une date »
// =====================================================================================

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
