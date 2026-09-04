// Recette visuelle : sert frontend/, capture mobile + desktop, échoue sur erreur console.
// Usage : node tests/recette_visuelle.mjs   (captures dans data/captures/)
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const RACINE = path.resolve("frontend");
const PORT = 8765;
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
try {
  for (const [nom, viewport] of [["mobile", { width: 390, height: 844 }], ["desktop", { width: 1200, height: 800 }]]) {
    const page = await navigateur.newPage({ viewport });
    page.on("console", (m) => m.type() === "error" && erreurs.push(`${nom}: ${m.text()}`));
    page.on("pageerror", (e) => erreurs.push(`${nom}: ${e.message}`));
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(SORTIE, `${nom}.png`), fullPage: true });
    await page.close();
  }
} finally {
  await navigateur.close();
  serveur.close();
}
if (erreurs.length) { console.error("Erreurs console :\n" + erreurs.join("\n")); process.exit(1); }
console.log(`recette visuelle OK — captures dans ${SORTIE}`);
