// Preuve en direct, LECTURE SEULE : login réel (mot de passe lu dans .env, jamais affiché),
// sur l'app servie localement (même patron que recette_voyage_reel.mjs). Capture l'écran Mois
// (D-052 : liste unifiée) à 360 px pour septembre et octobre 2026, avec de vraies données —
// seul moyen de vérifier l'ordre réel de l'écran (bandeau → salaires/répartition/totaux →
// sélecteur → liste À faire/Fait → Ce mois seulement) avec un vrai virement au commun et de
// vraies charges ponctuelles, que la maquette ne reproduit pas forcément.
// AUCUNE écriture : pas de clic sur une case, un bouton ou un lien qui modifierait une donnée —
// seulement navigation par le hash d'URL (#AAAA-M) et capture.
// Usage : node tests/recette_mois_reel.mjs
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s).slice(0, 2)));

const RACINE = path.resolve("frontend");
const PORT = 8768;
const SORTIE = path.resolve("data/captures/reel");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const LARGEUR = 360;
const MOIS = ["2026-9", "2026-10"];

const serveur = http.createServer((req, res) => {
  const p = path.join(RACINE, req.url === "/" ? "index.html" : req.url.split("?")[0]);
  if (!p.startsWith(RACINE) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[path.extname(p)] ?? "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(PORT);
fs.mkdirSync(SORTIE, { recursive: true });

const navigateur = await chromium.launch();
const erreurs = [];
let nbCaptures = 0;

async function connecter(page) {
  await page.goto(`http://localhost:${PORT}/`);
  await page.fill('input[name=email]', env.EMAIL_YANN);
  await page.fill('input[name=password]', env.PASS_YANN);
  await page.click('button[type=submit]');
  await page.waitForSelector("#ecran-accueil:not([hidden]) .module-carte", { timeout: 20000 });
  await page.click("#ecran-accueil .module-carte:has-text('Budget')");
  await page.waitForFunction(() => /20[0-9][0-9]/.test(document.querySelector("#titre-mois")?.textContent || ""), null, { timeout: 20000 });
}

try {
  const page = await navigateur.newPage({ viewport: { width: LARGEUR, height: 1400 } });
  page.on("console", (m) => { if (m.type() === "error") erreurs.push(`${m.text()}`); });
  page.on("pageerror", (e) => erreurs.push(`${e.message}`));
  await connecter(page);
  for (const hash of MOIS) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForFunction((h) => location.hash === `#${h}`, hash);
    await page.waitForFunction(() => /20[0-9][0-9]/.test(document.querySelector("#titre-mois")?.textContent || ""), null, { timeout: 20000 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SORTIE, `mois-reel-${hash}-360.png`), fullPage: true });
    nbCaptures++;
  }
  await page.close();
} finally {
  await navigateur.close();
  serveur.close();
}

console.log(`Captures produites : ${nbCaptures} → ${SORTIE}`);
if (erreurs.length) { console.error(`\nErreurs console/page (${erreurs.length}) :\n` + erreurs.join("\n")); process.exit(1); }
console.log("recette mois réel OK");
