import assert from "node:assert/strict";
import { statutLieu, statutResa, joursDuVoyage, planningParJour, lieuxParStatut, couvreNuit }
  from "../frontend/agenda/planning.js";
import { syntheseMeteo, positionMeteo, chargerMeteo, libelleMeteo, MODELES_METEO }
  from "../frontend/agenda/meteo.js";

// Données INVENTÉES (L-049) : lieux « Alpha », « Bravo »…, coordonnées fictives.
const voyage = { debut: "2030-03-01", fin: "2030-03-04" };
const lieu = (id, nom, statut, extra = {}) => ({ id, nom, statut, categorie: "a_voir", ordre: 0, jour: null, ...extra });
const resa = (id, type, statut, extra = {}) => ({ id, type, statut, titre: `Résa ${id}`, lieu_id: null, ...extra });

// ---------- statuts ----------
assert.equal(statutResa(resa(1, "activite", "reserve")), "paye");
assert.equal(statutResa(resa(1, "activite", "a_reserver")), "acte");
assert.equal(statutResa(resa(1, "activite", "annule")), null);
const rPayee = resa(1, "activite", "reserve", { lieu_id: 10, debut: "2030-03-02T10:00:00" });
assert.equal(statutLieu(lieu(10, "Alpha", "idee"), [rPayee]), "paye", "idée avec résa payée = payé");
assert.equal(statutLieu(lieu(10, "Alpha", "prevu"), [rPayee]), "paye");
assert.equal(statutLieu(lieu(11, "Bravo", "prevu"), [rPayee]), "acte");
assert.equal(statutLieu(lieu(11, "Bravo", "fait"), []), "acte");
assert.equal(statutLieu(lieu(12, "Charlie", "idee"), []), "possible");
assert.equal(statutLieu(lieu(12, "Charlie", "ecarte"), [rPayee]), "ecarte");
const rAnnulee = resa(2, "activite", "annule", { lieu_id: 12 });
assert.equal(statutLieu(lieu(12, "Charlie", "idee"), [rAnnulee]), "possible", "résa annulée ignorée");

// ---------- jours du voyage ----------
assert.deepEqual(joursDuVoyage(voyage), ["2030-03-01", "2030-03-02", "2030-03-03", "2030-03-04"]);
assert.deepEqual(joursDuVoyage({ debut: "2030-03-30", fin: "2030-04-01" }), ["2030-03-30", "2030-03-31", "2030-04-01"]);

// ---------- nuits : debut <= J < fin ----------
const hotel = resa(3, "logement", "reserve", { debut: "2030-03-01T15:00:00", fin: "2030-03-04T11:00:00", titre: "Gîte Test" });
assert.equal(couvreNuit(hotel, "2030-03-01"), true);
assert.equal(couvreNuit(hotel, "2030-03-03"), true);
assert.equal(couvreNuit(hotel, "2030-03-04"), false, "le jour de fin, la nuit n'est plus couverte");
assert.equal(couvreNuit({ ...hotel, statut: "annule" }, "2030-03-02"), false);

// ---------- planning : jour avec / sans activité, nuits, libérer ----------
const lieux = [
  lieu(10, "Alpha", "prevu", { jour: "2030-03-02", ordre: 1 }),
  lieu(11, "Bravo", "idee", { jour: "2030-03-02", ordre: 2 }),
  lieu(12, "Charlie", "idee", { jour: "2030-03-02", ordre: 3 }),
  lieu(13, "Delta", "ecarte", { jour: "2030-03-02" }),
  lieu(14, "Echo", "idee", { jour: "2030-03-03" }),
  lieu(15, "Gîte", "prevu", { categorie: "logement", jour: "2030-03-01" }),
];
const resas = [rPayee, hotel,
  resa(4, "vol", "a_reserver", { titre: "Vol Test", debut: "2030-03-01T08:00:00" }),
  resa(5, "activite", "reserve", { titre: "Visite Foxtrot", debut: "2030-03-03T09:00:00" }),
  resa(6, "repas", "annule", { titre: "Dîner annulé", debut: "2030-03-03T20:00:00" }),
];
const plan = planningParJour(voyage, lieux, resas);
assert.equal(plan.length, 4);
const [j1, j2, j3, j4] = plan;

// jour 1 : seulement logement + transport -> statut du plus avancé parmi eux (nuit payée)
assert.equal(j1.statut, "paye");
assert.equal(j1.titreCourt, "Vol Test", "sans activité : le premier transport");
assert.deepEqual(j1.elements.map((e) => e.objet.id), [4, 15], "transport en tête, logement ensuite");
assert.equal(j1.nuits.length, 1);
assert.equal(j1.nuits[0].statut, "paye");

// jour 2 : Alpha payé (résa liée) + Bravo/Charlie possibles ; écarté absent
assert.equal(j2.statut, "paye");
assert.deepEqual(j2.elements.map((e) => e.objet.nom), ["Alpha", "Bravo", "Charlie"]);
assert.deepEqual(j2.elements.map((e) => e.statut), ["paye", "possible", "possible"]);
assert.equal(j2.titreCourt, "Alpha · Bravo +1", "2 noms puis +n");
assert.equal(j2.nuits.length, 1);

