// Partage d'un voyage (brief fiche-voyage-v3.md, lot 3) : filtrage PUR (miroir JS de la fonction SQL
// voyage_partage), rendu de la page partagée, fichier « Télécharger la page ». Aucune clé privée
// (code, prix_centimes, paye_par, prestataire, note, poste) ni valeur privée ne doit en sortir.
// Données INVENTÉES (L-049). Usage : node tests/test_partage.mjs
import assert from "node:assert/strict";
import { filtrerPourPartage, CHAMPS_LIEU, CHAMPS_RESA, CHAMPS_BLOC, CHAMPS_VOYAGE } from "../frontend/agenda/partage-filtre.js";
import { rendrePagePartage, ONGLETS_PARTAGE } from "../frontend/agenda/partage-page.js";
import { construirePageAutonome, nomFichierCarnet } from "../frontend/agenda/partage-telecharger.js";

const INTERDITES = ["code", "prix_centimes", "paye_par", "prestataire", "note", "poste", "adresse", "photo_chemin", "voyage_id", "cree_par", "todos", "enveloppes", "pieces"];
const SECRETS = ["CODE-SECRET", "CODE-GITE", "PAYEUR-X", "PRESTA-X", "NOTE-PRIVEE", "NOTE-RESA", "ADRESSE-PRIVEE", "PHOTO-PRIVEE", "99,00", "12,34"];

const voyage = { id: 7, titre: "Semaine <test> & co", lieu: "Quelquepart", debut: "2030-03-01", fin: "2030-03-03", note: "NOTE-PRIVEE", cree_par: "PAYEUR-X" };
const lieux = [
  { id: 1, voyage_id: 7, nom: "Alpha", categorie: "a_voir", statut: "prevu", jour: "2030-03-01", ordre: 0, lat: 45.1, lng: 3.2, lien: "https://exemple.test/a",
    topo: "Un parc", horaires: "9h-17h", note: "NOTE-PRIVEE", adresse: "ADRESSE-PRIVEE", photo_chemin: "PHOTO-PRIVEE", cree_par: "PAYEUR-X" },
  { id: 2, voyage_id: 7, nom: "Bravo", categorie: "resto", statut: "idee", jour: "2030-03-02", ordre: 1, lat: null, lng: null, lien: null, topo: null, horaires: null, note: "NOTE-PRIVEE" },
];
const resas = [
  { id: 1, voyage_id: 7, type: "activite", statut: "reserve", titre: "Billet Bravo", lieu_id: 2, debut: "2030-03-02T10:30:00", fin: null,
    prix_centimes: 1234, paye_par: "PAYEUR-X", code: "CODE-SECRET", prestataire: "PRESTA-X", note: "NOTE-RESA", poste: "activites" },
  { id: 2, voyage_id: 7, type: "logement", statut: "reserve", titre: "Nuits Gîte", lieu_id: null, debut: "2030-03-01T15:00:00", fin: "2030-03-03T10:00:00",
    prix_centimes: 9900, code: "CODE-GITE", paye_par: null, prestataire: null, note: null, poste: "logement" },
  { id: 3, voyage_id: 7, type: "vol", statut: "annule", titre: "Vol annulé", lieu_id: null, debut: "2030-03-01T07:00:00", prix_centimes: 100, code: "CODE-SECRET" },
];
const blocs = [{ id: 1, voyage_id: 7, type: "resume", titre: null, texte: "Un week-end test", ordre: 0, cree_par: "PAYEUR-X" }, { id: 2, voyage_id: 7, type: "astuce", titre: "Bon plan", texte: "Texte astuce", ordre: 1 }];

/** Toutes les clés d'un arbre JSON. */
const cles = (v) => (Array.isArray(v) ? v.flatMap(cles) : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => [k, ...cles(x)]) : []);
const sansSecret = (texte, quoi) => { for (const s of SECRETS) assert.ok(!texte.includes(s), `${quoi} : « ${s} » fuit`); };

