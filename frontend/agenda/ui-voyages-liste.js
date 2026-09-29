// Onglet « Voyages » (Mois · Vacances · Voyages) : une carte par voyage, à venir d'abord
// (« dans 18 jours »), passés repliés en bas (tap pour déplier, comme la carte « Terminées »
// du Budget). Tap sur une carte → fiche complète (ui-fiche-voyage.js). Réglages · Voyages
// (ui-voyages.js) reste le seul endroit pour créer ou dater un voyage — cet écran est une
// porte d'entrée en lecture vers la fiche.

import { $, txt } from "../socle/ui-base.js";
import { formatPeriode, jourIso } from "./calendrier.js";
import { joursAvant } from "./carnet.js";

export function creerUiVoyagesListe(api, etat, cb, { ouvrirFiche }) {
  let passesDepliees = false;

  function ligne(v) {
    const a = jourIso(new Date());
    const decompte = joursAvant(v, a);
    const quand = typeof decompte === "number" ? `dans ${decompte} j` : decompte === "en cours" ? "en cours" : "";
    const lieux = etat.voyageCompte?.[v.id]?.lieux ?? 0;
    const resas = etat.voyageCompte?.[v.id]?.resas ?? 0;
    return `<div class="carte-voyage cliquable" data-voyage="${v.id}" tabindex="0" role="button">
      <div class="cv-corps">
        <span class="cv-titre">${txt(v.titre)}</span>
        <span class="cv-sous">${txt(formatPeriode(v.debut, v.fin, { annee: true }))}${v.lieu ? ` · ${txt(v.lieu)}` : ""}</span>
        <span class="cv-compte">${txt(resas)} résa${resas > 1 ? "s" : ""} · ${txt(lieux)} lieu${lieux > 1 ? "x" : ""}</span>
      </div>
      ${quand ? `<span class="cv-quand">${txt(quand)}</span>` : ""}
    </div>`;
  }

  function html() {
    const a = jourIso(new Date());
    const tries = [...etat.voyages].sort((x, y) => x.debut.localeCompare(y.debut));
    const aVenir = tries.filter((v) => v.fin >= a);
    const passes = tries.filter((v) => v.fin < a).reverse();
    return `
      <div class="voyages-cartes">${aVenir.length ? aVenir.map(ligne).join("") : `<p class="vide">Aucun voyage à venir.</p>`}</div>
      ${passes.length ? `<div class="carte carte-voyages-passes">
        <button type="button" class="ct-entete" data-plier-voyages-passes aria-expanded="${passesDepliees}">
          <span>Passés (${passes.length})</span><span class="ct-voir">${passesDepliees ? "Replier" : "Voir"}</span>
        </button>
        <div class="voyages-cartes"${passesDepliees ? "" : " hidden"}>${passes.map(ligne).join("")}</div>
      </div>` : ""}`;
  }

  function rendre() {
    $("#voyages-liste-corps").innerHTML = html();
    brancher();
  }

  function brancher() {
    const racine = $("#voyages-liste-corps");
    for (const el of racine.querySelectorAll("[data-voyage]")) {
      const agir = () => ouvrirFiche(Number(el.dataset.voyage));
      el.addEventListener("click", agir);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); agir(); } });
    }
    racine.querySelector("[data-plier-voyages-passes]")?.addEventListener("click", () => {
      passesDepliees = !passesDepliees;
      rendre();
    });
  }

  return { rendre };
}
