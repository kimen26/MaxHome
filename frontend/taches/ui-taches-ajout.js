// Feuille « Ajouter une tâche » (handoff §8, dernier écart de fidélité). Sorti de ui-taches.js
// pour rester sous 400 lignes (celui-ci en faisait déjà 336 avant cette feuille).
//
// Deux chemins d'écriture bien distincts selon « Quand », parce que le modèle de données les
// distingue déjà :
//   - Ce jour / Semaine / Mois → une OCCURRENCE (`taches`, `recurrent_id: null`), avec une
//     échéance calculée par `echeance()`. C'est un one-shot : rien à régler, rien à répéter.
//   - En attente → aucune échéance n'est possible (`taches.echeance` est NOT NULL en base,
//     006_taches.sql) : « en attente » n'existe dans ce projet que sous la forme d'une TÂCHE
//     RÉCURRENTE de fréquence `au_besoin` (déjà le mécanisme du Todo existant, cf. ui-taches.js
//     `auBesoinActives`). On crée donc un récurrent, pas une occurrence.
//
// Les parts affichées suivent toujours `partsTexte`/`creditDe` (taches.js, figé) : ce fichier
// ne recalcule rien à la main, il choisit juste la valeur d'entrée (`pts`, `qui`, `qui2`).

import { $, txt, ouvrirFeuille, fermerFeuille, toast } from "../socle/ui-base.js";
import { ECHELLE_QUART, partsTexte, echeance, jourIso } from "./taches.js";

const RYTHMES = [["jour", "Ce jour"], ["semaine", "Semaine"], ["mois", "Mois"], ["todo", "En attente"]];

