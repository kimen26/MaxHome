// Recette connectée : login réel (mot de passe lu dans .env, jamais affiché),
// ouvre février 2026, vérifie le bloc à faire, les sections catégories, coche/décoche un virement.
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

// 1. RLS : la clé publique sans session ne voit rien.
const r = await fetch(`${URL_SB}/rest/v1/revenus?select=*`, { headers: { apikey: CLE, Authorization: `Bearer ${CLE}` } });
const anon = await r.json();
if (!Array.isArray(anon) || anon.length) throw new Error(`RLS trouée : ${JSON.stringify(anon).slice(0, 200)}`);
console.log("RLS OK — anonyme voit 0 ligne");

// 2. Parcours connecté.
const RACINE = path.resolve("frontend");
const PORT = 8766;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const serveur = http.createServer((req, res) => {
  const p = path.join(RACINE, req.url === "/" ? "index.html" : req.url.split("?")[0]);
  if (!p.startsWith(RACINE) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[path.extname(p)] ?? "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(PORT);
fs.mkdirSync("data/captures", { recursive: true });
const navigateur = await chromium.launch();
const erreurs = [];
try {
  const page = await navigateur.newPage({ viewport: { width: 390, height: 844 } });
  page.on("console", (m) => m.type() === "error" && erreurs.push(m.text()));
  page.on("pageerror", (e) => erreurs.push(e.message));
  await page.goto(`http://localhost:${PORT}/#2026-2`);
  await page.fill('input[name=email]', env.EMAIL_YANN);
  await page.fill('input[name=password]', env.PASS_YANN);
  await page.click('button[type=submit]');

  // Bloc « à faire » présent avec au moins une carte par membre + reste à vivre.
  await page.waitForSelector(".bloc-a-faire .carte-verse", { timeout: 20000 });
  const cartes = await page.$$eval(".bloc-a-faire .carte-verse .montant-gros", (els) => els.map((e) => e.textContent));
  if (cartes.length < 2) throw new Error(`bloc à faire incomplet : ${cartes.length} cartes`);
  console.log("Bloc à faire :", cartes.join(" | "));

  // Sections catégories présentes (au moins Logement).
  await page.waitForFunction(() => document.querySelectorAll("#categories details").length > 0);
  const sections = await page.$$eval("#categories details summary", (els) => els.map((e) => e.textContent.trim()));
  console.log("Sections :", sections.join(" | "));
  if (!sections.some((s) => s.startsWith("Logement"))) throw new Error("section Logement absente");

  // Février 2026 : total commun et parts attendues (référence Excel, ±1 ct).
  const total = await page.textContent("#total");
  const nombre = (s) => Number(s.replace(/[^\d,-]/g, "").replace(",", "."));
  if (Math.abs(nombre(total) - -5844.78) > 0.01) throw new Error(`total février 2026 inattendu : ${total}`);

  const montantYann = await page.$eval('.carte-verse .copier[data-p=Yann]', (b) => b.dataset.montant);
  if (Math.abs(Number(montantYann) - 3236.15) > 0.01) throw new Error(`part Yann inattendue : ${montantYann}`);

  // Cocher puis décocher le virement de Yann.
  const chk = page.locator('.fait input[type=checkbox][data-p=Yann]');
  await chk.check();
  await page.waitForTimeout(500); // écriture réseau
  if (!(await chk.isChecked())) throw new Error("case virement non cochée");
  await chk.uncheck();
  await page.waitForTimeout(500);
  if (await chk.isChecked()) throw new Error("case virement non décochée");
  console.log("Virement Yann : coché puis décoché OK");

  await page.screenshot({ path: "data/captures/connecte-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.screenshot({ path: "data/captures/connecte-desktop.png", fullPage: true });
} finally {
  await navigateur.close();
  serveur.close();
}
if (erreurs.length) { console.error("Erreurs console :\n" + erreurs.join("\n")); process.exit(1); }
console.log("recette connectée OK");