// jour 3 : Echo possible + résa sans lieu payée ; résa annulée absente
assert.equal(j3.elements.length, 2);
assert.ok(j3.elements.some((e) => e.type === "resa" && e.objet.id === 5), "résa sans lieu = élément");
assert.ok(!j3.elements.some((e) => e.objet.id === 6), "résa annulée absente");
assert.equal(j3.statut, "paye");

// jour 4 : libérer, plus de nuit, journée libre côté activités mais transport/logement seuls
assert.equal(j4.liberer.length, 1);
assert.equal(j4.liberer[0].resa.titre, "Gîte Test");
assert.equal(j4.liberer[0].statut, "paye");
assert.equal(j4.nuits.length, 0);
assert.equal(j4.titreCourt, "Journée libre");
assert.equal(j4.statut, "paye", "à défaut d'élément, la résa à libérer donne le statut");

// jour sans rien du tout = possible
const vide = planningParJour({ debut: "2030-05-01", fin: "2030-05-01" }, [], [])[0];
assert.equal(vide.statut, "possible");
assert.equal(vide.titreCourt, "Journée libre");

// statut d'un jour : hors logement/transport prime sur un transport payé
const jMixte = planningParJour({ debut: "2030-03-01", fin: "2030-03-01" },
  [lieu(20, "Golf", "idee", { jour: "2030-03-01" })],
  [resa(7, "vol", "reserve", { titre: "Vol Z", debut: "2030-03-01T07:00:00" })])[0];
assert.equal(jMixte.statut, "possible", "le transport payé ne fait pas passer le jour en payé");

// résa logement SANS fin : seulement la nuit de son début
const sansFin = planningParJour(voyage, [], [resa(8, "logement", "a_reserver", { debut: "2030-03-02T18:00:00", titre: "Nuit seule" })]);
assert.deepEqual(sansFin.map((j) => j.nuits.length), [0, 1, 0, 0]);
assert.equal(sansFin[1].nuits[0].statut, "acte");
assert.equal(sansFin[2].liberer.length, 0, "pas de fin = rien à libérer");

// lieu sans jour : jour de sa résa liée
const viaResa = planningParJour(voyage, [lieu(30, "Hotel", "idee")],
  [resa(9, "activite", "reserve", { lieu_id: 30, debut: "2030-03-03T14:00:00" })]);
assert.deepEqual(viaResa[2].elements.map((e) => e.objet.id), [30]);
assert.equal(viaResa[2].elements.length, 1, "lieu + résa liée = un seul élément");

// ---------- lieuxParStatut ----------
const par = lieuxParStatut([...lieux, lieu(16, "Zulu", "idee"), lieu(17, "Acacia", "idee", { jour: "2030-03-02", ordre: 0 })], resas);
assert.deepEqual(par.paye.map((l) => l.nom), ["Alpha"]);
assert.deepEqual(par.acte.map((l) => l.nom), ["Gîte"]);
assert.deepEqual(par.possible.map((l) => l.nom), ["Acacia", "Bravo", "Charlie", "Echo", "Zulu"], "tri jour, ordre, nom ; sans date en dernier");
assert.deepEqual(par.ecarte.map((l) => l.nom), ["Delta"]);

// ---------- synthèse météo (réponse inventée, 4 modèles dont un muet) ----------
const M = MODELES_METEO;
// Une ligne par jour, un modèle par colonne. j1 : 3 modèles pluie sur 3 (le 4e muet) ;
// j2 : sec partout ; j3 : 1 sur 4 ; j4 : 2 sur 4.
const parJour = {
  precipitation_sum: [[12, 10, 14, null], [0, 0.2, 0, 0.4], [1.5, 0, 0.3, 0], [2, 0, 3, 0.1]],
  weather_code: [[63, 61, 63, null], [0, 1, 0, 1], [3, 3, 61, 3], [61, 3, 80, 3]],
  temperature_2m_max: [[12, 14, 10, null], [20, 22, 21, 23], [15, 15, 15, 15], [9, 9, 9, 9]],
  temperature_2m_min: [[8, 6, 7, null], [10, 11, 12, 9], [5, 5, 5, 5], [4, 4, 4, 4]],
};
const daily = { time: ["2030-03-01", "2030-03-02", "2030-03-03", "2030-03-04"] };
for (const [champ, lignes] of Object.entries(parJour)) {
  M.forEach((m, mi) => { daily[`${champ}_${m}`] = lignes.map((l) => l[mi]); });
}
const syn = syntheseMeteo({ daily }, M);
const s1 = syn.get("2030-03-01");
assert.equal(s1.nbModeles, 3, "le modèle muet est exclu");
assert.equal(s1.nbPluie, 3);
assert.equal(s1.verdict, "pluie");
assert.equal(s1.mm, 12, "médiane des précipitations");
assert.equal(s1.min, 7);
assert.equal(s1.max, 12);
assert.equal(s1.icone, "🌧️");
assert.equal(libelleMeteo(s1), "🌧️ Pluie · 7° à 12° · 12 mm · 3 modèles sur 4");
const s2 = syn.get("2030-03-02");
assert.equal(s2.verdict, "sec");
assert.equal(s2.icone, "☀️");
assert.equal(libelleMeteo(s2), "Sec · 4 modèles sur 4");
const s3 = syn.get("2030-03-03");
assert.equal(s3.nbPluie, 1);
assert.equal(s3.verdict, "incertain", "1 modèle sur 4 : pluie possible");
assert.equal(libelleMeteo(s3), "Pluie possible · 4 modèles sur 4");
assert.equal(s3.mot, "Couvert", "code majoritaire");
const s4 = syn.get("2030-03-04");
assert.equal(s4.nbPluie, 2);
assert.equal(s4.verdict, "incertain", "2 sur 4 < ceil(2/3 * 4) = 3");
// tous muets : jour absent
const muet = { daily: { time: ["2030-03-09"], ...Object.fromEntries(["precipitation_sum", "weather_code",
  "temperature_2m_max", "temperature_2m_min"].flatMap((c) => M.map((m) => [`${c}_${m}`, [null]]))) } };
