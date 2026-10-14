// « Télécharger la page » : un fichier .html AUTONOME (CSS en ligne, données filtrées comme la fonction
// SQL en ligne, Leaflet depuis cdnjs) à envoyer par messagerie ou à ouvrir sans connexion. La
// construction est PURE (testée sans navigateur) ; seul `telechargerPage` touche le réseau local
// (lecture des feuilles de style de l'app) et le DOM (lien de téléchargement).
import { txt } from "../socle/ui-base.js";
import { rendrePagePartage, brancherPagePartage } from "./partage-page.js";
import { pointsDeCarte, legende } from "./ui-fiche-carte.js";
import { JS_URL, CSS_URL } from "./carte.js";

/** Feuilles de style de la page, relatives au dossier de l'app (ordre = cascade de index.html). */
export const FICHIERS_CSS = ["style.css", "socle/socle.css", "agenda/agenda.css", "agenda/fiche-voyage.css", "agenda/partage.css"];

/** « Week-end à la mer » → « week-end-a-la-mer-carnet.html » ; titre vide → « voyage-carnet.html ». */
export function nomFichierCarnet(titre) {
  const base = String(titre ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base || "voyage"}-carnet.html`;
}

/** JSON sûr dans un <script> : « < » échappé, la balise ne peut pas se fermer avant l'heure. */
const jsonEnLigne = (valeur) => JSON.stringify(valeur).replace(/</g, "\\u003c");

/** Dessine la carte une fois l'onglet visible ; Leaflet absent (hors ligne) → message, pas de plantage. */
function dessinerCarte() {
  const cadre = document.getElementById("carte-leaflet");
  if (!cadre || cadre.dataset.dessinee) return;
  cadre.dataset.dessinee = "1";
  if (!window.L) { cadre.textContent = "Carte indisponible hors ligne."; return; }
  const points = JSON.parse(document.getElementById("points").textContent);
  const carte = L.map(cadre, { scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap", maxZoom: 19 }).addTo(carte);
  const marqueurs = points.map((p) => {
    const puce = document.createElement("span");
    puce.style.background = p.couleur;
    const icone = L.divIcon({ className: "carte-marqueur", html: puce.outerHTML, iconSize: [18, 18] });
    const popup = document.createElement("div");
    const nom = document.createElement("strong"); nom.textContent = p.nom;
    const mot = document.createElement("p"); mot.textContent = p.mot;
    const lien = document.createElement("a"); lien.href = p.itineraire; lien.target = "_blank"; lien.rel = "noopener"; lien.textContent = "Itinéraire ↗";
    popup.append(nom, mot, lien);
    return L.marker([p.lat, p.lng], { icon: icone }).addTo(carte).bindPopup(popup);
  });
  if (marqueurs.length === 1) carte.setView(marqueurs[0].getLatLng(), 14);
  else carte.fitBounds(L.featureGroup(marqueurs).getBounds().pad(0.2));
}

const carteStatique = (points) => points.length
  ? `<div class="fiche-carte"><div id="carte-leaflet" class="carte-cadre"></div>${legende(points)}</div>`
  : `<p class="vide">Aucun lieu localisé pour ce voyage.</p>`;

/**
 * Le document complet. `donnees` DOIT être déjà filtré (filtrerPourPartage) ; `css` : le texte des
 * feuilles de style ; `meteo` : instantané du jour du téléchargement (Map ou null).
 */
export function construirePageAutonome(donnees, meteo, css) {
  const points = pointsDeCarte(donnees.lieux, donnees.resas);
  const corps = rendrePagePartage(donnees, meteo, { carte: carteStatique(points) });
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${txt(donnees.voyage.titre)}</title>
<link rel="stylesheet" href="${CSS_URL}">
<style>${css}</style>
</head><body>
<main id="partage" class="partage">${corps}</main>
<script type="application/json" id="points">${jsonEnLigne(points)}</script>
<script src="${JS_URL}"></script>
<script>
${dessinerCarte.toString()}
(${brancherPagePartage.toString()})(document, (cle) => { if (cle === "carte") dessinerCarte(); });
</script>
</body></html>`;
}

async function lireCss() {
  const textes = await Promise.all(FICHIERS_CSS.map(async (f) => {
    const rep = await fetch(new URL(f, document.baseURI));
    if (!rep.ok) throw new Error(`Feuille de style introuvable : ${f} (HTTP ${rep.status})`);
    return rep.text();
  }));
  return textes.join("\n");
}

/** Construit la page et déclenche son téléchargement `<titre>-carnet.html`. Lève en cas d'échec. */
export async function telechargerPage(donnees, meteo) {
  const html = construirePageAutonome(donnees, meteo, await lireCss());
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichierCarnet(donnees.voyage.titre);
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
