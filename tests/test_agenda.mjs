import assert from "node:assert/strict";
import { paques, feries, grilleMois, evenementsDuMois, prochaines, nbJours, formatPeriode, relatif,
  couvre, chevauche } from "../frontend/agenda/calendrier.js";
import { parserVacances, chargerVacances, jourParis, cleCache, TTL_CACHE_MS } from "../frontend/agenda/vacances.js";
import { lieuxParJour, totauxResas, joursAvant, CATEGORIES_LIEU, TYPES_RESA } from "../frontend/agenda/carnet.js";
import { rendreTopo } from "../frontend/agenda/topo.js";

// ---------- Pâques et fériés ----------
assert.equal(paques(2026), "2026-04-05");
assert.equal(paques(2027), "2027-03-28");
assert.equal(paques(2024), "2024-03-31");
const f2026 = feries(2026);
assert.equal(f2026.length, 11, "11 fériés en métropole");
assert.deepEqual(f2026.filter((f) => f.titre.includes("Pâques") || f.titre === "Ascension" || f.titre.includes("Pentecôte")).map((f) => f.debut),
  ["2026-04-06", "2026-05-14", "2026-05-25"], "mobiles 2026 : lundi de Pâques, Ascension, lundi de Pentecôte");
assert.equal(f2026[0].debut, "2026-01-01");
assert.equal(f2026[10].debut, "2026-12-25");
assert.ok(f2026.every((f) => f.type === "ferie" && f.debut === f.fin));

// ---------- grille d'un mois ----------
const sept = grilleMois(2026, 9); // le 1er septembre 2026 est un mardi
assert.equal(sept.length, 5);
assert.equal(sept[0][0].iso, "2026-08-31", "commence le lundi précédent");
assert.equal(sept[0][0].dansMois, false);
assert.equal(sept[0][1].iso, "2026-09-01");
assert.equal(sept[4][6].iso, "2026-10-04", "finit le dimanche suivant");
assert.ok(sept.every((s) => s.length === 7));
assert.equal(grilleMois(2026, 3).length, 6, "mars 2026 (1er = dimanche, 31 jours) tient sur 6 semaines");
assert.equal(grilleMois(2027, 2).length, 4, "février 2027 commence un lundi et fait 28 jours : 4 semaines");

// ---------- périodes ----------
assert.equal(nbJours("2026-10-17", "2026-10-25"), 9);
assert.equal(nbJours("2026-10-17", "2026-10-17"), 1);
assert.ok(couvre({ debut: "2026-10-17", fin: "2026-10-25" }, "2026-10-25"));
assert.ok(!couvre({ debut: "2026-10-17", fin: "2026-10-25" }, "2026-10-26"));
assert.ok(chevauche({ debut: "2026-10-01", fin: "2026-10-31" }, { debut: "2026-10-31", fin: "2026-11-02" }));
assert.ok(!chevauche({ debut: "2026-10-01", fin: "2026-10-31" }, { debut: "2026-11-01", fin: "2026-11-02" }));
assert.equal(formatPeriode("2026-10-17", "2026-10-25"), "sam. 17 oct. → dim. 25 oct.");
assert.equal(formatPeriode("2026-11-01", "2026-11-01"), "dim. 1 nov.");
assert.equal(relatif({ debut: "2026-10-17", fin: "2026-10-25" }, "2026-10-05"), "dans 12 j");
assert.equal(relatif({ debut: "2026-10-17", fin: "2026-10-25" }, "2026-10-16"), "demain");
assert.equal(relatif({ debut: "2026-10-17", fin: "2026-10-25" }, "2026-10-17"), "aujourd’hui");
assert.equal(relatif({ debut: "2026-10-17", fin: "2026-10-25" }, "2026-10-20"), "en cours");
assert.equal(relatif({ debut: "2026-10-17", fin: "2026-10-25" }, "2026-10-26"), "passé");

