// Recette connectée : login réel (mot de passe lu dans .env, jamais affiché), février 2026.
// Parcourt les 6 écrans de la refonte, coche un mouvement, change une règle de mois, capture tout.
// Vérifie aussi que sans session la RLS renvoie vide.
// Usage : node tests/recette_connectee.mjs
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const cfg = fs.readFileSync("frontend/config.js", "utf8");
const URL_SB = cfg.match(/SUPABASE_URL = "([^"]+)"/)[1];
const CLE = cfg.match(/SUPABASE_ANON_KEY = "([^"]+)"/)[1];
const nombre = (s) => Number(String(s).replace(/[^\d,-]/g, "").replace(",", "."));

// 1. RLS : la clé publique sans session ne voit rien, sur toutes les tables.
for (const table of ["revenus", "lignes", "mouvements", "mouvements_recurrents", "comptes"]) {
  const r = await fetch(`${URL_SB}/rest/v1/${table}?select=*`, { headers: { apikey: CLE, Authorization: `Bearer ${CLE}` } });
  const anon = await r.json();
  if (!Array.isArray(anon) || anon.length) throw new Error(`RLS trouée sur ${table} : ${JSON.stringify(anon).slice(0, 200)}`);
}
console.log("RLS OK — anonyme voit 0 ligne sur 5 tables");

