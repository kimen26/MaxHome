// Rendus PURS de la fiche voyage V3 (fiche-route / fiche-planning / fiche-activites / fiche-infos) :
// le HTML sort des données seules, `lectureSeule` retire actions, codes, prix et payeurs — c'est ce
// que le lot « partage » rappelle tel quel. Données INVENTÉES (L-049).
import assert from "node:assert/strict";
import { rendreFeuilleRoute } from "../frontend/agenda/fiche-route.js";
import { rendrePlanning } from "../frontend/agenda/fiche-planning.js";
import { rendreActivites } from "../frontend/agenda/fiche-activites.js";
import { rendreInfos } from "../frontend/agenda/fiche-infos.js";
import { heureDe, lienSur, jourCourt } from "../frontend/agenda/fiche-statuts.js";

const voyage = { debut: "2030-03-01", fin: "2030-03-03" };
const lieu = (id, nom, statut, extra = {}) => ({ id, nom, statut, categorie: "a_voir", ordre: 0, jour: null, lat: null, lng: null, ...extra });
const lieux = [
  lieu(1, "Alpha", "prevu", { jour: "2030-03-01", horaires: "9h-17h", note: "NOTE-PRIVEE", topo: "Un parc", lat: 45.1, lng: 3.2, lien: "https://exemple.test/alpha" }),
  lieu(2, "Bravo", "idee", { jour: "2030-03-02", lien: "javascript:alert(1)" }),
  lieu(3, "Charlie", "idee", { jour: "2030-03-02" }),
  lieu(4, "Delta", "ecarte"),
  lieu(5, "Gîte", "prevu", { categorie: "logement", jour: "2030-03-01" }),
];
const resas = [
  { id: 1, type: "activite", statut: "reserve", titre: "Billet Charlie", lieu_id: 3, debut: "2030-03-02T10:30:00", prix_centimes: 1234, paye_par: "PAYEUR-X", code: "CODE-SECRET" },
  { id: 2, type: "logement", statut: "reserve", titre: "Nuits Gîte", lieu_id: 5, debut: "2030-03-01T15:00:00", fin: "2030-03-03T10:00:00", prix_centimes: 9900, code: "CODE-GITE" },
  { id: 3, type: "activite", statut: "a_reserver", titre: "Visite sans lieu", lieu_id: null, debut: "2030-03-03T14:00:00", prix_centimes: 500 },
];
const blocs = [{ id: 1, type: "resume", titre: null, texte: "Un week-end test", ordre: 0 }, { id: 2, type: "astuce", titre: "Bon plan", texte: "Texte astuce", ordre: 1 }];
const SECRETS = ["CODE-SECRET", "CODE-GITE", "PAYEUR-X", "12,34", "99,00", "NOTE-PRIVEE"];

// ---------- petits formats ----------
assert.equal(heureDe("2030-03-02T10:30:00"), "10h30");
assert.equal(heureDe("2030-03-02T09:00:00"), "9h");
assert.equal(heureDe("2030-03-02T00:00:00"), "", "minuit = pas d'heure saisie");
assert.equal(heureDe(null), "");
assert.equal(lienSur("javascript:alert(1)"), null, "jamais de javascript: dans un href");
assert.equal(lienSur("https://exemple.test/x"), "https://exemple.test/x");
assert.match(jourCourt("2030-03-01"), /\d/);

// ---------- feuille de route : une carte par jour, mot du statut, jamais de météo ----------
const route = rendreFeuilleRoute(voyage, lieux, resas);
assert.equal((route.match(/class="fv-jc /g) ?? []).length, 3, "3 jours = 3 cartes");
assert.ok(route.includes('data-jour="2030-03-02"'));
assert.ok(!/fv-meteo/.test(route), "pas de météo dans la feuille de route");
for (const mot of ["Payé", "Acté"]) assert.ok(route.includes(mot), `statut en mot : ${mot}`);

// ---------- planning ----------
const meteo = new Map([["2030-03-02", { jour: "2030-03-02", min: 8, max: 12, mm: 15, nbPluie: 4, nbModeles: 4, verdict: "pluie", icone: "🌧️", mot: "Pluie" }]]);
const planning = rendrePlanning(voyage, lieux, resas, meteo);
assert.ok(planning.includes("Prévoir la pluie"), "conseil pluie quand le verdict est pluie");
assert.ok(planning.includes("Météo : Open-Meteo"), "mention de la source sous le planning");
assert.equal((planning.match(/Nuit : Nuits Gîte/g) ?? []).length, 2, "nuits des 1er et 2 mars");
assert.equal((planning.match(/>Gîte</g) ?? []).length, 0, "le lieu logement lié à sa résa n'est pas doublé");
assert.ok(planning.includes("Visite sans lieu"), "résa sans lieu = élément du jour");
assert.ok(!planning.includes("Delta"), "écarté jamais dans le planning");
for (const secret of SECRETS) assert.ok(!planning.includes(secret), `le planning ne montre pas ${secret}`);
assert.ok(rendrePlanning(voyage, [], [], null).includes("Rien de prévu."), "jour vide dit rien de prévu");
assert.ok(!rendrePlanning(voyage, lieux, resas, null).includes("Météo : Open-Meteo"), "sans météo, pas de mention");

// ---------- activités : édition vs lecture seule ----------
const edition = rendreActivites(voyage, lieux, resas, { ouvertes: new Set([1]) });
assert.ok(edition.includes("data-choix-statut") && edition.includes("data-modifier-lieu") && edition.includes("data-nouveau-lieu"), "édition : actions");
assert.ok(edition.includes("CODE-SECRET") && edition.includes("12,34"), "édition : code et prix de la résa liée");
assert.ok(edition.includes("Nos notes : NOTE-PRIVEE"));
assert.match(edition, /<details class="fv-act fv-acte" data-lieu="1" open>/, "carte dépliée gardée ouverte");
assert.ok(edition.includes("Écartés (1)"));
assert.ok(!edition.includes("javascript:"), "lien dangereux jamais rendu");
const lecture = rendreActivites(voyage, lieux, resas, { lectureSeule: true });
for (const interdit of ["data-choix-statut", "data-modifier-lieu", "data-nouveau-lieu", "data-choisir-jour", "data-copier-code", "data-localiser-tous", ...SECRETS]) {
  assert.ok(!lecture.includes(interdit), `lecture seule : pas de ${interdit}`);
}
assert.ok(lecture.includes("https://exemple.test/alpha") && lecture.includes("destination=45.1,3.2"), "lecture seule : Site et Itinéraire restent");

// ---------- infos ----------
const infosEdition = rendreInfos(voyage, resas, blocs);
assert.ok(infosEdition.includes("CODE-SECRET") && infosEdition.includes("payé par PAYEUR-X"));
const infosLecture = rendreInfos(voyage, resas, blocs, { lectureSeule: true });
for (const secret of SECRETS) assert.ok(!infosLecture.includes(secret), `infos en lecture seule : pas de ${secret}`);
assert.ok(infosLecture.includes("Un week-end test") && infosLecture.includes("Texte astuce") && infosLecture.includes("Billet Charlie"));

console.log("test_fiche_rendus : OK");
