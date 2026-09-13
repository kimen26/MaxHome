// Recette du jeton pas encore valide : au premier chargement, la session dort dans
// localStorage avec un token qu'un serveur refuse (« JWT issued at future »). Toutes les
// requêtes du démarrage échouent. supabase-js émet ensuite TOKEN_REFRESHED avec un token
// neuf : l'app DOIT repartir seule, sans Ctrl+F5 (le contournement qu'on supprime ici).
//
// Vérifie trois choses, par mesure sur le DOM et non à l'œil :
//   1. pendant l'erreur, un seul message visible (pas bandeau + toast) ;
//   2. pendant l'erreur, pas de bouton « Réessayer » (retenter redonnerait la même erreur) ;
//   3. après TOKEN_REFRESHED, bandeau parti et contenu réellement chargé.
// Usage : node tests/recette_token.mjs
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import * as DONNEES from "./donnees_factices.mjs";

const RACINE = path.resolve("frontend");
const SORTIE = path.resolve("data/captures/token");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const LARGEUR = 360; // largeur de conception (mobile-parents.md)

const TABLES = {
  membres: "MEMBRES", charges: "CHARGES", comptes: "COMPTES", mouvements_recurrents: "MOUVEMENTS_RECURRENTS",
  lignes: "LIGNES", revenus: "REVENUS", ajustements: "AJUSTEMENTS", mouvements: "MOUVEMENTS",
  taches_recurrentes: "TACHES_RECURRENTES", taches: "TACHES",
  courses_rayons: "RAYONS", courses: "COURSES", repas: "REPAS", repas_ingredients: "REPAS_INGREDIENTS",
  courses_classiques: "COURSES_CLASSIQUES",
};

/** Bouchon Supabase qui REFUSE tout tant que le token n'est pas rafraîchi, puis sert les
 *  données normalement — exactement la séquence observée en production. */
function scriptBouchon(donnees) {
  const parTable = Object.fromEntries(Object.entries(TABLES).map(([t, c]) => [t, donnees[c] ?? []]));
  return `(() => {
    const DONNEES = ${JSON.stringify(parTable)};
    window.__jetonValide = false;      // faux au départ : c'est tout le sujet
    window.__rafraichir = null;        // rempli par onAuthStateChange, appelé par le test

    function requete(nomTable) {
      const q = {
        select: () => q, order: () => q, eq: () => q, neq: () => q, gte: () => q,
        lte: () => q, in: () => q, or: () => q, single: () => q, maybeSingle: () => q,
        then(resolve, reject) {
          if (!window.__jetonValide) {
            return Promise.resolve({ data: null, error: new Error("JWT issued at future") })
              .then(resolve, reject);
          }
          const data = JSON.parse(JSON.stringify(DONNEES[nomTable] ?? []));
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return q;
    }

    window.supabase = {
      createClient: () => ({
        auth: {
          signInWithPassword: async () => ({ error: null }),
          signOut: async () => ({ error: null }),
          getUser: async () => ({ data: { user: { email: DONNEES.membres[1].email } } }),
          onAuthStateChange(cb) {
            const session = { user: { email: DONNEES.membres[1].email } };
            // INITIAL_SESSION : la session du localStorage, avec son token périmé.
            setTimeout(() => cb("INITIAL_SESSION", session), 0);
            // Le test déclenchera le rafraîchissement quand il aura constaté l'erreur.
            window.__rafraichir = () => { window.__jetonValide = true; cb("TOKEN_REFRESHED", session); };
            return { data: { subscription: { unsubscribe() {} } } };
          },
        },
        from: (nom) => requete(nom),
      }),
    };
  })();`;
}

const serveur = http.createServer((req, res) => {
  const p = path.join(RACINE, req.url === "/" ? "index.html" : req.url.split("?")[0]);
  if (!p.startsWith(RACINE) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[path.extname(p)] ?? "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((resolve, reject) => {
  serveur.once("error", reject);
  serveur.listen(0, "127.0.0.1", resolve);
});
const PORT = serveur.address().port;
fs.mkdirSync(SORTIE, { recursive: true });

const navigateur = await chromium.launch();
const page = await navigateur.newPage({ viewport: { width: LARGEUR, height: 720 } });
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERR:", m.text().slice(0, 200)); });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 200)));
await page.addInitScript(scriptBouchon(DONNEES));
// Le SDK Supabase du CDN écraserait window.supabase (index.html le charge avant app.js) :
// on le coupe, comme recette_ecrans.mjs. Les polices aussi — hors sujet et lentes.
await page.route("**/*", (route) => {
  const url = route.request().url();
  if (url.includes("supabase") || url.includes("fonts.g")) return route.abort();
  return route.continue();
});
await page.goto(`http://127.0.0.1:${PORT}/index.html`);

const echecs = [];
const visible = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return false;
  const st = getComputedStyle(el);
  return !el.hidden && st.display !== "none" && st.visibility !== "hidden" && el.offsetHeight > 0;
}, sel);

// ---------- temps 1 : token refusé ----------
await page.waitForFunction(() => {
  const b = document.querySelector("#bandeau-erreur");
  return b && !b.hidden;
}, { timeout: 5000 });

const texteBandeau = await page.textContent("#bandeau-erreur-texte");
const toastVisible = await visible("#toast");
const boutonVisible = await visible("#btn-reessayer");
await page.screenshot({ path: path.join(SORTIE, "1-jeton-refuse.png"), fullPage: false });

if (toastVisible) echecs.push("bandeau ET toast affichés en même temps : message dupliqué");
if (boutonVisible) echecs.push("bouton « Réessayer » proposé alors que retenter redonnerait la même erreur");
if (/JWT|issued at future/i.test(texteBandeau)) {
  echecs.push(`message technique brut montré à l'utilisateur : « ${texteBandeau} »`);
}

// ---------- temps 2 : token rafraîchi, reprise attendue SANS rechargement ----------
await page.evaluate(() => window.__rafraichir());
let repartiSeule = true;
try {
  await page.waitForFunction(() => {
    const b = document.querySelector("#bandeau-erreur");
    return b && b.hidden;
  }, { timeout: 5000 });
} catch { repartiSeule = false; }

// Les cartes de résumé ne vivent que sur l'accueil : on y va explicitement, sinon on
// mesurerait l'absence de cartes sur un autre écran et le test croirait tout vérifier.
await page.evaluate(() => {
  document.querySelector('[data-ecran="accueil"], #btn-accueil')?.click();
});
await page.waitForTimeout(300);
const resumes = await page.evaluate(() =>
  [...document.querySelectorAll(".module-resume")].map((e) => e.textContent.trim()));
await page.screenshot({ path: path.join(SORTIE, "2-apres-refresh.png"), fullPage: false });

if (!repartiSeule) echecs.push("bandeau toujours là après TOKEN_REFRESHED : il faut encore un Ctrl+F5");
// Un tableau vide ferait passer le test sans rien prouver : on exige des cartes.
if (resumes.length === 0) {
  echecs.push("aucune carte module dans l'accueil : la reprise n'a rien rendu");
} else if (resumes.some((r) => r === "Chargement…")) {
  echecs.push(`modules non rechargés après TOKEN_REFRESHED : ${JSON.stringify(resumes)}`);
}

await navigateur.close();
serveur.close();

console.log(`Bandeau pendant l'erreur : « ${texteBandeau} »`);
console.log(`Résumés après rafraîchissement : ${JSON.stringify(resumes)}`);
console.log(`Captures : ${SORTIE}`);
if (echecs.length) {
  console.error("\nrecette token ÉCHEC :");
  for (const e of echecs) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("recette token OK");
