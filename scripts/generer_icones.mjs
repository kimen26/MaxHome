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

// Dessin : une maison stylisée (toit + corps + porte), traits épais, aucun dégradé, aucun
// détail fin — jugée à l'œil pour rester lisible à 48 px sur un téléphone (cf. rapport).
// viewBox 0-100 : c'est le pourcentage de marge qui distingue les variantes "any"/"maskable".
function svgMaison({ margeCote }) {
  // margeCote : zone de sécurité de chaque bord, en unités de viewBox (0-100). Android peut
  // rogner cette marge sur les icônes "maskable" (découpe en rond ou squircle) : le dessin
  // doit rester entier même si elle disparaît.
  const cote = 100;
  const centre = cote / 2;

  // Le dessin est CENTRÉ dans la zone utile, verticalement comme horizontalement : une maison
  // collée en bas laisse un vide en haut qui saute aux yeux sur l'écran d'accueil, entre des
  // icônes qui, elles, remplissent leur carré.
  const zone = cote - margeCote * 2;       // côté de la zone utile
  const largeur = zone;                    // le toit occupe toute la largeur utile
  const hauteur = zone * 0.78;             // la maison est un peu moins haute que large
  const gauche = centre - largeur / 2;
  const droite = centre + largeur / 2;
  const haut = centre - hauteur / 2;       // pointe du toit
  const bas = centre + hauteur / 2;        // sol
  const basToit = haut + hauteur * 0.45;   // jonction toit / corps

  // Le corps chevauche le bas du toit : deux formes blanches jointives laissent sinon un
  // liseré bleu d'anti-aliasing sur la ligne de jonction, visible même à grande taille.
  const chevauchement = hauteur * 0.03;

  // Le toit s'arrête EXACTEMENT aux bords du corps : un débordement (ancien `+3`) produisait
  // deux petits ergots aux extrémités, visibles comme des défauts à 192 px.
  const porteLargeur = largeur * 0.26;
  const porteHaut = bas - hauteur * 0.34;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cote} ${cote}">
  <rect width="${cote}" height="${cote}" fill="${BLEU}"/>
  <polygon points="${gauche},${basToit} ${centre},${haut} ${droite},${basToit}" fill="${BLANC}"/>
  <rect x="${gauche + largeur * 0.08}" y="${basToit - chevauchement}"
        width="${largeur * 0.84}" height="${bas - basToit + chevauchement}" fill="${BLANC}"/>
  <rect x="${centre - porteLargeur / 2}" y="${porteHaut}"
        width="${porteLargeur}" height="${bas - porteHaut}" fill="${BLEU}"/>
</svg>`;
}

// "any" : le dessin peut toucher les bords, l'OS ne rogne rien. Marge minime pour l'esthétique.
const svgPlein = svgMaison({ margeCote: 6 });
// "maskable" : ~10 % de marge de sécurité sur chaque bord (consigne Android), le dessin utile
// tient dans le cercle inscrit même si l'OS découpe un rond ou un squircle par-dessus.
const svgMaskable = svgMaison({ margeCote: 12 });

fs.writeFileSync(path.join(SORTIE, "maison.svg"), svgPlein, "utf8");
fs.writeFileSync(path.join(SORTIE, "maison-maskable.svg"), svgMaskable, "utf8");

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
