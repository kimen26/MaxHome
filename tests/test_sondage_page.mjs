// Page publique d'un sondage de date (brief proposer-date.md, lot 2) : rendu pur et sélection pure.
// Données INVENTÉES (L-049). Usage : node tests/test_sondage_page.mjs
import assert from "node:assert/strict";
import { rendreSondage, basculer, garderLibres, peutEnvoyer, grouperParSemaine, libelleJour, MSG_TERMINE } from "../frontend/proches/sondage-page.js";

const jours = [
  { jour: "2030-03-02", libre: true, ferie: null, vacances: null },
  { jour: "2030-03-03", libre: false, ferie: null, vacances: null },
  { jour: "2030-03-04", libre: true, ferie: "Fête test", vacances: null },
  { jour: "2030-03-09", libre: true, ferie: null, vacances: "Vacances de test" },
];
const base = { titre: "Raclette", message: "On se voit ?", jours, reponses_visibles: false };
const visibles = { ...base, reponses_visibles: true, votes: [{ prenom: "Zoé", jours: ["2030-03-02", "2030-03-09"] }, { prenom: "Max", jours: ["2030-03-02"] }] };
const compte = (s, motif) => (s.match(motif) ?? []).length;

// ---------- sélection pure ----------
const s0 = [];
const s1 = basculer(s0, "2030-03-04", jours);
assert.deepEqual(s1, ["2030-03-04"]);
assert.deepEqual(s0, [], "pas de mutation");
assert.deepEqual(basculer(s1, "2030-03-02", jours), ["2030-03-02", "2030-03-04"], "triée");
assert.deepEqual(basculer(s1, "2030-03-04", jours), [], "désélection");
assert.deepEqual(basculer(s1, "2030-03-03", jours), s1, "un jour pris ne se coche pas");
assert.deepEqual(basculer(s1, "2031-01-01", jours), s1, "un jour inconnu est ignoré");
assert.deepEqual(garderLibres(["2030-03-02", "2030-03-03", "2099-01-01"], jours), ["2030-03-02"]);
assert.equal(peutEnvoyer([], "Paul"), false);
assert.equal(peutEnvoyer(["2030-03-02"], "   "), false);
assert.equal(peutEnvoyer(["2030-03-02"], " Paul "), true);

// ---------- dates et semaines ----------
assert.equal(libelleJour("2030-03-02"), "sam. 2 mars");
const sem = grouperParSemaine(jours);
assert.equal(sem.length, 2);
assert.equal(sem[0].lundi, "2030-02-25");
assert.deepEqual(sem[0].jours.map((j) => j.jour), ["2030-03-02", "2030-03-03"], "sam. 2 et dim. 3");
assert.equal(sem[1].lundi, "2030-03-04");
assert.deepEqual(sem[1].jours.map((j) => j.jour), ["2030-03-04", "2030-03-09"], "le lundi 4 ouvre la semaine suivante");

// ---------- rendu : sondage ouvert, réponses cachées ----------
const p = rendreSondage(base, { selection: ["2030-03-04"], prenom: "Paul" });
assert.ok(p.includes("<h1>Raclette</h1>") && p.includes("On se voit ?"), "titre et mot");
assert.equal(compte(p, /<button type="button" class="sd-jour/g), 3, "3 jours libres touchables");
assert.equal(compte(p, /sd-jour sd-pris/g), 1, "1 jour pris");
assert.ok(/sd-pris">[^]*?<span class="sd-etat">pris<\/span>/.test(p), "libellé « pris » en texte");
assert.ok(p.includes("Férié : Fête test") && p.includes("Vacances : Vacances de test"), "étiquettes texte");
assert.equal(compte(p, /aria-pressed="true"/g), 1);
assert.ok(p.includes(">✓<") && p.includes("ça me va"), "coché par plus que la couleur");
assert.ok(p.includes('maxlength="40"') && p.includes('<label for="sd-prenom">'), "champ prénom avec label");
assert.ok(p.includes('value="Paul"'));
assert.ok(!/data-action="envoyer" disabled/.test(p), "bouton actif : un jour et un prénom");
assert.ok(!p.includes("Zoé") && !p.includes("réponse"), "réponses cachées : aucun prénom");

// ---------- bouton désactivé ----------
assert.ok(/data-action="envoyer" disabled/.test(rendreSondage(base, { selection: [], prenom: "Paul" })), "sans jour");
assert.ok(/data-action="envoyer" disabled/.test(rendreSondage(base, { selection: ["2030-03-02"], prenom: " " })), "sans prénom");
assert.ok(/disabled>Envoi…/.test(rendreSondage(base, { selection: ["2030-03-02"], prenom: "P", envoi: true })), "pendant l'envoi");

// ---------- réponses visibles ----------
const v = rendreSondage(visibles, {});
assert.ok(v.includes("2 réponses : Zoé, Max"), "prénoms sous le jour le plus coché");
assert.ok(v.includes("1 réponse : Zoé"));

// ---------- échappement ----------
const piege = rendreSondage({ ...base, titre: "<script>alert(1)</script>", message: "<img src=x onerror=1>",
  jours: [{ jour: "2030-03-02", libre: true, ferie: "<b>f</b>", vacances: null }], votes: [] },
{ prenom: '"><script>x</script>' });
assert.ok(!/<script|<img|<b>/.test(piege), "aucune balise issue des données");
assert.ok(piege.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));

// ---------- après envoi ----------
const ok = rendreSondage(base, { envoye: true, prenom: "Paul", selection: ["2030-03-02", "2030-03-04"] });
assert.ok(ok.includes("Merci, c'est noté !") && ok.includes("sam. 2 mars, lun. 4 mars"), "merci et récap");
assert.ok(ok.includes('data-action="modifier"') && !ok.includes("<form"), "modifier possible, plus de formulaire");

// ---------- erreur serveur affichée telle quelle ----------
assert.ok(rendreSondage(base, { selection: ["2030-03-02"], prenom: "P", erreur: "Trop de votes <3" }).includes("Trop de votes &lt;3"));

// ---------- jeton inconnu ----------
assert.ok(rendreSondage(null).includes(MSG_TERMINE) && MSG_TERMINE === "Ce sondage est terminé.");
assert.ok(!rendreSondage(null).includes("<form"));

console.log("test_sondage_page OK");
