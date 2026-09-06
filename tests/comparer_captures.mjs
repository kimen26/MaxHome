// Compare pixel à pixel data/captures/*.png avec data/captures/avant/*.png, sans dépendance :
// les deux images sont dessinées sur un canvas dans Chromium et comparées via getImageData.
// Usage : node tests/comparer_captures.mjs [--seuil 0.5] [--attendu jour-mobile,jour-pc]
//   --seuil   : % de pixels différents toléré pour une capture « inchangée » (défaut 0.5)
//   --attendu : captures dont on ATTEND un changement ; elles sont listées, jamais bloquantes
// Sortie : une ligne par capture, échec si une capture non attendue dépasse le seuil.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (nom, defaut) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : defaut; };
const SEUIL = Number(opt("--seuil", "0.5"));
const ATTENDUES = new Set((opt("--attendu", "") || "").split(",").filter(Boolean));
const DOSSIER = path.resolve("data/captures");
const AVANT = path.join(DOSSIER, "avant");

if (!fs.existsSync(AVANT)) { console.error("pas de référence : data/captures/avant/ absent"); process.exit(2); }
const noms = fs.readdirSync(AVANT).filter((f) => f.endsWith(".png") && fs.existsSync(path.join(DOSSIER, f)));

const nav = await chromium.launch();
const page = await nav.newPage();
await page.setContent("<canvas id=a></canvas><canvas id=b></canvas>");
const lire = (f) => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`;

let echecs = 0;
for (const nom of noms.sort()) {
  const r = await page.evaluate(async ([avant, apres]) => {
    const charger = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
    const [ia, ib] = await Promise.all([charger(avant), charger(apres)]);
    const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
    const donnees = (img) => {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, w, h).data;
    };
    const a = donnees(ia), b = donnees(ib);
    let diff = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) diff++;
    }
    return { pct: (diff / (w * h)) * 100, taille: `${ia.width}x${ia.height}→${ib.width}x${ib.height}` };
  }, [lire(path.join(AVANT, nom)), lire(path.join(DOSSIER, nom))]);

  const cle = nom.replace(/\.png$/, "");
  const attendue = ATTENDUES.has(cle);
  const ok = r.pct <= SEUIL;
  const etat = ok ? "identique" : attendue ? "CHANGÉE (attendu)" : "CHANGÉE";
  if (!ok && !attendue) echecs++;
  console.log(`${etat.padEnd(18)} ${cle.padEnd(22)} ${r.pct.toFixed(2).padStart(6)} %  ${r.taille}`);
}
await nav.close();
if (echecs) { console.error(`\n${echecs} capture(s) ont changé sans être attendues — à REGARDER (L-009).`); process.exit(1); }
console.log("\ncomparaison OK — rien n'a bougé hors des captures attendues");
