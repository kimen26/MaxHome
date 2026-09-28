// Recette de la mise à jour automatique (D-040) : un déploiement doit s'afficher SANS geste —
// ni deuxième ouverture, ni Ctrl+F5 — dès que l'app revient au premier plan, et jamais en
// pleine saisie. Sert une COPIE de frontend/ (le dépôt n'est jamais modifié), simule deux
// déploiements en réécrivant sw-version.js et index.html dans la copie, et vérifie :
//   1. première visite : le worker s'installe, la page ne se recharge pas ;
//   2. déploiement v2 + retour au premier plan : la page se recharge seule sur la v2 ;
//   3. déploiement v3 pendant une saisie : pas de rechargement ; il a lieu quand l'app passe
//      en arrière-plan.
// Aucun réseau extérieur (Supabase, CDN, polices bloqués). Usage : node tests/recette_mise_a_jour.mjs
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const COPIE = fs.mkdtempSync(path.join(os.tmpdir(), "maxhome-maj-"));
fs.cpSync(path.resolve("frontend"), COPIE, { recursive: true });
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };

const serveur = http.createServer((req, res) => {
  const chemin = path.join(COPIE, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html");
  if (!chemin.startsWith(COPIE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": MIME[path.extname(chemin)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
  res.end(fs.readFileSync(chemin));
});
await new Promise((ok) => serveur.listen(0, "127.0.0.1", ok));
const URL_APP = `http://127.0.0.1:${serveur.address().port}/index.html`;

/** Simule un déploiement : nouveau hash de coquille + un repère lisible dans index.html. */
function deployer(version) {
  fs.writeFileSync(path.join(COPIE, "sw-version.js"), `self.SW_VERSION = "recette-${version}";\n`);
  const index = path.join(COPIE, "index.html");
  const html = fs.readFileSync(index, "utf8").replace(/<meta name="recette-version"[^>]*>\n?/, "");
  fs.writeFileSync(index, html.replace("<head>", `<head>\n<meta name="recette-version" content="${version}">`));
}
const versionAffichee = (page) => page.evaluate(() => document.querySelector('meta[name="recette-version"]')?.content ?? null);
const retourPremierPlan = (page) => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
const passageArrierePlan = (page) => page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
});
/** Promesse (côté page) résolue au prochain changement de worker actif, ou `false` après 15 s :
 *  sans mécanisme de mise à jour, aucun worker ne change et la recette doit échouer, pas pendre. */
const attendreNouveauWorker = (page) => page.evaluate(() => { window.__nouveauWorker = new Promise((ok) => {
  navigator.serviceWorker.addEventListener("controllerchange", () => ok(true), { once: true });
  setTimeout(() => ok(false), 15000);
}); });

const echecs = [];
const verifier = (condition, message) => {
  if (condition) { console.log(`OK  ${message}`); return; }
  echecs.push(message);
  console.log(`KO  ${message}`);
};

const navigateur = await chromium.launch();
try {
  const contexte = await navigateur.newContext();
  await contexte.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  const page = await contexte.newPage();

  // 1. Première visite.
  deployer("1");
  await page.goto(URL_APP);
  await page.evaluate(() => { window.__marque = "visite-1"; });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  verifier(await page.evaluate(() => window.__marque) === "visite-1", "première visite : worker installé sans rechargement");

  // 2. Déploiement v2, l'app revient au premier plan → rechargement seul sur la v2.
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  verifier(await versionAffichee(page) === "1", "v1 affichée avant le déploiement");
  deployer("2");
  await retourPremierPlan(page);
  await page.waitForFunction(() => document.querySelector('meta[name="recette-version"]')?.content === "2", null, { timeout: 15000 })
    .catch(() => {});
  verifier(await versionAffichee(page) === "2", "déploiement v2 : la page s'est rechargée seule sur la v2");

  // 3. Déploiement v3 pendant une saisie : on attend l'arrière-plan.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
  await page.evaluate(() => { window.__marque = "saisie"; });
  const champ = page.locator("input:visible").first();
  await champ.focus();
  await attendreNouveauWorker(page);
  deployer("3");
  await retourPremierPlan(page);
  verifier(await page.evaluate(() => window.__nouveauWorker), "v3 : nouvelle version installée pendant la saisie");
  await page.waitForTimeout(800);
  verifier(await page.evaluate(() => window.__marque) === "saisie", "v3 pendant une saisie : pas de rechargement");
  await passageArrierePlan(page);
  await page.waitForFunction(() => document.querySelector('meta[name="recette-version"]')?.content === "3", null, { timeout: 15000 })
    .catch(() => {});
  verifier(await versionAffichee(page) === "3", "v3 : rechargée au passage en arrière-plan");
} finally {
  await navigateur.close();
  serveur.close();
  fs.rmSync(COPIE, { recursive: true, force: true });
}

if (echecs.length) {
  console.error(`\nrecette mise à jour ÉCHEC :\n${echecs.map((e) => `  - ${e}`).join("\n")}`);
  process.exit(1);
}
console.log("recette mise à jour OK");
