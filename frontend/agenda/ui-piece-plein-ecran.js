// Ouvre une pièce (billet, QR) : une image en plein écran fond blanc, à la largeur de l'écran
// (un QR se scanne), bouton Fermer 48 px ; un PDF ouvre directement l'URL signée dans un
// nouvel onglet plutôt qu'un visualiseur maison. Sert d'abord la copie hors ligne (Cache
// Storage) si le réseau manque, sinon l'URL signée (brief carnet-voyage.md §Écrans point 2/3).

import { urlPieceEnCache } from "./pieces-hors-ligne.js";

let racine = null;

function fermer() {
  if (!racine) return;
  const img = racine.querySelector("img");
  if (img?.src.startsWith("blob:")) URL.revokeObjectURL(img.src);
  racine.remove();
  racine = null;
}

function ouvrirImage(url) {
  fermer();
  racine = document.createElement("div");
  racine.className = "piece-plein-ecran";
  racine.innerHTML = `<img src="${url}" alt="Pièce">
    <button type="button" class="piece-plein-fermer cible44">Fermer</button>`;
  document.body.appendChild(racine);
  racine.querySelector(".piece-plein-fermer").addEventListener("click", fermer);
  racine.addEventListener("click", (e) => { if (e.target === racine) fermer(); });
  document.addEventListener("keydown", function surEchap(e) {
    if (e.key === "Escape") { fermer(); document.removeEventListener("keydown", surEchap); }
  });
}

/** `api` : pour l'URL signée (voir socle/api.js::urlPiece). Une image ouvre le visualiseur
 *  plein écran (cache hors ligne en repli) ; un PDF part dans un nouvel onglet. */
export async function ouvrirPieceEnPlein(api, piece) {
  const estImage = (piece.type_mime ?? "").startsWith("image/");
  if (!estImage) {
    const url = await api.urlPiece(piece.chemin);
    window.open(url, "_blank", "noopener");
    return;
  }
  const enCache = await urlPieceEnCache(piece.id);
  if (enCache) { ouvrirImage(enCache); return; }
  const url = await api.urlPiece(piece.chemin);
  ouvrirImage(url);
}
