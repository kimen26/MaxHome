// Preuve en direct, LECTURE SEULE : login réel (mot de passe lu dans .env, jamais affiché),
// sur l'app servie localement (même patron que recette_connectee.mjs). Ouvre Agenda › Voyages,
// capture la liste, ouvre la fiche « Malaga », capture chaque section en défilant (Réservations
// & dépenses, Carte avec vraies tuiles Leaflet, Lieux, mosaïque de blocs) à 320, 360 et 1200 px
// (D-047 §V2 : la mise en page change de forme à ces largeurs). AUCUNE écriture : pas de clic sur
// une case, Modifier, +, Localiser, Cadrer — seulement navigation et défilement. Vérifie aussi
// que rien ne déborde horizontalement (scrollWidth <= innerWidth) sur chaque capture.
// Usage : node tests/recette_voyage_reel.mjs
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s).slice(0, 2)));

const RACINE = path.resolve("frontend");
const PORT = 8767;
const SORTIE = path.resolve("data/captures/reel");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const LARGEURS = [320, 360, 1200];
const TITRE_VOYAGE = "Malaga";

const serveur = http.createServer((req, res) => {
  const p = path.join(RACINE, req.url === "/" ? "index.html" : req.url.split("?")[0]);
  if (!p.startsWith(RACINE) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[path.extname(p)] ?? "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(PORT);
fs.mkdirSync(SORTIE, { recursive: true });

const navigateur = await chromium.launch();
const erreurs = [];
const debordements = [];
let nbCaptures = 0;

async function connecter(page) {
  await page.goto(`http://localhost:${PORT}/`);
  await page.fill('input[name=email]', env.EMAIL_YANN);
  await page.fill('input[name=password]', env.PASS_YANN);
  await page.click('button[type=submit]');
  try {
    await page.waitForSelector("#ecran-accueil:not([hidden]) .module-carte", { timeout: 20000 });
  } catch (e) {
    // Échec intermittent (TODO Lane J) : dire ce que l'écran affiche au lieu d'un simple timeout.
    const visible = await page.evaluate(() => document.body.innerText.slice(0, 400));
    throw new Error(`connexion non aboutie en 20 s — écran : ${visible.replace(/\s+/g, " ")}`);
  }
}

/** Mesure le débordement horizontal réel (comme recette_ecrans.mjs) : jamais à l'œil sur une
 *  capture, toujours par géométrie DOM. */
async function verifierLargeur(page, nom, largeurAttendue) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
  }));
  if (scrollWidth > innerWidth) {
    debordements.push(`${nom} : scrollWidth=${scrollWidth} > innerWidth=${innerWidth} (attendu ${largeurAttendue}px)`);
  }
}

async function capturer(page, nom, largeur) {
  await verifierLargeur(page, nom, largeur);
  await page.screenshot({ path: path.join(SORTIE, `${nom}-${largeur}.png`), fullPage: true });
  nbCaptures++;
}

