// Génère un petit PNG factice qui RESSEMBLE à un QR code (damier 21×21 modules avec les 3
// carrés de repérage aux coins) — pas un vrai code scannable, juste assez pour juger l'affichage
// d'une vignette et du plein écran (relecture carnet-voyage §F : la pièce factice était un carré
// noir uniforme, impossible de juger si un QR se lirait). Aucune dépendance externe : zlib est
// dans Node, le format PNG minimal (grayscale 1 bit, sans filtre) tient dans une centaine de
// lignes. Appelé une fois par tests/donnees_factices.mjs, jamais au chargement d'un module UI.
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

const MODULES = 21; // taille d'un QR version 1 (référence visuelle, pas un vrai encodage)
const QUIET = 2; // marge blanche autour (« quiet zone »), sans laquelle les 3 repères se
                  // perdent visuellement contre le bord — un vrai QR en a toujours une.
const COTE = MODULES + QUIET * 2;
const ZOOM = 8; // px par module → PNG net à l'écran comme en plein écran

/** true si le module (x, y), en coordonnées AVEC quiet zone, est noir. Motif : les 3 carrés de
 *  repérage standard d'un QR (7x7 : anneau noir, anneau blanc, centre plein 3x3) en
 *  haut-gauche, haut-droit, bas-gauche, plus un damier pseudo-aléatoire déterministe ailleurs
 *  (assez irrégulier pour ne pas ressembler à un motif géométrique trompeur, mais stable d'un
 *  run à l'autre). */
function estNoir(xAvecMarge, yAvecMarge) {
  const x = xAvecMarge - QUIET, y = yAvecMarge - QUIET;
  if (x < 0 || y < 0 || x >= MODULES || y >= MODULES) return false; // quiet zone : blanc
  const dansRepere = (rx, ry) => x >= rx && x < rx + 7 && y >= ry && y < ry + 7;
  const coins = [[0, 0], [MODULES - 7, 0], [0, MODULES - 7]];
  for (const [rx, ry] of coins) {
    if (dansRepere(rx, ry)) {
      const lx = x - rx, ly = y - ry;
      const surAnneauExt = lx === 0 || lx === 6 || ly === 0 || ly === 6;
      const surAnneauInt = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4;
      return surAnneauExt || surAnneauInt;
    }
  }
  // Damier pseudo-aléatoire déterministe (pas Math.random : un PNG stable d'un run à l'autre
  // facilite la comparaison de captures, tests/comparer_captures.mjs).
  const h = (x * 928371 + y * 123457) % 997;
  return h % 3 === 0;
}

function crc32(buf) {
  let c;
  const table = crc32.table ??= (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** PNG grayscale 8 bits, sans filtre (byte 0 = 0 avant chaque ligne), damier + repères QR. */
export function genererQrFactice() {
  const taille = COTE * ZOOM;
  const IHDR = Buffer.alloc(13);
  IHDR.writeUInt32BE(taille, 0);
  IHDR.writeUInt32BE(taille, 4);
  IHDR[8] = 8; // profondeur 8 bits
  IHDR[9] = 0; // couleur : grayscale
  IHDR[10] = 0; IHDR[11] = 0; IHDR[12] = 0;

  const ligneOctets = taille + 1; // +1 pour le byte de filtre
  const raw = Buffer.alloc(ligneOctets * taille);
  for (let py = 0; py < taille; py++) {
    const my = Math.floor(py / ZOOM);
    const base = py * ligneOctets;
    raw[base] = 0; // filtre "none"
    for (let px = 0; px < taille; px++) {
      const mx = Math.floor(px / ZOOM);
      raw[base + 1 + px] = estNoir(mx, my) ? 0 : 255;
    }
  }
  const IDAT = deflateSync(raw);

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const png = Buffer.concat([
    signature,
    chunk("IHDR", IHDR),
    chunk("IDAT", IDAT),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

/** data: URL prête à servir par le bouchon Storage de recette_ecrans.mjs. */
export function genererQrFactieDataUrl() {
  return `data:image/png;base64,${genererQrFactice().toString("base64")}`;
}

// Auto-vérification légère à l'import : la même génération doit être stable (déterministe),
// sinon comparer_captures.mjs verrait un billet différent à chaque run sans raison.
const empreinte = createHash("sha256").update(genererQrFactice()).digest("hex");
export const EMPREINTE_QR_FACTICE = empreinte;
