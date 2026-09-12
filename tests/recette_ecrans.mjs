// Recette hors ligne : sert frontend/ (même petit serveur que recette_visuelle.mjs), bouchonne
// Supabase via addInitScript (aucun réseau réel, aucune écriture en base), visite CHAQUE écran
// de CHAQUE module et capture à 320/360/1200 px. Détecte les débordements horizontaux par
// mesure de géométrie (L-016), échoue sur toute erreur console/pageerror.
// Usage : node tests/recette_ecrans.mjs
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import * as DONNEES from "./donnees_factices.mjs";

const RACINE = path.resolve("frontend");
const SORTIE = path.resolve("data/captures/ecrans");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const LARGEURS = [320, 360, 1200]; // non-régression, conception, desktop (règle mobile-parents.md)

// ---------- 1. écrans à visiter, lus depuis les descripteurs (pas de liste en dur) ----------
/** Extrait cle/onglets/plus d'un descripteur mod-*.js sans l'exécuter (il touche le DOM au
 *  chargement dans certains fichiers UI qu'il importe) : lecture texte + JSON.parse ciblé. */
function lireDescripteur(fichier) {
  const src = fs.readFileSync(fichier, "utf8");
  const cle = src.match(/cle:\s*"([^"]+)"/)?.[1];
  const nom = src.match(/nom:\s*"([^"]+)"/)?.[1];
  const defaut = src.match(/defaut:\s*"([^"]+)"/)?.[1];
  const tableau = (motCle) => {
    // Cible "onglets: [ ... ]," ou "plus: [ ... ]," — un tableau de paires ["cle","libellé"],
    // toujours écrit sur une seule ligne dans les mod-*.js actuels. On repère juste le début
    // ("motCle: [") puis on compte les crochets pour trouver la fermeture correspondante :
    // plus robuste qu'une regex gourmande/non gourmande sur du JSON imbriqué.
    const debut = src.indexOf(`${motCle}: [`);
    if (debut === -1) throw new Error(`${fichier} : champ "${motCle}" introuvable`);
    const ouverture = src.indexOf("[", debut);
    let profondeur = 0, fin = -1;
    for (let i = ouverture; i < src.length; i++) {
      if (src[i] === "[") profondeur++;
      else if (src[i] === "]") { profondeur--; if (profondeur === 0) { fin = i; break; } }
    }
    if (fin === -1) throw new Error(`${fichier} : champ "${motCle}" — crochet fermant introuvable`);
    // Les entrées utilisent déjà des guillemets doubles : c'est du JSON valide tel quel.
    return JSON.parse(src.slice(ouverture, fin + 1));
  };
  return { cle, nom, defaut, onglets: tableau("onglets"), plus: tableau("plus") };
}

