// Capture chaque état de la maquette (inbox/…/MaxHome - Tâches.dc.html, jamais commitée)
// dans inbox/Audit Refonte/ref/maquette/*.png : ce sont les images de référence que la
// planche côte à côte (tests/recette_ecrans.mjs --planche) met à côté des captures de l'app.
// La maquette charge React/Babel depuis unpkg : il faut le réseau. Usage : node tests/outils/capture_maquette.mjs
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
const FICHIER = path.resolve("inbox/Audit Refonte/design_handoff_maxhome_taches/MaxHome - Tâches.dc.html");
const SORTIE = path.resolve("inbox/Audit Refonte/ref/maquette");
fs.mkdirSync(SORTIE, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 440, height: 900 }, deviceScaleFactor: 2 });
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto(pathToFileURL(FICHIER).href, { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
const ecran = () => p.locator('[data-screen-label="MaxHome - mobile"]');
const shot = async (nom) => { await p.waitForTimeout(350); await ecran().screenshot({ path: path.join(SORTIE, `${nom}.png`) }); console.log("ok", nom); };
const tap = async (texte, { dernier = false } = {}) => {
  const l = ecran().locator("button", { hasText: texte });
  await (dernier ? l.last() : l.first()).click({ timeout: 5000 });
  await p.waitForTimeout(350);
};
const fermer = async () => { await p.mouse.click(30, 40); await p.waitForTimeout(350); };
const essayer = async (nom, f) => { try { await f(); } catch (e) { console.log("ÉCHEC", nom, e.message.split("\n")[0]); } };
await shot("jour");
await essayer("todo", async () => { await tap("Todo"); await shot("feuille-todo"); await fermer(); });
await essayer("ajout", async () => { await tap("Ajouter", { dernier: true }); await shot("feuille-ajout"); await fermer(); });
await essayer("semaine", async () => { await tap("Semaine"); await shot("semaine"); });
await essayer("budget", async () => { await tap("Budget"); await shot("budget"); });
await essayer("ajout-budget", async () => { await tap("Ajouter", { dernier: true }); await shot("feuille-ajout-budget"); await fermer(); });
await essayer("courses", async () => { await tap("Courses"); await shot("courses"); });
await essayer("tour", async () => { await tap("On fait le tour"); await shot("feuille-tour"); await fermer(); });
await essayer("reglages", async () => { await tap("Réglages"); await shot("reglages-parts"); });
await essayer("charges", async () => { await tap("Charges"); await shot("reglages-charges"); });
await essayer("magasin", async () => { await tap("Magasin"); await shot("reglages-magasin"); });
await b.close();