// 2. Parcours connecté.
const RACINE = path.resolve("frontend");
const PORT = 8766;
const SORTIE = path.resolve("data/captures");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const serveur = http.createServer((req, res) => {
  const p = path.join(RACINE, req.url === "/" ? "index.html" : req.url.split("?")[0]);
  if (!p.startsWith(RACINE) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[path.extname(p)] ?? "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(PORT);
fs.mkdirSync(SORTIE, { recursive: true });
const navigateur = await chromium.launch();
const erreurs = [];

async function connecter(page) {
  await page.goto(`http://localhost:${PORT}/#2026-2`);
  await page.fill('input[name=email]', env.EMAIL_YANN);
  await page.fill('input[name=password]', env.PASS_YANN);
  await page.click('button[type=submit]');
  await page.waitForSelector("#ecran-mois:not([hidden])", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector("#titre-mois")?.textContent.includes("2026"));
}

try {
  // ---------- mobile ----------
  const page = await navigateur.newPage({ viewport: { width: 390, height: 844 } });
  page.on("console", (m) => m.type() === "error" && erreurs.push(`mobile: ${m.text()}`));
  page.on("pageerror", (e) => erreurs.push(`mobile: ${e.message}`));
  await connecter(page);

  if ((await page.textContent("#titre-mois")).trim() !== "Février 2026") throw new Error("titre du mois inattendu");
  console.log("Ce mois :", (await page.textContent("#sous-mois")).trim());
  await page.screenshot({ path: path.join(SORTIE, "mois-mobile.png"), fullPage: true });

  // Détail d'un mouvement + coche, si au moins un mouvement existe.
  const mouvements = await page.$$("#mvts-a-faire .mvt");
  if (mouvements.length) {
    await mouvements[0].click();
    await page.waitForSelector("#feuille:not([hidden]) .detail");
    const montant = await page.textContent("#feuille .detail-montant .grand");
    console.log("Détail mouvement :", montant.trim());
    await page.screenshot({ path: path.join(SORTIE, "detail-mobile.png"), fullPage: true });
    await page.click("#feuille [data-basculer]");
    await page.waitForFunction(() => document.querySelectorAll("#mvts-faits .mvt").length > 0, { timeout: 10000 });
    console.log("Mouvement coché OK");
    // On remet dans l'état d'origine (le DOM a été reconstruit : on resélectionne).
    await page.waitForSelector("#mvts-faits .mvt .case.cochee");
    await page.locator("#mvts-faits .mvt .case.cochee").first().click();
    await page.waitForFunction(() => document.querySelectorAll("#mvts-faits .mvt").length === 0, { timeout: 10000 });
    console.log("Coche annulée OK");
  } else {
    console.log("Aucun mouvement à faire ce mois — coche non testée");
  }

  // ---------- charges ----------
  await page.click('#onglets button[data-ecran=charges]');
  await page.waitForSelector("#ecran-charges:not([hidden]) .groupe");
  const sections = await page.$$eval("#categories .groupe-tete span:first-child", (e) => e.map((x) => x.textContent.trim()));
  console.log("Catégories :", sections.join(" | "));
  if (!sections.includes("Logement")) throw new Error("catégorie Logement absente");
  console.log("Charges :", (await page.textContent("#sous-charges")).trim());
  await page.screenshot({ path: path.join(SORTIE, "charges-mobile.png"), fullPage: true });

  // Règle du mois : bascule le premier segment puis revient.
  const seg = page.locator("#categories .segment").first();
  const avant = await seg.locator("button.actif").getAttribute("data-regle");
  const autre = avant === "egales" ? "proport" : "egales";
  await seg.locator(`button[data-regle=${autre}]`).click();
  await page.waitForFunction((a) => document.querySelector("#categories .segment button.actif")?.dataset.regle === a, autre, { timeout: 10000 });
  console.log(`Règle du mois : ${avant} → ${autre} OK`);
  await page.locator("#categories .segment").first().locator(`button[data-regle=${avant}]`).click();
  await page.waitForFunction((a) => document.querySelector("#categories .segment button.actif")?.dataset.regle === a, avant, { timeout: 10000 });
  console.log("Règle du mois remise au départ OK");

  // ---------- stats ----------
  await page.click('#onglets button[data-ecran=stats]');
  await page.waitForSelector("#stats-corps .carte");
  await page.waitForFunction(() => document.querySelectorAll("#stats-corps .colonne").length >= 6);
  await page.screenshot({ path: path.join(SORTIE, "stats-mobile.png"), fullPage: true });
  console.log("Stats rendues");

  await page.close();

  // ---------- PC ----------
  const pc = await navigateur.newPage({ viewport: { width: 1280, height: 900 } });
  pc.on("console", (m) => m.type() === "error" && erreurs.push(`pc: ${m.text()}`));
  pc.on("pageerror", (e) => erreurs.push(`pc: ${e.message}`));
  await connecter(pc);
  await pc.screenshot({ path: path.join(SORTIE, "mois-pc.png"), fullPage: true });

  // Février 2026 : total commun et part de Yann (référence Excel, ±1 ct).
  await pc.click('#barre-pc button[data-ecran=charges]');
  await pc.waitForSelector("#ecran-charges:not([hidden]) .groupe");
  await pc.screenshot({ path: path.join(SORTIE, "charges-pc.png"), fullPage: true });

  const totalCommun = await pc.evaluate(() => {
    const t = [...document.querySelectorAll("#chiffres-mois .chiffre")]
      .find((c) => c.textContent.includes("Total commun"));
    return t?.querySelector(".valeur")?.textContent ?? "";
  });

  await pc.click('#barre-pc button[data-ecran=mois]');
  await pc.waitForSelector("#ecran-mois:not([hidden])");
  const tc = await pc.evaluate(() => [...document.querySelectorAll("#chiffres-mois .chiffre")]
    .find((c) => c.textContent.includes("Total commun"))?.querySelector(".valeur")?.textContent ?? "");
  if (Math.abs(nombre(tc) - -5844.78) > 0.01) throw new Error(`total commun février 2026 inattendu : ${tc}`);
  console.log("Total commun février 2026 :", tc.trim(), "— conforme à l'Excel");

  const resteYann = await pc.evaluate(() => [...document.querySelectorAll("#chiffres-mois .chiffre")]
    .find((c) => c.textContent.includes("Reste Yann"))?.querySelector(".valeur")?.textContent ?? "");
  console.log("Reste Yann :", resteYann.trim());

  for (const [ecran, selecteur] of [["stats", "#stats-corps .carte"], ["recurrents", "#liste-recurrents"],
    ["comptes", "#liste-comptes"], ["annuel", "#tableau-annuel table"]]) {
    await pc.click(`#barre-pc button[data-ecran=${ecran}]`);
    await pc.waitForSelector(selecteur, { timeout: 15000 });
    await pc.screenshot({ path: path.join(SORTIE, `${ecran}-pc.png`), fullPage: true });
    console.log(`Écran ${ecran} rendu`);
  }
  await pc.close();
} finally {
  await navigateur.close();
  serveur.close();
}
if (erreurs.length) { console.error("Erreurs console :\n" + erreurs.join("\n")); process.exit(1); }
console.log(`recette connectée OK — captures dans ${SORTIE}`);
