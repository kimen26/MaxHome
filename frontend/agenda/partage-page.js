// Page partagée en LECTURE SEULE (brief fiche-voyage-v3.md, lot 3) : en-tête, légende, feuille de
// route, onglets Planning · Activités · Carte · Infos. Aucun rendu propre : on rappelle ceux de la
// fiche (fiche-route / planning / activites / infos) avec `lectureSeule`. Pur, sans réseau, donc
// rendu à l'identique par la page en ligne (partage.js) et par le fichier téléchargé.
import { txt } from "../socle/ui-base.js";
import { formatPeriode } from "./calendrier.js";
import { decompteTexte } from "./ui-fiche-bandeau.js";
import { rendreLegende } from "./fiche-statuts.js";
import { rendreFeuilleRoute } from "./fiche-route.js";
import { rendrePlanning } from "./fiche-planning.js";
import { rendreActivites } from "./fiche-activites.js";
import { rendreInfos } from "./fiche-infos.js";

export const ONGLETS_PARTAGE = [
  { cle: "planning", icone: "📅", libelle: "Planning" },
  { cle: "activites", icone: "🎟️", libelle: "Activités" },
  { cle: "carte", icone: "🗺️", libelle: "Carte" },
  { cle: "infos", icone: "ℹ️", libelle: "Infos" },
];

const onglet = (o, actif) => `<button type="button" class="fv-onglet" role="tab" data-onglet="${o.cle}" aria-selected="${o.cle === actif}" aria-controls="partage-${o.cle}-panneau">
    <span class="fv-onglet-i" aria-hidden="true">${o.icone}</span><span>${o.libelle}</span></button>`;

const panneau = (cle, contenu, actif) => `<section class="fv-panneau" id="partage-${cle}-panneau" role="tabpanel" data-panneau="${cle}"${cle === actif ? "" : " hidden"}>${contenu}</section>`;

/**
 * `donnees` : { voyage, lieux, resas, blocs } (réponse de la fonction SQL ou filtrerPourPartage).
 * `meteo` : Map jour → synthèse, ou null. `aujourdhui` : AAAA-MM-JJ pour le compteur J-n, ou null
 * (fichier téléchargé : un compteur figé mentirait). `carte` : HTML posé dans l'onglet Carte.
 */
export function rendrePagePartage({ voyage, lieux, resas, blocs }, meteo = null, { aujourdhui = null, carte = "" } = {}) {
  const actif = ONGLETS_PARTAGE[0].cle;
  const periode = formatPeriode(voyage.debut, voyage.fin, { annee: true });
  return `<div class="fiche-voyage partage-fiche">
    <header class="fiche-bandeau">
      <h1 class="bandeau-titre">${txt(voyage.titre)}</h1>
      <p class="bandeau-sous">${txt(voyage.lieu ?? "")}${voyage.lieu ? " · " : ""}${txt(periode)}</p>
      ${aujourdhui ? `<div class="bandeau-ligne"><span class="bandeau-decompte">${txt(decompteTexte(voyage, aujourdhui))}</span></div>` : ""}
    </header>
    ${rendreLegende()}
    <div id="partage-route-corps">${rendreFeuilleRoute(voyage, lieux, resas)}</div>
    <div class="fv-onglets fv-onglets-4" role="tablist">${ONGLETS_PARTAGE.map((o) => onglet(o, actif)).join("")}</div>
    ${panneau("planning", `<div id="partage-planning-corps">${rendrePlanning(voyage, lieux, resas, meteo)}</div>`, actif)}
    ${panneau("activites", rendreActivites(voyage, lieux, resas, { lectureSeule: true }), actif)}
    ${panneau("carte", `<div id="partage-carte-corps">${carte}</div>`, actif)}
    ${panneau("infos", rendreInfos(voyage, resas, blocs, { lectureSeule: true }), actif)}
    <p class="partage-pied">Page partagée en lecture seule.</p>
  </div>`;
}

/**
 * Branche onglets et feuille de route sur `doc` (document). `surOnglet(cle)` est appelé après chaque
 * affichage d'onglet (la carte ne se dessine qu'une fois son panneau visible). AUTONOME : pas
 * d'import ni de référence au module — le fichier téléchargé embarque son code tel quel
 * (partage-telecharger.js, Function.prototype.toString).
 */
export function brancherPagePartage(doc, surOnglet = () => {}) {
  const montrer = (cle) => {
    for (const p of doc.querySelectorAll("[data-panneau]")) p.hidden = p.dataset.panneau !== cle;
    for (const b of doc.querySelectorAll("[data-onglet]")) b.setAttribute("aria-selected", String(b.dataset.onglet === cle));
    surOnglet(cle);
  };
  for (const b of doc.querySelectorAll("[data-onglet]")) {
    b.addEventListener("click", () => {
      montrer(b.dataset.onglet);
      doc.getElementById(`partage-${b.dataset.onglet}-panneau`)?.scrollIntoView({ block: "start" });
    });
  }
  for (const b of doc.querySelectorAll(".fv-route [data-jour]")) {
    b.addEventListener("click", () => {
      montrer("planning");
      doc.getElementById(`fv-jour-${b.dataset.jour}`)?.scrollIntoView({ block: "start" });
    });
  }
}