export function creerAjoutTache(api, etat, cb, { onEcrit } = {}) {
  const membres = () => etat.membres.map((m) => m.prenom);

  /** Titres suggérés : ceux des tâches récurrentes actives dont la fréquence correspond au
   *  rythme choisi (« jour » → quotidien, etc.) — pas de liste en dur, ça reflète ce que le
   *  foyer fait déjà. Une tâche notée « Ce jour » n'a pas vocation à devenir récurrente ici :
   *  la suggestion sert à retrouver vite un titre déjà tapé pour une même corvée ponctuelle. */
  function suggestions(cad) {
    const freq = { jour: "quotidien", semaine: "hebdo", mois: "mensuel", todo: "au_besoin" }[cad];
    return [...new Set(etat.tachesRec.filter((r) => r.actif && r.frequence === freq).map((r) => r.titre))].slice(0, 8);
  }

  function render(etatForm) {
    const { titre, cad, qui, pts, oblig, partageable } = etatForm;
    const [p1, p2] = membres();
    const aDeux = qui === "_deux";

    const boutonRythme = ([k, nom]) => `<button type="button" class="btn-choix${cad === k ? " actif" : ""}" data-cad="${k}">${txt(nom)}</button>`;
    const boutonPersonne = (val, nom) => `<button type="button" class="btn-choix${qui === val ? " actif" : ""}" data-qui="${val}">${txt(nom)}</button>`;
    const boutonPart = (q) => `<button type="button" class="btn-part${pts === q ? " actif" : ""}" data-pts="${q}">${txt(partsTexte(q))}</button>`;
    const boutonDrapeau = (cle, nom, actif) => `<button type="button" class="btn-choix${actif ? " actif" : ""}" data-drapeau="${cle}">${txt(nom)}</button>`;

    const libelleValider = cad === "todo" ? `Mettre en attente · ${partsTexte(pts)} part${pts >= 8 ? "s" : ""}`
      : aDeux ? `✓ Fait à deux · ${partsTexte(pts / 2)} part chacun`
        : qui ? `✓ Fait · ${partsTexte(pts)} part${pts >= 8 ? "s" : ""} pour ${txt(qui)}`
          : `Mettre en attente · ${partsTexte(pts)} part${pts >= 8 ? "s" : ""}`;
    const classeValider = cad !== "todo" && qui ? "btn-vert" : "btn-bleu";

    $("#feuille-corps").innerHTML = `<div class="pile" data-form-ajout-tache>
      <div class="entete-feuille-todo">
        <h2 class="feuille-titre">${cad === "todo" ? "Nouveau travail" : "Ajouter une tâche"}</h2>
        <span class="sous">${txt(RYTHMES.find(([k]) => k === cad)?.[1] ?? "")}</span>
      </div>
      <input type="text" id="ajout-titre" class="champ" placeholder="ex. Monter l'étagère de la chambre" value="${txt(titre)}">
      <div class="puces-suggestions">${suggestions(cad).map((s) =>
        `<button type="button" class="puce-suggestion${titre === s ? " actif" : ""}" data-suggestion="${txt(s)}">${txt(s)}</button>`).join("")}</div>
      <div class="champ-groupe">
        <span class="etiquette-champ">Quand</span>
        <div class="ligne-boutons-4">${RYTHMES.map(boutonRythme).join("")}</div>
      </div>
      <div class="champ-groupe">
        <span class="etiquette-champ">Fait par</span>
        <div class="ligne-boutons-3">
          ${boutonPersonne(p1, p1)}${boutonPersonne(p2, p2)}${boutonPersonne("_deux", "À deux")}
        </div>
      </div>
      <div class="champ-groupe">
        <span class="etiquette-champ">Parts · 0,5 lait du soir → 8 salle de bain</span>
        <div class="ligne-parts">${ECHELLE_QUART.map(boutonPart).join("")}</div>
      </div>
      <div class="ligne-boutons-2">
        ${boutonDrapeau("oblig", "Obligatoire", oblig)}
        ${boutonDrapeau("partageable", "Faisable à deux", partageable)}
      </div>
      <button type="button" id="ajout-valider" class="${classeValider} grandir">${txt(libelleValider)}</button>
    </div>`;

    const racine = $("[data-form-ajout-tache]");
    racine.querySelector("#ajout-titre").addEventListener("input", (e) => majEtat({ titre: e.target.value }));
    for (const b of racine.querySelectorAll("[data-suggestion]")) {
      b.addEventListener("click", () => majEtat({ titre: b.dataset.suggestion }));
    }
    for (const b of racine.querySelectorAll("[data-cad]")) {
      b.addEventListener("click", () => majEtat({ cad: b.dataset.cad }));
    }
    for (const b of racine.querySelectorAll("[data-qui]")) {
      // Retapper la personne déjà choisie la désélectionne : le handoff permet de ne choisir
      // personne (tâche créée non faite, cf. §8 du brief).
      b.addEventListener("click", () => majEtat({ qui: qui === b.dataset.qui ? null : b.dataset.qui,
        // Choisir « À deux » active aussi `partageable` (spec §8) ; redevenir seul ne la désactive
        // pas automatiquement — Faisable à deux reste une bascule que la personne règle elle-même.
        ...(b.dataset.qui === "_deux" && qui !== "_deux" ? { partageable: true } : {}) }));
    }
    for (const b of racine.querySelectorAll("[data-pts]")) {
      b.addEventListener("click", () => majEtat({ pts: Number(b.dataset.pts) }));
    }
    for (const b of racine.querySelectorAll("[data-drapeau]")) {
      b.addEventListener("click", () => majEtat({ [b.dataset.drapeau]: !etatForm[b.dataset.drapeau] }));
    }
    racine.querySelector("#ajout-valider").addEventListener("click", () => valider(etatForm));
  }

  let etatCourant = null;
  function majEtat(patch) { etatCourant = { ...etatCourant, ...patch }; render(etatCourant); }

  /** Écrit la tâche. « todo » crée une tâche récurrente au_besoin (seul modèle « sans date »
   *  que porte la base) ; les trois autres créent une occurrence ponctuelle, éventuellement
   *  déjà cochée si une personne est choisie — parts figées à la création (D-027), jamais
   *  recalculées ensuite. */
  async function valider(etatForm) {
    const titre = etatForm.titre.trim();
    if (!titre) return;
    const aDeux = etatForm.qui === "_deux";
    const [p1, p2] = membres();
    try {
      if (etatForm.cad === "todo") {
        const r = await api.creerTacheRec({
          titre, categorie: "Maison", frequence: "au_besoin", fois: 1,
          parts_quart: etatForm.pts, obligatoire: etatForm.oblig, partageable: etatForm.partageable,
          actif: true, ordre: etat.tachesRec.length + 1,
        });
        etat.tachesRec.push(r);
      } else {
        const jour = jourIso(new Date());
        const freq = { jour: "quotidien", semaine: "hebdo", mois: "mensuel" }[etatForm.cad];
        const e = echeance(freq, jour);
        const fait = !!etatForm.qui;
        const [t] = await api.creerTaches([{
          recurrent_id: null, titre, categorie: "Maison", echeance: e, rang: 1,
          qui: fait ? (aDeux ? p1 : etatForm.qui) : null,
          qui2: fait && aDeux ? p2 : null,
          fait_le: fait ? new Date().toISOString() : null,
          parts_quart: fait ? etatForm.pts : 0,
        }]);
        etat.taches.push(t);
      }
      fermerFeuille();
      toast(etatForm.cad === "todo" ? "Ajouté aux travaux en attente." : "Tâche ajoutée.");
      onEcrit?.();
    } catch (e) { cb.echec(e); }
  }

  /** Ouvre la feuille. `preset` permet au bouton « + Ajouter aux travaux » du Todo (ui-taches.js)
   *  de pré-régler « En attente » sans dupliquer ce formulaire (D-024). */
  function ouvrir(preset = {}) {
    etatCourant = { titre: "", cad: "jour", qui: null, pts: 4, oblig: false, partageable: false, ...preset };
    ouvrirFeuille("");
    render(etatCourant);
  }

  return { ouvrir };
}
