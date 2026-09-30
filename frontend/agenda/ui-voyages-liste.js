// Onglet « Voyages » (Mois · Vacances · Voyages) : une carte par voyage, à venir d'abord
// (« dans 18 jours »), passés repliés en bas (tap pour déplier, comme la carte « Terminées »
// du Budget). Tap sur une carte → fiche complète (ui-fiche-voyage.js). Réglages · Voyages
// (ui-voyages.js) reste le seul endroit pour créer ou dater un voyage — cet écran est une
// porte d'entrée en lecture vers la fiche.

import { $, txt } from "../socle/ui-base.js";
import { formatPeriode, jourIso } from "./calendrier.js";
import { joursAvant, couleurVoyage } from "./carnet.js";
import { euros } from "../budget/calc.js";

/** Les 2 premières lignes non vides du résumé, texte BRUT (jamais le markdown : « ## », « ** »
 *  n'ont rien à faire sur une carte de liste, relecture point 4) — un simple retrait des motifs
 *  les plus visibles, la mise en forme complète (rendreTopo) reste réservée à la fiche. */
function avantGoutResume(texte) {
  if (!texte) return "";
  const lignes = texte.split(/\r?\n/)
    .map((l) => l.replace(/^#{1,6}\s*/, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/^- /, "").trim())
    .filter(Boolean);
  return lignes.slice(0, 2).join(" ");
}

/** Barre + montant de la carte (relecture point 4) : rouge + « Dépassé » si le total dépasse le
 *  prévu ; sans AUCUNE enveloppe sur le voyage, pas de barre trompeuse — juste ce qui est engagé
 *  et une invite à cadrer. */
function budgetTexte(budget, couleur) {
  const { totaux } = budget;
  if (!totaux.prevu) {
    return totaux.engage ? `<span class="cv-budget">${txt(euros(totaux.engage))} engagés · budget à cadrer</span>` : "";
  }
  const total = totaux.engage + totaux.aVenir;
  const pct = Math.min(100, Math.round((total / totaux.prevu) * 100));
  const coul = totaux.depasse ? "var(--rouge)" : couleur;
  return `<div class="cv-barre"><span class="cv-barre-remplie" style="width:${pct}%;background:${coul}"></span></div>
    <span class="cv-budget${totaux.depasse ? " depasse" : ""}">${txt(euros(total))} / ${txt(euros(totaux.prevu))}${totaux.depasse ? " · Dépassé" : ""}</span>`;
}

export function creerUiVoyagesListe(api, etat, cb, { ouvrirFiche }) {
  let passesDepliees = false;

  function ligne(v) {
    const a = jourIso(new Date());
    const decompte = joursAvant(v, a);
    const quand = typeof decompte === "number" ? `J-${decompte}` : decompte === "en cours" ? "En cours" : "";
    const compte = etat.voyageCompte?.[v.id] ?? { lieux: 0, resas: 0, budget: null, resume: null };
    const couleur = couleurVoyage(v.id);
    const avantGout = avantGoutResume(compte.resume);
    return `<div class="carte-voyage cliquable" data-voyage="${v.id}" tabindex="0" role="button" style="border-left-color:${couleur}">
      <div class="cv-corps">
        <span class="cv-titre">${txt(v.titre)}</span>
        <span class="cv-sous">${txt(formatPeriode(v.debut, v.fin, { annee: true }))}${v.lieu ? ` · ${txt(v.lieu)}` : ""}</span>
        ${avantGout ? `<span class="cv-resume">${txt(avantGout)}</span>` : ""}
        <span class="cv-compte">${txt(compte.resas)} résa${compte.resas > 1 ? "s" : ""} · ${txt(compte.lieux)} lieu${compte.lieux > 1 ? "x" : ""}</span>
        ${compte.budget ? budgetTexte(compte.budget, couleur) : ""}
      </div>
      ${quand ? `<span class="cv-quand" style="color:${couleur}">${txt(quand)}</span>` : ""}
    </div>`;
  }

  function html() {
    const a = jourIso(new Date());
    const tries = [...etat.voyages].sort((x, y) => x.debut.localeCompare(y.debut));
    const aVenir = tries.filter((v) => v.fin >= a);
    const passes = tries.filter((v) => v.fin < a).reverse();
    return `
      <p class="voyages-invite">Touchez un voyage pour ouvrir son carnet.</p>
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
