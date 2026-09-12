// Génère les icônes PWA de MaxHome (frontend/icones/*.png) à partir d'un unique SVG.
//
// Pourquoi ce détour SVG → PNG via Playwright plutôt qu'une lib de rendu (sharp, resvg...) :
// le projet n'a AUCUNE dépendance d'image aujourd'hui, seulement Playwright (déjà utilisé par
// les recettes visuelles). Installer une lib native supplémentaire pour un besoin ponctuel —
// quatre PNG qui ne changent qu'en cas de refonte du logo — serait de la sur-ingénierie.
// Playwright sait déjà charger une page et faire une capture aux dimensions exactes : on lui
// donne une page HTML dont le SVG remplit tout le viewport, on capture, c'est fini.
//
// Rejouable : `node scripts/generer_icones.mjs` régénère les 4 PNG à l'identique. Le SVG
// source est la seule chose à modifier pour changer le dessin.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const SORTIE = path.resolve("frontend/icones");
fs.mkdirSync(SORTIE, { recursive: true });

const BLEU = "#1f4e79";
const BLANC = "#ffffff";
const VERT = "#1b7f3b";

// Dessin : un panier de courses (silhouette trapèze + anse) surmonté d'une coche verte.
// Remplace l'ancienne maison, qui ne disait rien du contenu de l'app (budget/tâches/courses).
// Le panier dit "courses", la coche dit "fait" (tâches cochées, courses cochées dans le
// magasin) — les deux usages centraux de MaxHome tiennent dans une seule silhouette franche.
// Traits épais, zéro dégradé, zéro détail fin — jugée à l'œil pour rester lisible à 48 px
// (cf. rapport). viewBox 0-100 : le pourcentage de marge distingue les variantes "any"/"maskable".
function svgListe({ margeCote }) {
  // margeCote : zone de sécurité de chaque bord, en unités de viewBox (0-100). Android rogne
  // cette marge sur les icônes « maskable » (découpe ronde) : le dessin doit rester entier.
  const cote = 100;
  const centre = cote / 2;

  // Une CHECK-LIST plutôt qu'un objet (maison, panier) : c'est le geste de l'app — cocher ce
  // qui est fait, à la maison comme au magasin. Trois lignes, la première cochée en vert.
  // Un essai « panier » a été écarté : son anse pleine se lisait comme un sac à main, et les
  // barres internes comme des fentes. Une icône se juge à ce qu'on y reconnaît, pas à ce
  // qu'on a voulu y mettre.
  const zone = cote - margeCote * 2;
  const gauche = centre - zone / 2;
  const haut = centre - zone / 2;

  // Trois rangées régulières. La case est un carré plein, la ligne un rectangle arrondi :
  // deux formes franches, aucune ne disparaît à 48 px.
  const rangees = 3;
  const pas = zone / rangees;             // hauteur d'une rangée
  const caseCote = pas * 0.52;            // la case occupe un peu plus de la moitié
  const ligneHauteur = pas * 0.3;
  const ecart = zone * 0.09;              // entre la case et la ligne
  const ligneGauche = gauche + caseCote + ecart;
  const ligneLargeur = zone - caseCote - ecart;

  const y = (i) => haut + pas * i + (pas - caseCote) / 2;   // haut de la case de la rangée i
  const rayonCase = caseCote * 0.22;
  const rayonLigne = ligneHauteur / 2;

  // La coche tient DANS sa case : débordante, elle se lisait comme une rature par-dessus la
  // case plutôt que comme une case cochée. Contenue, le geste est net même à 48 px.
  const c0x = gauche + caseCote / 2;
  const c0y = y(0) + caseCote / 2;
  const d = caseCote * 0.52;              // demi-envergure de la coche

  const rangee = (i, remplie) => {
    const yy = y(i);
    return `
  <rect x="${gauche}" y="${yy}" width="${caseCote}" height="${caseCote}" rx="${rayonCase}"
        fill="${remplie ? VERT : "none"}" stroke="${BLANC}" stroke-width="${caseCote * 0.16}"/>
  <rect x="${ligneGauche}" y="${yy + (caseCote - ligneHauteur) / 2}"
        width="${ligneLargeur}" height="${ligneHauteur}" rx="${rayonLigne}" fill="${BLANC}"/>`;
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cote} ${cote}">
  <rect width="${cote}" height="${cote}" fill="${BLEU}"/>${rangee(0, true)}${rangee(1, false)}${rangee(2, false)}
  <path d="M ${c0x - d * 0.62} ${c0y + d * 0.05} L ${c0x - d * 0.16} ${c0y + d * 0.5} L ${c0x + d * 0.66} ${c0y - d * 0.5}"
        fill="none" stroke="${BLANC}" stroke-width="${caseCote * 0.26}"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

// "any" : le dessin peut toucher les bords, l'OS ne rogne rien. Marge minime pour l'esthétique.
const svgPlein = svgListe({ margeCote: 8 });
// "maskable" : ~12 % de marge de sécurité sur chaque bord (consigne Android), le dessin utile
// tient dans le cercle inscrit même si l'OS découpe un rond ou un squircle par-dessus.
const svgMaskable = svgListe({ margeCote: 14 });

fs.writeFileSync(path.join(SORTIE, "liste.svg"), svgPlein, "utf8");
fs.writeFileSync(path.join(SORTIE, "liste-maskable.svg"), svgMaskable, "utf8");

const CIBLES = [
  { svg: svgPlein, taille: 192, fichier: "icone-192.png" },
  { svg: svgPlein, taille: 512, fichier: "icone-512.png" },
  { svg: svgPlein, taille: 180, fichier: "icone-apple-180.png" },
  { svg: svgMaskable, taille: 192, fichier: "icone-maskable-192.png" },
  { svg: svgMaskable, taille: 512, fichier: "icone-maskable-512.png" },
];

const navigateur = await chromium.launch();
try {
  for (const { svg, taille, fichier } of CIBLES) {
    const page = await navigateur.newPage({ viewport: { width: taille, height: taille } });
    // Page minimale : le SVG occupe tout le viewport, zéro marge de page, zéro fond parasite.
    await page.setContent(
      `<!doctype html><html><head><style>html,body{margin:0;padding:0;}svg{display:block;}</style></head><body>${svg}</body></html>`
    );
    await page.screenshot({ path: path.join(SORTIE, fichier), omitBackground: false });
    await page.close();
  }
} finally {
  await navigateur.close();
}
console.log(`Icônes générées dans ${SORTIE}`);
