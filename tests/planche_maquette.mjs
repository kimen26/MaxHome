// Planche côte à côte : capture de l'app (data/captures/ecrans/<ecran>-360.png) à GAUCHE,
// image de référence de la maquette (inbox/Audit Refonte/ref/maquette/<nom>.png) à DROITE,
// une planche PNG par écran dans data/captures/planche/. C'est la porte qui manquait (L-028) :
// « conforme » est un jugement porté sur une image, et il faut les deux images sous les yeux.
// Prérequis : node tests/recette_ecrans.mjs (captures) et node tests/outils/capture_maquette.mjs
// (références, une fois — la maquette vit dans inbox/, jamais commitée).
// Usage : node tests/planche_maquette.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const CAPTURES = path.resolve("data/captures/ecrans");
const REFERENCES = path.resolve("inbox/Audit Refonte/ref/maquette");
const SORTIE = path.resolve("data/captures/planche");
const LARGEUR = 360;

// écran de l'app → image de référence (les feuilles ont leur propre capture dans la recette).
const PAIRES = [
  ["jour", "jour"], ["semaine", "semaine"], ["mois", "budget"], ["courses", "courses"],
  ["taches-rec", "reglages-parts"], ["charges-ref", "reglages-charges"], ["magasin", "reglages-magasin"],
  ["feuille-ajout-tache", "feuille-ajout"], ["feuille-todo", "feuille-todo"],
  ["feuille-tour", "feuille-tour"], ["feuille-ajout-mois", "feuille-ajout-budget"],
];

const enData = (fichier) => `data:image/png;base64,${fs.readFileSync(fichier).toString("base64")}`;

fs.mkdirSync(SORTIE, { recursive: true });
const navigateur = await chromium.launch();
const page = await navigateur.newPage({ viewport: { width: LARGEUR * 2 + 60, height: 900 } });
const manquantes = [];
try {
  for (const [ecran, reference] of PAIRES) {
    const capture = path.join(CAPTURES, `${ecran}-${LARGEUR}.png`);
    const modele = path.join(REFERENCES, `${reference}.png`);
    if (!fs.existsSync(capture) || !fs.existsSync(modele)) {
      manquantes.push(`${ecran} : ${!fs.existsSync(capture) ? "capture" : "référence"} absente`);
      continue;
    }
    // La référence est capturée à 390 px × 2 (retina) : on l'affiche à 360 px de large pour
    // comparer à la même échelle que l'app ; la hauteur suit.
    await page.setContent(`<body style="margin:0;background:#dfe4ea;font:12px system-ui">
      <div style="display:flex;gap:20px;padding:20px;align-items:flex-start">
        <figure style="margin:0"><figcaption>app · ${ecran} · ${LARGEUR}px</figcaption>
          <img src="${enData(capture)}" style="width:${LARGEUR}px;display:block;border:1px solid #999"></figure>
        <figure style="margin:0"><figcaption>maquette · ${reference}</figcaption>
          <img src="${enData(modele)}" style="width:${LARGEUR}px;display:block;border:1px solid #999"></figure>
      </div></body>`);
    await page.screenshot({ path: path.join(SORTIE, `${ecran}.png`), fullPage: true });
    console.log("planche", ecran);
  }
} finally {
  await navigateur.close();
}
if (manquantes.length) {
  console.error(`\nPaires incomplètes (${manquantes.length}) :\n${manquantes.join("\n")}`);
  process.exit(1);
}
console.log(`planches OK → ${SORTIE}`);