assert.equal(syntheseMeteo(muet, M).size, 0);

// ---------- position météo ----------
const lGite = lieu(40, "Gîte Test", "prevu", { categorie: "logement", lat: 10.5, lng: 20.5 });
const lAutre = lieu(41, "Autre", "idee", { lat: 11.5, lng: 22.5 });
const lEcarte = lieu(42, "Loin", "ecarte", { lat: 80, lng: 80 });
const lSansPos = lieu(43, "Sans position", "idee");
const rGite = resa(10, "logement", "reserve", { lieu_id: 40, debut: "2030-03-01T15:00:00", fin: "2030-03-03T10:00:00" });
assert.deepEqual(positionMeteo("2030-03-02", [lGite, lAutre], [rGite]), { lat: 10.5, lng: 20.5 }, "position du logement de la nuit");
assert.deepEqual(positionMeteo("2030-03-03", [lGite, lAutre, lEcarte, lSansPos], [rGite]), { lat: 11, lng: 21.5 }, "sinon barycentre, écartés exclus");
assert.equal(positionMeteo("2030-03-03", [lSansPos], []), null);

// ---------- chargerMeteo : fetch simulé, cache, hors portée, échec ----------
const magasin = new Map();
globalThis.sessionStorage = { getItem: (k) => magasin.get(k) ?? null, setItem: (k, v) => magasin.set(k, v) };
let appels = [];
const bonneReponse = { ok: true, json: async () => ({ daily }) };
globalThis.fetch = async (url) => { appels.push(String(url)); return bonneReponse; };
const rGiteLong = { ...rGite, fin: "2030-03-05T10:00:00" }; // même position tout le séjour : un seul appel
const lieuxM = [lGite, lAutre];
const voyageM = { debut: "2030-03-01", fin: "2030-03-04" };
let carte = await chargerMeteo(voyageM, lieuxM, [rGiteLong], "2030-03-02");
assert.equal(appels.length, 1);
assert.ok(appels[0].startsWith("https://api.open-meteo.com/v1/forecast?"));
for (const m of M) assert.ok(appels[0].includes(m), `modèle ${m} demandé`);
assert.ok(appels[0].includes("start_date=2030-03-02") && appels[0].includes("end_date=2030-03-04"));
assert.ok(!carte.has("2030-03-01"), "jour passé ignoré");
assert.ok(carte.has("2030-03-02") && carte.has("2030-03-04"));
await chargerMeteo(voyageM, lieuxM, [rGiteLong], "2030-03-02");
assert.equal(appels.length, 1, "deuxième appel servi par le cache");
carte = await chargerMeteo(voyageM, lieuxM, [rGiteLong], "2029-12-01");
assert.equal(carte.size, 0, "voyage au-delà de 15 jours : aucun appel, aucune ligne");
assert.equal(appels.length, 1);
// stockage absent : on refetch sans planter
globalThis.sessionStorage = { getItem() { throw new Error("pas de stockage"); }, setItem() { throw new Error("pas de stockage"); } };
await chargerMeteo(voyageM, lieuxM, [rGiteLong], "2030-03-02");
assert.equal(appels.length, 2);
// échec réseau : Map vide et console.error
globalThis.sessionStorage = { getItem: () => null, setItem() {} };
globalThis.fetch = async () => { throw new Error("hors ligne"); };
const erreurs = [];
const consoleErreur = console.error;
console.error = (...a) => erreurs.push(a);
carte = await chargerMeteo(voyageM, lieuxM, [rGiteLong], "2030-03-02");
console.error = consoleErreur;
assert.equal(carte.size, 0);
assert.equal(erreurs.length, 1, "l'échec est journalisé, pas avalé");
// HTTP 500 : idem
globalThis.fetch = async () => ({ ok: false, status: 500 });
console.error = (...a) => erreurs.push(a);
carte = await chargerMeteo(voyageM, lieuxM, [rGiteLong], "2030-03-02");
console.error = consoleErreur;
assert.equal(carte.size, 0);
assert.equal(erreurs.length, 2);

console.log("test_planning : OK");