function listerEcrans() {
  const registre = fs.readFileSync(path.join(RACINE, "modules.js"), "utf8");
  const chemins = [...registre.matchAll(/import\s+\w+\s+from\s+"(\.\/[^"]+)"/g)].map((m) => m[1]);
  const ecrans = [];
  for (const rel of chemins) {
    const fichier = path.join(RACINE, rel.replace(/^\.\//, ""));
    const d = lireDescripteur(fichier);
    for (const [e] of [...d.onglets, ...d.plus]) ecrans.push({ module: d.cle, ecran: e, moduleDefaut: d.defaut });
  }
  return ecrans;
}

// ---------- 2. doublure Supabase, injectée AVANT tout script de la page ----------
// Correspondance export du fichier de données -> nom réel de table Supabase (celui que
// frontend/socle/api.js passe à sb.from(...)) : les deux vocabulaires diffèrent en casse ici,
// mais suivent le schéma des migrations pour le nom.
const TABLES = {
  membres: "MEMBRES", charges: "CHARGES", comptes: "COMPTES", mouvements_recurrents: "MOUVEMENTS_RECURRENTS",
  lignes: "LIGNES", revenus: "REVENUS", ajustements: "AJUSTEMENTS", mouvements: "MOUVEMENTS",
  taches_recurrentes: "TACHES_RECURRENTES", taches: "TACHES",
  courses_rayons: "RAYONS", courses: "COURSES", repas: "REPAS", repas_ingredients: "REPAS_INGREDIENTS",
  courses_classiques: "COURSES_CLASSIQUES",
};

/** Construit le script de bouchon : un thenable qui imite from().select().eq()... et
 *  auth.*, avec des données factices cohérentes. Sérialisé en JSON pour passer dans la page. */
function scriptBouchon(donnees) {
  const parTable = Object.fromEntries(Object.entries(TABLES).map(([table, cle]) => [table, donnees[cle] ?? []]));
  return `(() => {
    const DONNEES = ${JSON.stringify(parTable)};
    const table = (nom) => JSON.parse(JSON.stringify(DONNEES[nom] ?? []));

    // Requête chaînable et thenable : chaque méthode renvoie l'objet lui-même, la résolution
    // n'a lieu qu'à la lecture (then/await), comme le vrai client Supabase. Les filtres
    // s'appliquent sur l'état COURANT de la table (via window.__bouchonTables), jamais sur une
    // copie figée à la construction : sinon une écriture faite par une requête précédente
    // resterait invisible à la suivante dans le même chargement d'écran.
    function requete(nomTable) {
      window.__bouchonTables[nomTable] ??= table(nomTable);
      let lignes = window.__bouchonTables[nomTable];
      let operation = "select";
      let unique = false;
      let payload = null;

      const q = {
        select: () => q,
        order: () => q,
        eq(champ, val) { lignes = lignes.filter((l) => l[champ] === val); return q; },
        neq(champ, val) { lignes = lignes.filter((l) => l[champ] !== val); return q; },
        gte(champ, val) { lignes = lignes.filter((l) => l[champ] >= val); return q; },
        lte(champ, val) { lignes = lignes.filter((l) => l[champ] <= val); return q; },
        in(champ, vals) { lignes = lignes.filter((l) => vals.includes(l[champ])); return q; },
        or(expr) {
          // Bouchon minimal : « fait_le.is.null,echeance.gte.X » (seul usage réel, api.js taches()).
          const clauses = expr.split(",");
          lignes = lignes.filter((l) => clauses.some((c) => {
            const [champ, op, val] = c.split(".");
            if (op === "is" && val === "null") return l[champ] == null;
            if (op === "gte") return l[champ] >= val;
            return false;
          }));
          return q;
        },
        insert(v) { operation = "insert"; payload = Array.isArray(v) ? v : [v]; return q; },
        update(v) { operation = "update"; payload = v; return q; },
        upsert(v) { operation = "upsert"; payload = v; return q; },
        delete() { operation = "delete"; return q; },
        single() { unique = true; return q; },
        maybeSingle() { unique = true; return q; },
        then(resolve, reject) {
          // then() DOIT renvoyer un vrai Promise : api.js fait sb.from(...).then(rendre) sans
          // l'awaiter lui-même (l'await arrive plus haut, sur le résultat de .then()) — un
          // objet thenable qui ne fait qu'appeler resolve() sans rien renvoyer casse toute la
          // chaîne (Promise.all reçoit undefined à la place du tableau attendu).
          let resultat;
          try { resultat = { data: executer(), error: null }; }
          catch (e) { resultat = { data: null, error: e }; }
          return Promise.resolve(resultat).then(resolve, reject);
        },
      };

      function prochainId() {
        return 1 + window.__bouchonTables[nomTable].reduce((max, l) => Math.max(max, l.id ?? 0), 0);
      }

      function executer() {
        const base = window.__bouchonTables[nomTable];
        if (operation === "select") {
          const filtrees = lignes;
          return unique ? (filtrees[0] ?? null) : filtrees;
        }
        if (operation === "insert") {
          const crees = payload.map((champs) => ({ id: prochainId() + payload.indexOf(champs), ...champs }));
          window.__bouchonTables[nomTable] = [...base, ...crees];
          return unique ? crees[0] : crees;
        }
        if (operation === "update") {
          const idsAMaj = new Set(lignes.map((l) => l.id));
          window.__bouchonTables[nomTable] = base.map((l) => idsAMaj.has(l.id) ? { ...l, ...payload } : l);
          const maj = window.__bouchonTables[nomTable].filter((l) => idsAMaj.has(l.id));
          return unique ? (maj[0] ?? null) : maj;
        }
        if (operation === "upsert") {
          // Bouchon minimal : une seule ligne à la fois, clé = colonnes non-montant présentes.
          const cles = Object.keys(payload).filter((k) => !k.includes("montant") && k !== "fait_le");
          const i = base.findIndex((l) => cles.every((k) => l[k] === payload[k]));
          if (i === -1) { const cree = { id: prochainId(), ...payload }; window.__bouchonTables[nomTable] = [...base, cree]; return cree; }
          window.__bouchonTables[nomTable] = base.map((l, k) => k === i ? { ...l, ...payload } : l);
          return window.__bouchonTables[nomTable][i];
        }
        if (operation === "delete") {
          const idsASupprimer = new Set(lignes.map((l) => l.id));
          window.__bouchonTables[nomTable] = base.filter((l) => !idsASupprimer.has(l.id));
          return null;
        }
        return null;
      }
      return q;
    }

    window.__bouchonTables = {};
    window.supabase = {
      createClient: () => ({
        auth: {
          signInWithPassword: async () => ({ error: null }),
          signOut: async () => ({ error: null }),
          getUser: async () => ({ data: { user: { email: DONNEES.membres[1].email } } }),
          onAuthStateChange(cb) {
            // Session déjà active : le bouchon simule un utilisateur déjà connecté (Yann),
            // comme recette_connectee.mjs le fait avec un vrai login.
            setTimeout(() => cb("INITIAL_SESSION", { user: { email: DONNEES.membres[1].email } }), 0);
            return { data: { subscription: { unsubscribe() {} } } };
          },
        },
        from: (nom) => requete(nom),
      }),
    };
  })();`;
}

// ---------- 3. mesure de géométrie : débordement horizontal réel, pas d'œil sur une capture ----------
async function chercherDebordement(page, largeur) {
  return page.evaluate((largeurAttendue) => {
    const fautifs = [];
    if (document.documentElement.scrollWidth > window.innerWidth) {
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.right > largeurAttendue + 1 && r.width > 0) {
          fautifs.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.split(" ").filter(Boolean).join(".") : ""} (right=${Math.round(r.right)}px)`);
        }
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, fautifs: fautifs.slice(0, 8) };
  }, largeur);
}

// ---------- 4. lancement ----------
const serveur = http.createServer((req, res) => {
  const p = path.join(RACINE, req.url === "/" ? "index.html" : req.url.split("?")[0]);
  if (!p.startsWith(RACINE) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[path.extname(p)] ?? "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
// Port éphémère (0 = l'OS en choisit un libre) plutôt qu'un numéro en dur : une recette
// interrompue laisse son serveur en vie quelques secondes, et un port fixe fait alors échouer
// la relance sur EADDRINUSE — un échec qui n'a rien à voir avec ce qu'on teste.
await new Promise((resolve, reject) => {
  serveur.once("error", reject);
  serveur.listen(0, "127.0.0.1", resolve);
});
const PORT = serveur.address().port;
fs.mkdirSync(SORTIE, { recursive: true });

const ecrans = listerEcrans();
const navigateur = await chromium.launch();
const erreurs = [];
const debordements = [];
const ecransCasses = [];
let nbCaptures = 0;

/** Navigue vers un écran : onglet direct s'il est visible, sinon par le menu « Plus » (mobile)
 *  ou par la carte du module puis son onglet (PC, où « Plus » — #onglets — n'existe pas :
 *  #onglets {display:none} au-dessus de 1024 px, cf. style.css). Repris de recette_connectee.mjs
 *  pour le patron général, adapté ici pour rester générique sur N'IMPORTE quel écran plutôt que
 *  sur une liste écrite à la main, et pour échouer proprement plutôt que planter. */
async function aller(page, ecran, moduleDefaut) {
  const surPC = await page.isVisible("#barre-pc");
  const nav = surPC ? "#barre-pc" : "#onglets";
  if (await page.isVisible(`${nav} button[data-ecran=${ecran}]`)) {
    await page.click(`${nav} button[data-ecran=${ecran}]`, { timeout: 5000 });
  } else if (surPC) {
    // Sur PC, la barre de module est vide tant qu'aucun module n'est actif (rendreOnglets,
    // ui-base.js), et la carte du module (#modules) n'existe que sur l'écran d'accueil : on y
    // repasse par #logo avant d'entrer par la carte (son écran par défaut), puis — si la cible
    // n'est pas cet écran par défaut — par l'onglet, maintenant visible.
    if (!(await page.isVisible("#ecran-accueil:not([hidden])"))) {
      await page.click("#logo", { timeout: 5000 });
      await page.waitForSelector("#ecran-accueil:not([hidden]) .module-carte", { timeout: 5000 });
    }
    await page.click(`#modules [data-ecran=${moduleDefaut}]`, { timeout: 5000 });
    if (ecran !== moduleDefaut) {
      await page.waitForSelector(`#barre-pc button[data-ecran=${ecran}]`, { timeout: 5000 });
      await page.click(`#barre-pc button[data-ecran=${ecran}]`, { timeout: 5000 });
    }
  } else {
    await page.click("#onglets button[data-ecran=plus]", { timeout: 5000 });
    await page.waitForSelector(`#feuille-corps [data-aller=${ecran}]`, { timeout: 5000 });
    await page.click(`#feuille-corps [data-aller=${ecran}]`, { timeout: 5000 });
  }
  await page.waitForSelector(`#ecran-${ecran}:not([hidden])`, { timeout: 8000 });
  await page.waitForTimeout(200); // laisse le rendu (fetch factice résolu en microtâche) se poser
}

try {
  for (const largeur of LARGEURS) {
    const page = await navigateur.newPage({ viewport: { width: largeur, height: 900 } });
    const erreursPage = [];
    // "Failed to load resource: net::ERR_FAILED" est le bruit ATTENDU du blocage volontaire
    // du CDN Supabase et de Google Fonts ci-dessous (route.abort) : ce n'est pas une vraie
    // erreur de page, on ne la compte pas comme un échec de la recette.
    const attendue = (texte) => texte.includes("net::ERR_FAILED");
    page.on("console", (m) => { if (m.type() === "error" && !attendue(m.text())) erreursPage.push(m.text()); });
    page.on("pageerror", (e) => erreursPage.push(e.message));
    // Aucun accès réseau réel : le SDK Supabase (CDN) et toute requête vers *.supabase.co
    // sont coupés — sinon le vrai script chargé après notre bouchon écraserait window.supabase
    // (c'est un script classique, pas un module : il s'exécute dans l'ordre du document,
    // après notre addInitScript). Google Fonts est coupé aussi : la police n'a rien à faire
    // dans une recette hors ligne et reste sans effet sur la géométrie mesurée.
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.includes("supabase") || url.includes("fonts.g")) return route.abort();
      return route.continue();
    });
    await page.addInitScript(scriptBouchon(DONNEES));

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
    await page.waitForSelector("#app:not([hidden])", { timeout: 10000 });
    await page.waitForSelector("#ecran-accueil:not([hidden]) .module-carte", { timeout: 10000 });

    // ---------- accueil ----------
    await capturer(page, "accueil", largeur, erreursPage);

    // ---------- chaque écran de chaque module ----------
    for (const { ecran, moduleDefaut } of ecrans) {
      try {
        await aller(page, ecran, moduleDefaut);
        await capturer(page, ecran, largeur, erreursPage);
      } catch (e) {
        ecransCasses.push(`${ecran} @ ${largeur}px : ${e.message.split("\n")[0]}`);
        // On revient à l'accueil pour ne pas propager la casse d'un écran aux suivants.
        try { await page.click("#logo"); await page.waitForSelector("#ecran-accueil:not([hidden])", { timeout: 3000 }); }
        catch { /* si même l'accueil ne répond plus, la page suivante repartira de zéro */ }
      }
    }
    erreurs.push(...erreursPage.map((m) => `${largeur}px: ${m}`));
    await page.close();
  }
} finally {
  await navigateur.close();
  serveur.close();
}

