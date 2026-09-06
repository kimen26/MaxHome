// Blocs d'affichage partagés entre modules : ligne cochable, carte-liste, chiffres d'en-tête,
// ligne de réglage, panneau de détail. Chaque module assemble ces blocs, il ne redessine pas.

import { $, txt, estPC, ouvrirFeuille, fermerFeuille, feuilleOuverte } from "./ui-base.js";

/** Ligne cochable (mouvement, tâche) : case à gauche, corps, colonne de droite. */
export function ligneCoche({ id, titre, sous = "", notes = [], droite = "", pastille = null,
  cochee = false, prioritaire = false, alerte = false }) {
  const classes = ["mvt", "cliquable", cochee ? "fait" : "", alerte ? "alerte" : ""].filter(Boolean).join(" ");
  const aria = cochee ? `Annuler la coche de ${titre}` : `Marquer ${titre} comme fait`;
  return `<div class="${classes}" data-id="${id}">
    <span class="case${cochee ? " cochee" : ""}${prioritaire ? " prioritaire" : ""}" data-cocher="${id}"
          role="checkbox" aria-checked="${cochee}" tabindex="0" aria-label="${txt(aria)}">${cochee ? "✓" : ""}</span>
    <div class="mvt-corps">
      <span class="mvt-titre">${txt(titre)}</span>
      ${sous ? `<span class="mvt-trajet">${txt(sous)}</span>` : ""}
      ${notes.filter(Boolean).map((n) => `<span class="mvt-note">${txt(n)}</span>`).join("")}
    </div>
    <div class="mvt-droite">${droite}${pastille ? `<span class="pastille">${txt(pastille)}</span>` : ""}</div>
  </div>`;
}

/** Enveloppe une liste de lignes, ou affiche le texte « vide ». */
export const carteListe = (lignes, vide) =>
  lignes.length ? `<div class="carte-liste">${lignes.join("")}</div>` : `<p class="vide">${txt(vide)}</p>`;

/** Chiffres d'en-tête : [{ etiquette, valeur, accent }]. */
export const chiffres = (liste) => liste.map(({ etiquette, valeur, accent }) =>
  `<span class="chiffre"><span class="etiquette">${txt(etiquette)}</span>
   <span class="mono valeur${accent ? " accent" : ""}">${txt(valeur)}</span></span>`).join("");

export const titreSection = (t) => `<h2 class="titre-section">${txt(t)}</h2>`;

/** Branche les cases et les lignes d'une racine : `surCoche(id)`, `surLigne(id)`. */
export function brancherCoches(racine, surCoche, surLigne) {
  for (const el of racine.querySelectorAll("[data-cocher]")) {
    const agir = (e) => { e.stopPropagation(); surCoche(Number(el.dataset.cocher)); };
    el.addEventListener("click", agir);
    el.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); agir(e); } });
  }
  if (surLigne) {
    for (const el of racine.querySelectorAll(".mvt[data-id]")) {
      el.addEventListener("click", () => surLigne(Number(el.dataset.id)));
    }
  }
}

/** Branche les boutons Modifier / Retirer d'un écran de réglages. */
export function brancherReglages(racine, surModifier, surRetirer) {
  for (const b of racine.querySelectorAll("[data-modifier]")) {
    b.addEventListener("click", () => surModifier(Number(b.dataset.modifier)));
  }
  for (const b of racine.querySelectorAll("[data-retirer]")) {
    b.addEventListener("click", () => surRetirer(Number(b.dataset.retirer)));
  }
}

/** Surligne la ligne dont le détail est ouvert (PC). */
export function marquerChoisi(racine, id) {
  for (const el of racine.querySelectorAll(".mvt[data-id]")) el.classList.toggle("choisi", Number(el.dataset.id) === id);
}

/** « De → Vers » d'un mouvement ; invite à définir les comptes tant qu'ils manquent. */
export function trajetComptes(comptes, idDe, idVers) {
  const nom = (id) => comptes.find((c) => c.id === id)?.nom ?? null;
  const de = nom(idDe);
  const vers = nom(idVers);
  if (!de && !vers) return "Comptes à définir";
  return `${de ?? "compte à définir"} → ${vers ?? "compte à définir"}`;
}

/** Ligne d'un écran de réglages (récurrent, tâche récurrente) avec Modifier / Retirer. */
export function ligneReglage({ id, titre, sous = "", consigne = "", droite = "", pastille = null, inactif = false }) {
  return `<div class="rec${inactif ? " inactif" : ""}">
    <div class="rec-corps">
      <span class="rec-titre">${txt(titre)}</span>
      ${sous ? `<span class="rec-trajet">${sous}</span>` : ""}
      ${consigne ? `<span class="rec-consigne">${txt(consigne)}</span>` : ""}
    </div>
    <div class="rec-droite">${droite}${pastille ? `<span class="pastille">${txt(pastille)}</span>` : ""}</div>
    <div class="rec-actions">
      <button class="btn-lien" data-modifier="${id}">Modifier</button>
      <button class="btn-lien" data-retirer="${id}">Retirer</button>
    </div>
  </div>`;
}

export const enteteDetail = (titre, sous) => `<div class="detail-tete">
  <div><h2>${txt(titre)}</h2><span class="sous">${txt(sous)}</span></div>
  <button class="btn-lien" data-fermer-detail>Fermer</button></div>`;

/** Panneau de détail : colonne de droite sur PC, feuille sur mobile. Renvoie la racine DOM. */
export function ouvrirPanneau(selecteurAside, html) {
  if (estPC()) {
    const a = $(selecteurAside);
    a.innerHTML = html;
    a.hidden = false;
    return a;
  }
  ouvrirFeuille(html);
  return $("#feuille-corps");
}
export function fermerPanneau(selecteurAside) {
  if (feuilleOuverte()) fermerFeuille();
  const a = $(selecteurAside);
  a.hidden = true;
  a.innerHTML = "";
}
/** Choix d'une personne : pastilles cliquables, `data-qui`. */
export const choixQui = (membres, choisi) => `<div class="choix-qui">${membres.map((p) =>
  `<button type="button" class="pastille grande${p === choisi ? " bleue" : ""}" data-qui="${txt(p)}">${txt(p)}</button>`).join("")}</div>`;
