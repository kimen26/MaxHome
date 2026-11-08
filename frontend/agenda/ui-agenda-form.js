// Formulaire d'un événement de l'agenda Google du foyer : ajouter, modifier, supprimer, en feuille.
// Assemblé avec les briques du socle (blocs-form : champs ; blocs : choixDetaille ; ui-base :
// feuille, confirmation, toast) — aucun HTML de champ réécrit ici. Les règles de saisie sont dans
// saisie-evenement.js (pures), l'écriture dans api.js (Edge Function agenda-google).
// Une erreur s'affiche DANS la feuille (le bandeau rouge de la page est derrière elle) et part aussi
// à `cb.echec` ; le formulaire reste ouvert avec ce qui a été tapé.

import { $, txt, ouvrirFeuille, fermerFeuille, toast, confirmer, cacherBandeau } from "../socle/ui-base.js";
import { champ, caseACocher, lire } from "../socle/blocs-form.js";
import { choixDetaille, marquerChoix } from "../socle/blocs.js";
import { QUI } from "./calendrier.js";
import { pastilleQui } from "./ui-agenda-liste.js";
import { TITRE_MAX, valeursInitiales, finSuivantDebut, saisieEvenement } from "./saisie-evenement.js";

const OPTIONS_QUI = QUI.map((q) => ({ valeur: q, titre: q, marque: pastilleQui(q) }));

function htmlForm(v, modification) {
  return `<form class="pile agenda-form" data-agenda-form novalidate>
    <h2>${modification ? "Modifier l’événement" : "Ajouter un événement"}</h2>
    ${champ("titre", "Titre", { valeur: v.titre, requis: true, placeholder: "Piscine, garde du mercredi…",
      attrs: `maxlength="${TITRE_MAX}" autocomplete="off"` })}
    <input type="hidden" name="personne" value="${txt(v.personne)}">
    <div class="agenda-form-groupe"><span class="agenda-form-etiquette">Pour qui</span>
      ${choixDetaille(OPTIONS_QUI, v.personne, { attr: "qui", etiquette: "Pour qui" })}</div>
    ${caseACocher("toute", "Toute la journée", v.toute)}
    <div class="agenda-form-paire">
      ${champ("debut", "Du", { type: "date", valeur: v.debut, requis: true })}
      ${champ("fin", "Au", { type: "date", valeur: v.fin, requis: true })}
    </div>
    <div class="agenda-form-paire" data-heures${v.toute ? " hidden" : ""}>
      ${champ("heureDebut", "De", { type: "time", valeur: v.heureDebut })}
      ${champ("heureFin", "À", { type: "time", valeur: v.heureFin })}
    </div>
    <p class="agenda-erreur" role="alert" data-erreur hidden></p>
    <button type="submit" class="btn btn-bleu grandir agenda-valider">${modification ? "Enregistrer" : "Ajouter"}</button>
    ${modification ? `<button type="button" class="btn grandir agenda-supprimer" data-supprimer>Supprimer</button>` : ""}
  </form>`;
}

const lireValeurs = (form) => lire(form, { booleens: ["toute"] });

function montrerErreur(form, message) {
  const p = form.querySelector("[data-erreur]");
  p.textContent = message ?? "";
  p.hidden = !message;
  if (message) p.scrollIntoView?.({ block: "nearest" });
}

const occupe = (form, oui) => { for (const b of form.querySelectorAll("button")) b.disabled = oui; };

/**
 * @param apres () => Promise : recharge les événements Google et rend l'écran (appelé après une écriture réussie)
 * @returns { ouvrir({ jour, evenement?, valeurs? }) } — `evenement` (type foyer, avec `qui`) = modification ;
 *   `valeurs` = ce qui avait été tapé, pour rouvrir le formulaire tel qu'il était.
 */
export function creerFormulaireEvenement(api, etat, cb, { apres }) {
  async function ecrire(form, action, message) {
    occupe(form, true);
    montrerErreur(form, null);
    try {
      await action();
    } catch (e) {
      occupe(form, false);
      montrerErreur(form, e.message ?? String(e));
      cb.echec(e);
      return;
    }
    fermerFeuille();
    cacherBandeau();
    toast(message);
    await apres();
  }

  async function supprimer(form, evenement) {
    const valeurs = lireValeurs(form);
    // `confirmer` prend la feuille : annulée, on rouvre le formulaire tel qu'il était.
    if (!(await confirmer(`Supprimer « ${evenement.titre} » de l’agenda ?`, { ok: "Supprimer" }))) {
      ouvrir({ evenement, valeurs });
      return;
    }
    try {
      await api.supprimerEvenement(evenement.id);
    } catch (e) {
      ouvrir({ evenement, valeurs });
      montrerErreur($("#feuille-corps [data-agenda-form]"), e.message ?? String(e));
      cb.echec(e);
      return;
    }
    cacherBandeau();
    toast("Événement supprimé.");
    await apres();
  }

  function brancher(form, evenement) {
    let debutPrecedent = form.elements.debut.value;
    form.addEventListener("click", (ev) => {
      const bouton = ev.target.closest("[data-qui]");
      if (!bouton) return;
      marquerChoix(bouton);
      form.elements.personne.value = bouton.dataset.qui;
    });
    form.elements.toute.addEventListener("change", (ev) => {
      form.querySelector("[data-heures]").hidden = ev.target.checked;
      if (!ev.target.checked) form.elements.fin.value = form.elements.debut.value; // des heures : un seul jour
    });
    form.elements.debut.addEventListener("change", () => {
      form.elements.fin.value = finSuivantDebut(debutPrecedent, form.elements.debut.value, form.elements.fin.value);
      debutPrecedent = form.elements.debut.value;
    });
    form.querySelector("[data-supprimer]")?.addEventListener("click", () => supprimer(form, evenement));
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      let saisie;
      try { saisie = saisieEvenement(lireValeurs(form)); } catch (e) { return montrerErreur(form, e.message); }
      return evenement
        ? ecrire(form, () => api.modifierEvenement(evenement.id, saisie), "Événement modifié.")
        : ecrire(form, () => api.creerEvenement(saisie), "Événement ajouté.");
    });
  }

  function ouvrir({ jour, evenement = null, valeurs = null }) {
    const v = valeurs ?? valeursInitiales({ jour, evenement, prenom: etat.prenom });
    ouvrirFeuille(htmlForm(v, evenement !== null));
    const form = $("#feuille-corps [data-agenda-form]");
    brancher(form, evenement);
    if (!evenement && !valeurs) form.elements.titre.focus();
  }

  return { ouvrir };
}