async function capturer(page, ecran, largeur, erreursPage) {
  const { scrollWidth, innerWidth, fautifs } = await chercherDebordement(page, largeur);
  if (scrollWidth > innerWidth) {
    debordements.push(`${ecran} @ ${largeur}px : scrollWidth=${scrollWidth} > innerWidth=${innerWidth} — `
      + `éléments fautifs : ${fautifs.join(", ") || "non identifiés"}`);
  }
  await page.screenshot({ path: path.join(SORTIE, `${ecran}-${largeur}.png`), fullPage: true });
  nbCaptures++;
}

// ---------- résumé ----------
console.log(`Écrans énumérés : ${ecrans.length + 1} (dont accueil)`);
console.log(`Largeurs : ${LARGEURS.join(", ")} px`);
console.log(`Captures produites : ${nbCaptures} → ${SORTIE}`);

if (ecransCasses.length) {
  console.error(`\nÉcrans cassés (${ecransCasses.length}) :\n` + ecransCasses.join("\n"));
}
if (debordements.length) {
  console.error(`\nDébordements horizontaux (${debordements.length}) :\n` + debordements.join("\n"));
}
if (erreurs.length) {
  console.error(`\nErreurs console/page (${erreurs.length}) :\n` + erreurs.join("\n"));
}
if (ecransCasses.length || debordements.length || erreurs.length) process.exit(1);
console.log("recette écrans OK");