// ---------- événements d'un mois ----------
const vacances = [
  { titre: "Vacances de la Toussaint", debut: "2026-10-17", fin: "2026-11-01" },
  { titre: "Vacances de Noël", debut: "2026-12-19", fin: "2027-01-03" },
];
const voyages = [
  { id: 1, titre: "Auvergne", debut: "2026-10-17", fin: "2026-10-25" },
  { id: 2, titre: "Islande", debut: "2026-11-11", fin: "2026-11-14" },
  null,
];
const evNov = evenementsDuMois(2026, 11, { vacances, voyages, feries: feries(2026) });
assert.deepEqual(evNov.map((e) => `${e.type}:${e.titre}`),
  ["vacances:Vacances de la Toussaint", "ferie:Toussaint", "voyage:Islande", "ferie:Armistice 1918"],
  "novembre : la Toussaint déborde d'octobre, deux fériés, un voyage le 11 (avant le férié du même jour) ; le null est ignoré");
const evOct = evenementsDuMois(2026, 10, { vacances, voyages, feries: feries(2026) });
assert.deepEqual(evOct.map((e) => `${e.type}:${e.titre}`), ["vacances:Vacances de la Toussaint", "voyage:Auvergne"],
  "même début : vacances avant voyage");
assert.deepEqual(evenementsDuMois(2026, 8, { vacances, voyages, feries: [] }), [], "août : rien");

// ---------- prochaines ----------
assert.deepEqual(prochaines(voyages, "2026-10-20").map((v) => v.titre), ["Auvergne", "Islande"], "en cours compte comme à venir");
assert.deepEqual(prochaines(voyages, "2026-10-26", 1).map((v) => v.titre), ["Islande"]);
assert.deepEqual(prochaines(voyages, "2027-01-01"), []);

// ---------- vacances : parseur (données réelles de l'API, zone C, 2026-2027) ----------
assert.equal(jourParis("2026-10-16T22:00:00+00:00"), "2026-10-17", "22 h UTC en octobre = minuit Paris le lendemain");
assert.equal(jourParis("2026-12-18T23:00:00+00:00"), "2026-12-19", "23 h UTC en hiver = minuit Paris le lendemain");
assert.equal(jourParis("n'importe quoi"), null);
const brut = [
  { description: "Vacances de la Toussaint", start_date: "2026-10-16T22:00:00+00:00", end_date: "2026-11-01T23:00:00+00:00", annee_scolaire: "2026-2027" },
  { description: "Vacances de Printemps", start_date: "2027-04-02T22:00:00+00:00", end_date: "2027-04-18T22:00:00+00:00", annee_scolaire: "2026-2027" },
  { description: "Vacances de Printemps", start_date: "2027-04-02T22:00:00+00:00", end_date: "2027-04-18T22:00:00+00:00", annee_scolaire: "2026-2027" },
  { description: "Pont de l'Ascension", start_date: "2027-05-05T22:00:00+00:00", end_date: "2027-05-05T22:00:00+00:00" },
  { description: "Début des Vacances d'Été", start_date: "2027-07-05T22:00:00+00:00", end_date: null },
];
const periodes = parserVacances(brut, "Zone C");
assert.deepEqual(periodes.map((p) => [p.titre, p.debut, p.fin]), [
  ["Vacances de la Toussaint", "2026-10-17", "2026-11-01"],
  ["Vacances de Printemps", "2027-04-03", "2027-04-18"],
], "dédoublonné, trié, fin = veille de la reprise, ponts et bornes sans fin écartés");
assert.ok(periodes.every((p) => p.zone === "Zone C" && p.anneeScolaire === "2026-2027"));
assert.deepEqual(parserVacances(null, "Zone C"), []);

// ---------- vacances : chargement avec cache, réseau bouchonné ----------
function stockageMemoire(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m };
}
const reponse = (results, ok = true, status = 200) => ({ ok, status, json: async () => ({ results }) });
let appels = 0;
const fetchOk = async (url) => { appels += 1; assert.match(url, /zones%3D%22Zone\+C%22/); return reponse(brut); };
const t0 = Date.parse("2026-09-22T10:00:00Z");

