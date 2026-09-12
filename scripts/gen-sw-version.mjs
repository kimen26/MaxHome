// gen-sw-version.mjs — calcule un hash de contenu de toute la coquille MaxHome
// et l'écrit dans frontend/sw-version.js. Le hash change dès qu'un octet d'un
// fichier de `frontend/` change : c'est ce qui force le service worker à
// reconstruire son precache au déploiement suivant, sans geste utilisateur.
//
// Différence avec MaxHome/MaxPlay : MaxHome n'a AUCUNE étape de build (voir
// .github/workflows/pages.yml, qui publie frontend/ tel quel). Ce script tourne
// donc DANS le workflow GitHub Actions, juste avant `upload-pages-artifact`,
// et pas via un `npm run build` local (voir memory/DECISIONS.md, D-033 révisée).
//
// Contrairement à MaxPlay (PRECACHE_LIST maintenue à la main dans sw.js), ce
// script PARCOURT LE DISQUE : frontend/ a des sous-dossiers (socle/, budget/,
// taches/, courses/) qui gagnent des fichiers au fil des chantiers, et une
// liste à la main serait tôt ou tard désynchronisée (un fichier neuf oublié =
// jamais precaché = jamais utilisable hors ligne). La liste précachée par
// sw.js est donc *aussi* générée ici, dans frontend/sw-precache.js.
//
// Lancer depuis la racine du repo : node scripts/gen-sw-version.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FRONTEND = path.join(ROOT, "frontend");
const OUT_VERSION = path.join(FRONTEND, "sw-version.js");
const OUT_PRECACHE = path.join(FRONTEND, "sw-precache.js");

// Extensions qui constituent la coquille applicative. Les icônes (png/svg) en
// font partie : elles sont nécessaires hors ligne (barre de nav, manifeste).
const EXTENSIONS_COQUILLE = new Set([".html", ".css", ".js", ".webmanifest", ".png", ".svg"]);

// Fichiers exclus du parcours : ceux que ce script lui-même génère (sinon le
// hash s'auto-référence et ne converge jamais) et le service worker, qui n'a
// pas besoin de se precacher lui-même (le navigateur le récupère à part).
const EXCLUS = new Set(["sw.js", "sw-version.js", "sw-precache.js"]);

/** Parcourt frontend/ récursivement et renvoie les chemins relatifs (POSIX, ./ en tête)
 *  des fichiers de la coquille, triés pour un hash reproductible. */
function listerCoquille(dir, base = FRONTEND) {
  const fichiers = [];
  for (const entree of readdirSync(dir)) {
    const abs = path.join(dir, entree);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      fichiers.push(...listerCoquille(abs, base));
      continue;
    }
    const ext = path.extname(entree);
    if (!EXTENSIONS_COQUILLE.has(ext)) continue;
    if (EXCLUS.has(entree)) continue;
    const rel = path.relative(base, abs).split(path.sep).join("/");
    fichiers.push(rel);
  }
  return fichiers.sort();
}

const fichiers = listerCoquille(FRONTEND);
if (fichiers.length === 0) {
  console.error("gen-sw-version : aucun fichier de coquille trouvé sous frontend/ — abandon.");
  process.exit(1);
}

const hash = createHash("sha256");
for (const rel of fichiers) {
  hash.update(rel);
  hash.update(readFileSync(path.join(FRONTEND, rel)));
}
const version = hash.digest("hex").slice(0, 12);

writeFileSync(
  OUT_VERSION,
  `// GÉNÉRÉ par scripts/gen-sw-version.mjs — ne pas éditer à la main.
// Recalculé à chaque déploiement (voir .github/workflows/pages.yml) à partir du
// contenu de tous les fichiers de frontend/sw-precache.js : change dès qu'un
// seul octet de la coquille change, ce qui force le service worker à recréer
// son cache. Chargé par sw.js via importScripts (pas de module ESM).
self.SW_VERSION = "${version}";
`
);

// Liste précachée générée à part : sw.js l'importe et s'en sert telle quelle
// dans son addEventListener("install"), sans la maintenir à la main.
writeFileSync(
  OUT_PRECACHE,
  `// GÉNÉRÉ par scripts/gen-sw-version.mjs — ne pas éditer à la main.
// Liste de tous les fichiers de la coquille MaxHome (frontend/, hors sw.js et
// les fichiers générés eux-mêmes), obtenue par parcours du disque : un fichier
// neuf dans un sous-dossier existant (socle/, budget/, taches/, courses/) est
// automatiquement inclus au prochain déploiement, sans y penser.
self.SW_PRECACHE = ${JSON.stringify(["./", ...fichiers], null, 2)};
`
);

console.log(
  `gen-sw-version : SW_VERSION = ${version} (${fichiers.length} fichiers précachés) → frontend/sw-version.js, frontend/sw-precache.js`
);