try {
  for (const largeur of LARGEURS) {
    const page = await navigateur.newPage({ viewport: { width: largeur, height: 900 } });
    page.on("console", (m) => { if (m.type() === "error") erreurs.push(`${largeur}px: ${m.text()}`); });
    page.on("pageerror", (e) => erreurs.push(`${largeur}px: ${e.message}`));
    await connecter(page);

    // ---------- Voyages › Pépites : le vrai dernier relevé MaxVoyage (veille_vols) ----------
    const nav = await page.isVisible("#barre-pc") ? "#barre-pc" : "#onglets";
    await page.click(`${nav} button[data-ecran=voyages-liste]`);
    await page.waitForSelector("#ecran-voyages-liste:not([hidden])", { timeout: 15000 });
    await page.click(`#ecran-voyages-liste:not([hidden]) [data-ecran=pepites]`);
    await page.waitForSelector("#pepites-corps .pp-releve, #pepites-corps .vide", { timeout: 15000 });
    await capturer(page, "voyage-reel-pepites", largeur);

    // ---------- Voyages › Alertes : les vraies alertes MaxVoyage (veille_alertes, RLS membre) ----------
    await page.click(`#ecran-pepites:not([hidden]) [data-ecran=alertes]`);
    await page.waitForSelector("#liste-alertes .rec, #liste-alertes .vide", { timeout: 15000 });
    await capturer(page, "voyage-reel-alertes", largeur);

    // ---------- Voyages › Nos voyages : la liste ----------
    await page.click(`#ecran-alertes:not([hidden]) [data-ecran=voyages-liste]`);
    await page.waitForSelector("#ecran-voyages-liste:not([hidden]) #voyages-liste-corps", { timeout: 15000 });
    await page.waitForSelector("#voyages-liste-corps .carte-voyage, #voyages-liste-corps .vide", { timeout: 15000 });
    await capturer(page, "voyage-reel-liste", largeur);

    // ---------- fiche « Malaga » ----------
    const carteMalaga = page.locator(".carte-voyage", { hasText: TITRE_VOYAGE }).first();
    if (!(await carteMalaga.count())) {
      // Le voyage est peut-être replié sous « Passés » : on le déplie avant de renoncer.
      const pliee = page.locator("[data-plier-voyages-passes]");
      if (await pliee.count()) {
        await pliee.click();
        await page.waitForTimeout(150);
      }
    }
    const carte = page.locator(".carte-voyage", { hasText: TITRE_VOYAGE }).first();
    if (!(await carte.count())) throw new Error(`voyage « ${TITRE_VOYAGE} » introuvable dans la liste`);
    await carte.click();
    await page.waitForSelector("#feuille-corps [data-fiche-voyage]", { timeout: 10000 });
    // La carte Leaflet se peuple après coup (chargement à la demande, vrai réseau ici — pas de
    // stub) : on lui laisse le temps d'arriver, tuiles comprises, avant de défiler dessus.
    await page.waitForSelector(".leaflet-container, .carte-indisponible", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);

    // Bandeau + Résumé + Prochaine étape + Budget : haut de la feuille plein écran.
    await page.evaluate(() => document.querySelector("#fiche-bandeau-corps")?.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(150);
    await capturer(page, "voyage-reel-fiche-tete", largeur);

    // Réservations & dépenses.
    await page.evaluate(() => document.querySelector("#fiche-resas-corps")?.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(150);
    await capturer(page, "voyage-reel-fiche-resas", largeur);

    // Carte : vraies tuiles chargées.
    await page.waitForSelector(".leaflet-tile-loaded, .leaflet-tile, .carte-indisponible", { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => document.querySelector("#fiche-carte-corps")?.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(500); // laisse les tuiles réseau finir de se poser
    await capturer(page, "voyage-reel-fiche-carte", largeur);

    // Lieux.
    await page.evaluate(() => document.querySelector("#fiche-lieux-corps")?.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(150);
    await capturer(page, "voyage-reel-fiche-lieux", largeur);

    // Mosaïque de blocs (résumé, infos, astuces, attentions — rendus par rendreTopo, jamais les
    // balises markdown brutes à l'écran).
    await page.evaluate(() => document.querySelector("#fiche-blocs-corps")?.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(150);
    await capturer(page, "voyage-reel-fiche-blocs", largeur);

    await page.close();
  }
} finally {
  await navigateur.close();
  serveur.close();
}

console.log(`Captures produites : ${nbCaptures} → ${SORTIE}`);
if (debordements.length) console.error(`\nDébordements horizontaux (${debordements.length}) :\n` + debordements.join("\n"));
if (erreurs.length) console.error(`\nErreurs console/page (${erreurs.length}) :\n` + erreurs.join("\n"));
if (debordements.length || erreurs.length) process.exit(1);
console.log("recette voyage réel OK");