// ---------- filtrage : liste blanche exacte ----------
const donnees = filtrerPourPartage(voyage, lieux, resas, blocs);
assert.deepEqual(Object.keys(donnees).sort(), ["blocs", "lieux", "resas", "voyage"]);
assert.deepEqual(Object.keys(donnees.voyage), CHAMPS_VOYAGE);
for (const l of donnees.lieux) assert.deepEqual(Object.keys(l), CHAMPS_LIEU);
for (const r of donnees.resas) assert.deepEqual(Object.keys(r), CHAMPS_RESA);
for (const b of donnees.blocs) assert.deepEqual(Object.keys(b), CHAMPS_BLOC);
assert.equal(donnees.resas.length, 2, "la résa annulée ne part pas");
for (const k of INTERDITES) assert.ok(!cles(donnees).includes(k), `clé interdite dans les données : ${k}`);
sansSecret(JSON.stringify(donnees), "données filtrées");
assert.equal(donnees.lieux[0].topo, "Un parc");
assert.equal(donnees.lieux[1].lat, null, "une valeur absente reste null, pas undefined");
assert.deepEqual(voyage.note, "NOTE-PRIVEE", "les données d'origine ne sont pas mutées");

// ---------- la page partagée : 4 onglets, pas d'À faire, aucun secret ----------
assert.deepEqual(ONGLETS_PARTAGE.map((o) => o.libelle), ["Planning", "Activités", "Carte", "Infos"]);
const meteo = new Map([["2030-03-02", { jour: "2030-03-02", min: 8, max: 12, mm: 15, nbPluie: 4, nbModeles: 4, verdict: "pluie", icone: "🌧️", mot: "Pluie" }]]);
const page = rendrePagePartage(donnees, meteo, { aujourdhui: "2030-02-20" });
sansSecret(page, "page");
assert.ok(!page.includes("€"), "aucun prix dans la page");
assert.ok(!/À faire/.test(page), "pas d'onglet À faire");
assert.equal((page.match(/data-onglet="/g) ?? []).length, 4);
assert.equal((page.match(/class="fv-jc /g) ?? []).length, 3, "feuille de route : 3 jours");
assert.ok(page.includes("Prévoir la pluie"), "météo rendue");
assert.ok(page.includes("J-9"), "compteur J-n quand on connaît la date du jour");
assert.ok(!page.includes("data-copier-code") && !page.includes("data-modifier-lieu") && !page.includes("data-choix-statut"), "aucune action ni code copiable");
assert.ok(!rendrePagePartage(donnees, null).includes("bandeau-decompte"), "fichier téléchargé : pas de compteur figé");
assert.ok(page.includes("Semaine &lt;test&gt; &amp; co"), "titre échappé");

// ---------- fichier téléchargé ----------
const fichier = construirePageAutonome(donnees, meteo, "body{margin:0}");
sansSecret(fichier, "fichier téléchargé");
assert.ok(fichier.startsWith("<!doctype html>"));
assert.ok(fichier.includes("<style>body{margin:0}</style>"), "CSS en ligne");
assert.ok(fichier.includes("cdnjs.cloudflare.com/ajax/libs/leaflet/"), "Leaflet depuis cdnjs");
assert.ok(!/<link[^>]+href="(?!https:\/\/cdnjs)/.test(fichier), "aucune ressource locale ou autre tiers");
assert.ok(fichier.includes("<title>Semaine &lt;test&gt; &amp; co</title>"));
const json = /<script type="application\/json" id="points">(.*?)<\/script>/s.exec(fichier)[1];
const points = JSON.parse(json);
assert.equal(points.length, 1, "un seul lieu localisé non écarté");
assert.deepEqual(Object.keys(points[0]).sort(), ["couleur", "itineraire", "lat", "lng", "mot", "nom"]);
for (const k of INTERDITES) assert.ok(!cles(points).includes(k), `clé interdite dans les points : ${k}`);
const scripts = [...fichier.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
for (const k of INTERDITES.filter((k) => !["note", "code", "poste", "todos", "pieces"].includes(k))) assert.ok(!scripts.includes(k), `script : ${k}`);
// Le JSON ne peut pas fermer la balise <script> prématurément.
const piege = construirePageAutonome({ ...donnees, lieux: [{ ...donnees.lieux[0], nom: "</script><b>x" }] }, null, "");
assert.ok(!/id="points">[^]*?<\/script><b>/.test(piege), "« </script> » dans un nom est échappé");

// ---------- nom de fichier ----------
assert.equal(nomFichierCarnet("Week-end à la mer"), "week-end-a-la-mer-carnet.html");
assert.equal(nomFichierCarnet("  Ça/va : « bien » ?  "), "ca-va-bien-carnet.html");
assert.equal(nomFichierCarnet(""), "voyage-carnet.html");
assert.equal(nomFichierCarnet(null), "voyage-carnet.html");

console.log("test_partage OK");
