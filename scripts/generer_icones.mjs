// Génère les icônes PWA de MaxHome (frontend/icones/*.png) à partir d'une image source
// (scripts/icone-source.png : la maison en quatre tuiles, un module par tuile).
//
// Pourquoi Playwright plutôt qu'une lib d'image (sharp...) : le projet n'a AUCUNE dépendance
// d'image, seulement Playwright (déjà utilisé par les recettes). Un <canvas> dans une page sait
// recadrer, redimensionner et exporter un PNG : ça suffit pour cinq fichiers qui ne changent
// qu'à une refonte du logo.
//
// Rejouable : `node scripts/generer_icones.mjs`. Pour changer le logo, remplacer la source et
// ajuster RECADRAGE si le carré arrondi n'est plus au même endroit.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const SOURCE = path.resolve("scripts/icone-source.png");
const SORTIE = path.resolve("frontend/icones");

// Carré arrondi de la source (1254 px), halo transparent autour exclu : mesuré sur l'alpha.
const RECADRAGE = { x: 64, y: 64, cote: 1126 };
// Fond des variantes opaques : le bleu du carré, là où il est le plus sombre.
const FOND = "#06297a";

// "any" : le carré arrondi tel quel, coins transparents — l'OS ne rogne rien.
// "plein" (Apple) : iOS arrondit lui-même et exige un fond opaque ; le carré remplit tout.
// "maskable" : Android découpe sa propre forme. Carré agrandi à 112 % : ses bords clairs sortent
//   du cadre, il ne reste qu'un fond bleu. Jugé sous masque arrondi (P30 Pro, EMUI) : entier ;
//   sous masque rond (Pixel), les coins des tuiles basses sont à peine rognés. Un carré réduit
//   à 72 % pour tenir dans le cercle W3C a été écarté : un carré dans un carré, illisible.
const CIBLES = [
  { taille: 192, fichier: "icone-192.png", echelle: 1, fond: null },
  { taille: 512, fichier: "icone-512.png", echelle: 1, fond: null },
  { taille: 180, fichier: "icone-apple-180.png", echelle: 1.12, fond: FOND },
  { taille: 192, fichier: "icone-maskable-192.png", echelle: 1.12, fond: FOND },
  { taille: 512, fichier: "icone-maskable-512.png", echelle: 1.12, fond: FOND },
];

const dataUrl = `data:image/png;base64,${fs.readFileSync(SOURCE).toString("base64")}`;
const navigateur = await chromium.launch();
try {
  const page = await navigateur.newPage();
  await page.setContent(`<img id="src" src="${dataUrl}">`);
  await page.waitForFunction(() => document.getElementById("src").complete);
  for (const cible of CIBLES) {
    const base64 = await page.evaluate(({ taille, echelle, fond, r }) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = taille;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      if (fond) { ctx.fillStyle = fond; ctx.fillRect(0, 0, taille, taille); }
      const cote = taille * echelle;
      const decalage = (taille - cote) / 2;
      ctx.drawImage(document.getElementById("src"), r.x, r.y, r.cote, r.cote, decalage, decalage, cote, cote);
      return canvas.toDataURL("image/png").split(",")[1];
    }, { ...cible, r: RECADRAGE });
    fs.writeFileSync(path.join(SORTIE, cible.fichier), Buffer.from(base64, "base64"));
  }
} finally {
  await navigateur.close();
}
console.log(`Icônes générées dans ${SORTIE}`);