// 1. Aucun cache : l'API est appelée, le résultat mis en cache.
const st = stockageMemoire();
const r1 = await chargerVacances("Zone C", { fetchFn: fetchOk, stockage: st, maintenant: t0 });
assert.equal(appels, 1);
assert.equal(r1.periodes.length, 2);
assert.equal(r1.perime, false);
assert.ok(st.m.has(cleCache("Zone C")), "cache écrit");

// 2. Cache frais : pas d'appel.
const r2 = await chargerVacances("Zone C", { fetchFn: fetchOk, stockage: st, maintenant: t0 + 1000 });
assert.equal(appels, 1, "cache frais : aucun appel");
assert.deepEqual(r2.periodes, r1.periodes);

// 3. Cache périmé + réseau KO : on rend le cache, marqué périmé.
const fetchKo = async () => { throw new Error("réseau absent"); };
const r3 = await chargerVacances("Zone C", { fetchFn: fetchKo, stockage: st, maintenant: t0 + TTL_CACHE_MS + 1 });
assert.equal(r3.perime, true, "cache périmé rendu tel quel quand le réseau manque");
assert.equal(r3.periodes.length, 2);

// 4. Aucun cache + réseau KO : l'erreur remonte, jamais une liste vide silencieuse.
await assert.rejects(() => chargerVacances("Zone C", { fetchFn: fetchKo, stockage: stockageMemoire(), maintenant: t0 }), /réseau absent/);
// 5. HTTP non-ok et réponse sans `results` : erreurs explicites.
await assert.rejects(() => chargerVacances("Zone C", { fetchFn: async () => reponse([], false, 503), stockage: stockageMemoire(), maintenant: t0 }), /HTTP 503/);
await assert.rejects(() => chargerVacances("Zone C", { fetchFn: async () => ({ ok: true, json: async () => ({}) }), stockage: stockageMemoire(), maintenant: t0 }), /results/);
// 6. Zone inconnue : refusée avant tout appel.
await assert.rejects(() => chargerVacances("Zone Z", { fetchFn: fetchOk, stockage: stockageMemoire() }), /Zone inconnue/);
// 7. Cache illisible : traité comme absent.
const stCasse = stockageMemoire({ [cleCache("Zone C")]: "{pas du json" });
const r7 = await chargerVacances("Zone C", { fetchFn: fetchOk, stockage: stCasse, maintenant: t0 });
assert.equal(r7.periodes.length, 2);

