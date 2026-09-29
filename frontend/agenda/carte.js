// Carte Leaflet, chargée à la demande depuis cdnjs (une seule fois, promesse mémorisée) : la
// fiche voyage ne paie ce poids que si elle a des lieux localisés. Erreur de chargement (hors
// ligne, cdnjs bloqué) → l'appelant affiche « Carte indisponible hors ligne », le reste de la
// fiche continue de fonctionner (D-045, brief carnet-voyage.md §Écrans).

const JS_URL = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
const CSS_URL = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";

let promesseChargement = null;

function chargerCss() {
  if (document.querySelector(`link[href="${CSS_URL}"]`)) return;
  const lien = document.createElement("link");
  lien.rel = "stylesheet";
  lien.href = CSS_URL;
  document.head.appendChild(lien);
}

function chargerJs() {
  return new Promise((resolve, reject) => {
    if (window.L) { resolve(window.L); return; }
    const script = document.createElement("script");
    script.src = JS_URL;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Chargement de Leaflet impossible."));
    document.head.appendChild(script);
  });
}

/** Charge Leaflet une seule fois (promesse mémorisée) : des appels concurrents partagent le
 *  même chargement, aucun n'insère deux fois le script. Rejette si le réseau/cdnjs manque —
 *  à l'appelant de rattraper avec un message clair, jamais un plantage silencieux. */
export function chargerLeaflet() {
  if (!promesseChargement) {
    chargerCss();
    promesseChargement = chargerJs().catch((e) => { promesseChargement = null; throw e; });
  }
  return promesseChargement;
}

/**
 * Crée la carte dans `conteneur` (élément DOM déjà dans le document, avec une hauteur non
 * nulle) : tuiles OSM avec attribution, un marqueur par lieu localisé (icône colorée par
 * catégorie), popup nom + note + lien Itinéraire, `fitBounds` sur l'ensemble des marqueurs.
 * `lieux` : lieux déjà filtrés sur lat/lng non nuls. `couleurDe(categorie)` fournit la couleur
 * du marqueur (carnet.js::CATEGORIES_LIEU) — la légende en mots reste à la charge de l'appelant
 * (jamais la couleur seule, rules/mobile-parents.md).
 */
export async function creerCarte(conteneur, lieux, couleurDe) {
  const L = await chargerLeaflet();
  const carte = L.map(conteneur, { scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(carte);

  const marqueurs = lieux.map((lieu) => {
    const icone = L.divIcon({
      className: "carte-marqueur",
      html: `<span style="background:${couleurDe(lieu.categorie)}"></span>`,
      iconSize: [18, 18],
    });
    const m = L.marker([lieu.lat, lieu.lng], { icon: icone }).addTo(carte);
    const lien = `https://www.google.com/maps/search/?api=1&query=${lieu.lat},${lieu.lng}`;
    const note = lieu.note ? `<p>${escapeHtml(lieu.note)}</p>` : "";
    m.bindPopup(`<strong>${escapeHtml(lieu.nom)}</strong>${note}<a href="${lien}" target="_blank" rel="noopener">Itinéraire ↗</a>`);
    return m;
  });

  if (marqueurs.length === 1) carte.setView(marqueurs[0].getLatLng(), 14);
  else if (marqueurs.length > 1) carte.fitBounds(L.featureGroup(marqueurs).getBounds().pad(0.2));

  return carte;
}

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
