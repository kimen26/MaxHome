// Recette connectée : login réel (mot de passe lu dans .env, jamais affiché), février 2026.
// Accueil, six écrans Budget, trois écrans Tâches, deux écrans Courses (dont Magasin) ; coche
// un mouvement et une tâche (cycle tri-état via le détail), remet tout en place.
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
const TABLES = ["revenus", "lignes", "mouvements", "mouvements_recurrents", "comptes",
  "taches", "taches_recurrentes", "courses", "courses_rayons"];
for (const table of TABLES) {
  const r = await fetch(`${URL_SB}/rest/v1/${table}?select=*`, { headers: { apikey: CLE, Authorization: `Bearer ${CLE}` } });
  const anon = await r.json();
  if (!Array.isArray(anon) || anon.length) throw new Error(`RLS trouée sur ${table} : ${JSON.stringify(anon).slice(0, 200)}`);
}
console.log(`RLS OK — anonyme voit 0 ligne sur ${TABLES.length} tables`);

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
  // Premier lancement sur ce navigateur : on atterrit sur l'accueil, avec les résumés des modules.
  await page.waitForSelector("#ecran-accueil:not([hidden]) .module-carte", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector("#modules")?.textContent.includes("%"), null, { timeout: 20000 });
}
/** La feuille glisse en 200 ms : on attend la fin de la transition avant de la photographier. */
const feuilleStable = (page) => page.waitForFunction(() => {
  const f = document.querySelector("#feuille");
  const t = f && getComputedStyle(f).transform;
  return f && !f.hidden && !f.classList.contains("entrante") && (t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)");
}, null, { timeout: 5000 }).then(() => page.waitForTimeout(150));

/** Navigue vers un écran : onglet direct s'il est visible, sinon par le menu « Plus ». */
async function aller(page, ecran, attendu) {
  const nav = await page.isVisible("#barre-pc") ? "#barre-pc" : "#onglets";
  if (await page.isVisible(`${nav} button[data-ecran=${ecran}]`)) {
    await page.click(`${nav} button[data-ecran=${ecran}]`);
  } else {
    await page.click("#onglets button[data-ecran=plus]");
    await page.waitForSelector(`#feuille-corps [data-aller=${ecran}]`);
    await page.click(`#feuille-corps [data-aller=${ecran}]`);
  }
  await page.waitForSelector(attendu, { timeout: 15000 });
}