// ---------- carnet de voyage : catégories et types ----------
assert.equal(CATEGORIES_LIEU.length, 6);
assert.ok(CATEGORIES_LIEU.every((c) => /^#[0-9a-f]{6}$/i.test(c.couleur)), "couleurs hexa");
assert.deepEqual(new Set(CATEGORIES_LIEU.map((c) => c.valeur)),
  new Set(["a_voir", "activite", "logement", "resto", "transport", "autre"]));
assert.equal(TYPES_RESA.length, 6);
assert.ok(TYPES_RESA.every((t) => t.emoji && t.libelle));

// ---------- carnet de voyage : lieuxParJour ----------
const lieux = [
  { id: 1, nom: "Zoo", jour: "2026-10-18", ordre: 1 },
  { id: 2, nom: "Aquarium", jour: "2026-10-18", ordre: 0 },
  { id: 3, nom: "Hôtel", jour: null, ordre: 0 },
  { id: 4, nom: "Marché", jour: "2026-10-17", ordre: 0 },
  { id: 5, nom: "Ancien château", jour: null, ordre: 0 },
];
const groupes = lieuxParJour(lieux);
assert.deepEqual(groupes.map((g) => g.jour), ["2026-10-17", "2026-10-18", null], "jours croissants puis sans date");
assert.deepEqual(groupes[1].lieux.map((l) => l.nom), ["Aquarium", "Zoo"], "tri par ordre puis nom dans un jour");
assert.deepEqual(groupes[2].lieux.map((l) => l.nom), ["Ancien château", "Hôtel"], "sans date : tri par nom (même ordre)");
assert.deepEqual(lieuxParJour([]), [], "aucun lieu : aucun groupe");

// ---------- carnet de voyage : totauxResas ----------
const membres = [{ prenom: "Yann" }, { prenom: "Claudia" }];
const resas = [
  { type: "vol", titre: "Aller", prix_centimes: 20000, paye_par: "Yann", statut: "reserve" },
  { type: "logement", titre: "Hôtel", prix_centimes: 15000, paye_par: "Claudia", statut: "reserve" },
  { type: "activite", titre: "Musée", prix_centimes: 5000, paye_par: null, statut: "reserve" },
  { type: "train", titre: "Annulé", prix_centimes: 9999, paye_par: "Yann", statut: "annule" },
];
const totaux = totauxResas(resas, membres);
assert.equal(totaux.total, 40000, "la résa annulée est exclue du total");
assert.deepEqual(totaux.parPrenom, { Yann: 20000, Claudia: 15000 });
assert.equal(totaux.nonPaye, 5000, "non payé compté à part, jamais fondu dans parPrenom");
assert.deepEqual(totauxResas([], membres), { total: 0, parPrenom: { Yann: 0, Claudia: 0 }, nonPaye: 0 });

// ---------- carnet de voyage : joursAvant ----------
assert.equal(joursAvant({ debut: "2026-10-17", fin: "2026-10-25" }, "2026-10-05"), 12);
assert.equal(joursAvant({ debut: "2026-10-17", fin: "2026-10-25" }, "2026-10-17"), "en cours");
assert.equal(joursAvant({ debut: "2026-10-17", fin: "2026-10-25" }, "2026-10-20"), "en cours");
assert.equal(joursAvant({ debut: "2026-10-17", fin: "2026-10-25" }, "2026-10-25"), "en cours");
assert.equal(joursAvant({ debut: "2026-10-17", fin: "2026-10-25" }, "2026-10-26"), "passé");

// ---------- topo : rendu markdown léger, sûr ----------
assert.equal(rendreTopo(""), "");
assert.equal(rendreTopo(null), "");
assert.equal(rendreTopo("## Titre"), "<h3>Titre</h3>");
assert.equal(rendreTopo("### Sous-titre"), "<h4>Sous-titre</h4>");
assert.equal(rendreTopo("- Un\n- Deux"), "<ul><li>Un</li><li>Deux</li></ul>");
assert.equal(rendreTopo("Du **gras** ici"), "<p>Du <strong>gras</strong> ici</p>");
assert.equal(rendreTopo("[Carte](https://maps.example/x)"),
  '<p><a href="https://maps.example/x" target="_blank" rel="noopener">Carte</a></p>');
assert.equal(rendreTopo("Para un.\n\nPara deux."), "<p>Para un.</p><p>Para deux.</p>");
assert.equal(rendreTopo("Ligne un\nLigne deux"), "<p>Ligne un<br>Ligne deux</p>", "même paragraphe, retour à la ligne simple");
// XSS : le HTML brut est neutralisé avant toute transformation.
assert.equal(rendreTopo("<script>alert(1)</script>"), "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
assert.equal(rendreTopo("[x](javascript:alert(1))"), "<p>[x](javascript:alert(1))</p>", "schéma non http(s) : reste du texte, jamais un lien");
assert.equal(rendreTopo('<img src=x onerror="alert(1)">'), "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>");
assert.equal(rendreTopo("## <b>Titre</b> **gras**"), "<h3>&lt;b&gt;Titre&lt;/b&gt; <strong>gras</strong></h3>", "titre : HTML échappé, gras transformé");

console.log("test_agenda OK");