try {
  // ---------- mobile ----------
  const page = await navigateur.newPage({ viewport: { width: 390, height: 844 } });
  page.on("console", (m) => m.type() === "error" && erreurs.push(`mobile: ${m.text()}`));
  page.on("pageerror", (e) => erreurs.push(`mobile: ${e.message}`));
  await connecter(page);
  console.log("Accueil :", (await page.textContent("#modules")).replace(/\s+/g, " ").trim());
  await page.screenshot({ path: path.join(SORTIE, "accueil-mobile.png"), fullPage: true });

  await page.click("#modules [data-ecran=mois]");
  await page.waitForSelector("#ecran-mois:not([hidden])");
  await page.waitForFunction(() => document.querySelector("#titre-mois")?.textContent.includes("2026"));
  if ((await page.textContent("#titre-mois")).trim() !== "Février 2026") throw new Error("titre du mois inattendu");
  console.log("Ce mois :", (await page.textContent("#sous-mois")).trim());
  await page.screenshot({ path: path.join(SORTIE, "mois-mobile.png"), fullPage: true });

  // Détail d'un mouvement + coche, si au moins un mouvement existe.
  const mouvements = await page.$$("#mvts-a-faire .mvt");
  if (mouvements.length) {
    await mouvements[0].click();
    await page.waitForSelector("#feuille:not([hidden]) .detail");
    await feuilleStable(page);
    console.log("Détail mouvement :", (await page.textContent("#feuille .detail-montant .grand")).trim());
    await page.screenshot({ path: path.join(SORTIE, "detail-mobile.png"), fullPage: true });
    await page.click("#feuille [data-basculer]");
    await page.waitForFunction(() => document.querySelectorAll("#mvts-faits .mvt").length > 0, null, { timeout: 10000 });
    console.log("Mouvement coché OK");
    await page.waitForSelector("#mvts-faits .mvt .case.cochee");
    await page.locator("#mvts-faits .mvt .case.cochee").first().click();
    await page.waitForFunction(() => document.querySelectorAll("#mvts-faits .mvt").length === 0, null, { timeout: 10000 });
    console.log("Coche annulée OK");
  } else {
    console.log("Aucun mouvement à faire ce mois — coche non testée");
  }

  // ---------- charges ----------
  await aller(page, "charges", "#ecran-charges:not([hidden]) .groupe");
  const sections = await page.$$eval("#categories .groupe-tete span:first-child", (e) => e.map((x) => x.textContent.trim()));
  console.log("Catégories :", sections.join(" | "));
  if (!sections.includes("Logement")) throw new Error("catégorie Logement absente");
  await page.screenshot({ path: path.join(SORTIE, "charges-mobile.png"), fullPage: true });

  const seg = page.locator("#categories .segment").first();
  const avant = await seg.locator("button.actif").getAttribute("data-regle");
  const autre = avant === "egales" ? "proport" : "egales";
  await seg.locator(`button[data-regle=${autre}]`).click();
  await page.waitForFunction((a) => document.querySelector("#categories .segment button.actif")?.dataset.regle === a, autre, { timeout: 10000 });
  await page.locator("#categories .segment").first().locator(`button[data-regle=${avant}]`).click();
  await page.waitForFunction((a) => document.querySelector("#categories .segment button.actif")?.dataset.regle === a, avant, { timeout: 10000 });
  console.log(`Règle du mois : ${avant} → ${autre} → ${avant} OK`);

  await aller(page, "stats", "#stats-corps .carte");
  await page.waitForFunction(() => document.querySelectorAll("#stats-corps .colonne").length >= 6);
  await page.screenshot({ path: path.join(SORTIE, "stats-mobile.png"), fullPage: true });

  // ---------- tâches (mobile) : via Plus > Module Tâches ----------
  // L'écran Jour a trois cadences (Aujourd'hui / Semaine / Mois) : on vise la carte
  // Aujourd'hui, seule garantie non vide tant qu'il reste des tâches quotidiennes actives.
  await aller(page, "jour", "#ecran-jour:not([hidden]) #cartes-moment .ligne-tache");
  console.log("Aujourd’hui :", (await page.textContent("#sous-jour")).trim());
  await page.screenshot({ path: path.join(SORTIE, "jour-mobile.png"), fullPage: true });

  // Coche une tâche depuis son détail, vérifie les points, puis annule LA MÊME.
  // Le cycle de coche est tri-état (Claudia → Yann → les deux → rien, D-024 / ui-taches.js) :
  // on ne tape jamais la case cycle directement (nombre de taps variable selon le cran de
  // départ). On passe par le détail, où [data-qui] pose TOUJOURS le premier cran (fait par
  // moi) et où [data-basculer] — visible seulement une fois fait_le posé — ANNULE en un seul
  // geste quel que soit le cran atteint (ui-taches.js: `cible = t.fait_le ? null : etat.prenom`).
  // Les compteurs sont relatifs : une tâche cochée par ailleurs ne doit ni faire
  // passer ce test à tort, ni le faire échouer.
  const idsFaitsAvant = await page.$$eval("#cartes-moment .ligne-tache.ligne-faite", (e) => e.map((x) => x.dataset.id));
  await page.locator("#cartes-moment .ligne-tache:not(.ligne-faite)").first().click();
  await page.waitForSelector("#feuille:not([hidden]) .detail [data-qui]");
  const idTache = await page.getAttribute("#feuille .detail", "data-id");
  await feuilleStable(page);
  await page.screenshot({ path: path.join(SORTIE, "detail-tache-mobile.png"), fullPage: true });
  await page.locator("#feuille [data-qui]").first().click();
  await page.waitForSelector(`#cartes-moment .ligne-tache.ligne-faite[data-id="${idTache}"]`, { timeout: 10000 });
  const faite = (await page.textContent(`#cartes-moment .ligne-tache.ligne-faite[data-id="${idTache}"]`)).replace(/\s+/g, " ").trim();
  if (!/[\d,]/.test(faite)) throw new Error(`tâche faite sans parts affichées : ${faite}`);
  console.log("Tâche cochée :", faite);
  // On attend la RÉPONSE du PATCH de décoche, pas seulement le DOM (optimiste) : recharger
  // avant qu'elle arrive annulerait la requête, et ce serait la recette qui casse, pas l'app.
  const reponseDecoche = page.waitForResponse((r) => r.request().method() === "PATCH"
    && r.url().includes("/rest/v1/taches") && (r.request().postData() ?? "").includes('"fait_le":null'), { timeout: 15000 });
  await page.locator(`#cartes-moment .ligne-tache.ligne-faite[data-id="${idTache}"]`).click();
  await page.waitForSelector("#feuille:not([hidden]) .detail [data-basculer]");
  await feuilleStable(page);
  await page.click("#feuille [data-basculer]");
  await page.waitForSelector(`#cartes-moment .ligne-tache.ligne-faite[data-id="${idTache}"]`, { state: "detached", timeout: 10000 });
  if ((await reponseDecoche).status() >= 300) throw new Error("la décoche a été refusée par la base");
  const idsFaitsApres = await page.$$eval("#cartes-moment .ligne-tache.ligne-faite", (e) => e.map((x) => x.dataset.id));
  if (JSON.stringify(idsFaitsApres) !== JSON.stringify(idsFaitsAvant)) {
    throw new Error(`la liste des tâches faites a changé : ${idsFaitsAvant} → ${idsFaitsApres}`);
  }
  console.log("Coche tâche annulée OK — liste des faites inchangée");
  // Coche puis décoche sont partis à la suite sans attendre le réseau : la base doit refléter
  // le DERNIER geste. On recharge la page (session conservée) et on relit l'écran.
  await page.reload();
  await page.waitForSelector("#ecran-jour:not([hidden]) #cartes-moment .ligne-tache", { timeout: 20000 });
  if (await page.$(`#cartes-moment .ligne-tache.ligne-faite[data-id="${idTache}"]`)) {
    throw new Error(`course d'écritures : la tâche ${idTache} est restée cochée en base après la décoche`);
  }
  console.log("Persistance vérifiée après rechargement : la décoche a gagné");

  // ---------- courses (mobile) : ajout, coche, vidage — la liste revient à son état d'origine ----------
  // On attend la LISTE rendue, pas le formulaire (statique) : sinon on compte avant les données.
  await aller(page, "courses", "#ecran-courses:not([hidden]) #groupes-courses .mvt, #ecran-courses:not([hidden]) #groupes-courses .vide");
  const avantCourses = await page.$$eval("#groupes-courses .mvt", (e) => e.length);
  await page.fill("#course-libelle", "Article de recette");
  await page.fill("#course-quantite", "2");
  // Les rayons du magasin ont été réorganisés (nouvel écran Réglages · Magasin) : le rayon
  // « Épicerie » seul n'existe plus, regroupé en « Épicerie, alcool, lait ». Nom lu depuis la
  // vraie base plutôt que deviné (l'accent y est, un sélecteur figé sur l'ancien nom se périme).
  const RAYON_TEST = "Épicerie, alcool, lait";
  await page.selectOption("#course-rayon", RAYON_TEST);
  await page.click("#form-course button[type=submit]");
  await page.waitForFunction((n) => document.querySelectorAll("#groupes-courses .mvt").length === n + 1,
    avantCourses, { timeout: 10000 });
  const rayons = await page.$$eval("#groupes-courses .titre-section", (e) => e.map((x) => x.textContent.trim()));
  if (!rayons.includes(RAYON_TEST)) throw new Error(`article rangé hors de son rayon : ${rayons.join(", ")}`);
  console.log(`Courses : article ajouté dans le rayon ${RAYON_TEST}`);
  await page.screenshot({ path: path.join(SORTIE, "courses-mobile.png"), fullPage: true });
  await page.locator("#groupes-courses .mvt .case").last().click();
  await page.waitForFunction(() => document.querySelectorAll("#courses-panier .mvt").length > 0, null, { timeout: 10000 });
  await page.click("#btn-vider-panier");
  await page.waitForSelector("#feuille:not([hidden]) [data-ok]");
  await page.click("#feuille [data-ok]");
  await page.waitForFunction((n) => document.querySelectorAll("#groupes-courses .mvt").length === n,
    avantCourses, { timeout: 10000 });
  console.log("Courses : coché puis panier vidé, liste revenue à son état d'origine");

  // L'écran Balance a disparu (refonte du jour même) : son détail par catégorie vit
  // maintenant au bas de l'écran Semaine, à côté de la grille et du KPI Obligatoire.
  await aller(page, "semaine", "#ecran-semaine:not([hidden]) #grille-semaine .ligne-grille-semaine");
  await page.waitForSelector("#kpi-obligatoire .kpi-oblig-phrase:not(:empty)");
  console.log("Semaine :", (await page.textContent("#kpi-obligatoire .kpi-oblig-ligne1")).replace(/\s+/g, " ").trim());
  await page.screenshot({ path: path.join(SORTIE, "semaine-mobile.png"), fullPage: true });
  await aller(page, "taches-rec", "#liste-taches-rec .groupe");
  await page.screenshot({ path: path.join(SORTIE, "taches-rec-mobile.png"), fullPage: true });

  // ---------- courses · réglages magasin (mobile) : nouvel écran, la liste de groupes ----------
  await aller(page, "magasin", "#ecran-magasin:not([hidden]) #liste-magasin .mag-ligne");
  await page.screenshot({ path: path.join(SORTIE, "magasin-mobile.png"), fullPage: true });
  console.log("Magasin : liste des groupes affichée");
  await page.close();

  // ---------- PC ----------
  const pc = await navigateur.newPage({ viewport: { width: 1280, height: 900 } });
  pc.on("console", (m) => m.type() === "error" && erreurs.push(`pc: ${m.text()}`));
  pc.on("pageerror", (e) => erreurs.push(`pc: ${e.message}`));
  await connecter(pc);
  await pc.screenshot({ path: path.join(SORTIE, "accueil-pc.png"), fullPage: true });
  await pc.click("#modules [data-ecran=mois]");
  await pc.waitForSelector("#ecran-mois:not([hidden]) #chiffres-mois .chiffre");
  await pc.screenshot({ path: path.join(SORTIE, "mois-pc.png"), fullPage: true });

  const tc = await pc.evaluate(() => [...document.querySelectorAll("#chiffres-mois .chiffre")]
    .find((c) => c.textContent.includes("Total commun"))?.querySelector(".valeur")?.textContent ?? "");
  if (Math.abs(nombre(tc) - -5844.78) > 0.01) throw new Error(`total commun février 2026 inattendu : ${tc}`);
  console.log("Total commun février 2026 :", tc.trim(), "— conforme à l'Excel");

  for (const [ecran, selecteur] of [["charges", "#ecran-charges:not([hidden]) .groupe"], ["stats", "#stats-corps .carte"],
    ["recurrents", "#liste-recurrents"], ["comptes", "#liste-comptes"], ["annuel", "#tableau-annuel table"]]) {
    await aller(pc, ecran, selecteur);
    await pc.screenshot({ path: path.join(SORTIE, `${ecran}-pc.png`), fullPage: true });
  }
  console.log("Six écrans Budget rendus (PC)");

  await pc.click("#logo");
  await pc.waitForSelector("#ecran-accueil:not([hidden])");
  await pc.click("#modules [data-ecran=jour]");
  await pc.waitForSelector("#ecran-jour:not([hidden]) #detail-tache-pc:not([hidden]) .detail", { timeout: 15000 });
  await pc.screenshot({ path: path.join(SORTIE, "jour-pc.png"), fullPage: true });
  for (const [ecran, selecteur] of [["semaine", "#ecran-semaine:not([hidden]) #grille-semaine .ligne-grille-semaine"],
    ["taches-rec", "#liste-taches-rec .groupe"]]) {
    await aller(pc, ecran, selecteur);
    await pc.screenshot({ path: path.join(SORTIE, `${ecran}-pc.png`), fullPage: true });
  }
  console.log("Trois écrans Tâches rendus (PC)");
  await pc.click("#logo");
  await pc.waitForSelector("#ecran-accueil:not([hidden])");
  await pc.click("#modules [data-ecran=courses]");
  await pc.waitForSelector("#ecran-courses:not([hidden]) #groupes-courses .mvt, #ecran-courses:not([hidden]) #groupes-courses .vide");
  await pc.screenshot({ path: path.join(SORTIE, "courses-pc.png"), fullPage: true });
  console.log("Écran Courses rendu (PC)");
  await aller(pc, "magasin", "#ecran-magasin:not([hidden]) #liste-magasin .mag-ligne");
  await pc.screenshot({ path: path.join(SORTIE, "magasin-pc.png"), fullPage: true });
  console.log("Écran Magasin rendu (PC)");
  await pc.close();
} finally {
  await navigateur.close();
  serveur.close();
}
if (erreurs.length) { console.error("Erreurs console :\n" + erreurs.join("\n")); process.exit(1); }
console.log(`recette connectée OK — captures dans ${SORTIE}`);
