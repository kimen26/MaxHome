// Blocs éditables du carnet (D-047 §V2) : résumé (toujours en tête sous le bandeau) puis mosaïque
// info/astuce/attention. Chaque bloc a la couleur/l'icône de son TYPES_BLOC, un crayon 48 px ouvre
// une feuille d'édition (type, titre, texte), « + Bloc » en ajoute un, ↑/↓ change l'ordre.

import { $, txt, ouvrirFeuille, fermerFeuille, toast, confirmer } from "../socle/ui-base.js";
import { select, champ, zone, lire } from "../socle/blocs-form.js";
import { TYPES_BLOC } from "./carnet.js";
import { rendreTopo } from "./topo.js";

export function creerFicheBlocs(api, etat, cb, { voyage, blocs, rafraichir, revenirALaFiche }) {
  // Le résumé est UNIQUE (au plus un par voyage, contrainte base) : monter/descendre n'auraient
  // aucun voisin avec qui échanger — ces boutons n'apparaissent que sur les blocs de la mosaïque,
  // et y sont cachés à leur tour sur le premier/dernier de leur groupe (relecture point 8 : des
  // flèches qui ne font jamais rien se lisent comme des liens morts).
  function carteBloc(b, { premier = true, dernier = true } = {}) {
    const type = TYPES_BLOC.find((t) => t.valeur === b.type) ?? TYPES_BLOC[1];
    const rendu = rendreTopo(b.texte);
    const estResume = b.type === "resume";
    return `<div class="carte-bloc" data-bloc="${b.id}" style="background:${type.fond};border-color:${type.bord}">
      <div class="cb-tete">
        <span class="cb-pastille" style="color:${type.bord}">${type.emoji} ${txt(type.libelle)}</span>
        <div class="cb-actions">
          ${estResume ? "" : `
          <button type="button" class="cb-fleche cible44"${premier ? " hidden" : ""} data-monter-bloc="${b.id}" aria-label="Monter">
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 5 L15 13 L5 13 Z" fill="currentColor"/></svg>
          </button>
          <button type="button" class="cb-fleche cible44"${dernier ? " hidden" : ""} data-descendre-bloc="${b.id}" aria-label="Descendre">
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 15 L5 7 L15 7 Z" fill="currentColor"/></svg>
          </button>`}
          <button type="button" class="cb-crayon cible44" data-modifier-bloc="${b.id}" aria-label="Modifier ce bloc">✏️</button>
        </div>
      </div>
      ${b.titre ? `<h3 class="cb-titre">${txt(b.titre)}</h3>` : ""}
      ${rendu ? `<div class="cb-texte topo-rendu">${rendu}</div>` : `<p class="vide">Vide pour l'instant.</p>`}
    </div>`;
  }

  function carteResumeVide() {
    return `<button type="button" class="carte-bloc carte-bloc-invitante" data-nouveau-bloc="resume">
      <span class="cb-pastille">📖 Résumé</span>
      <p>Écrire le résumé</p>
    </button>`;
  }

  /** Le résumé (au plus un, en tête) séparé du reste : rendu par htmlResume(), la mosaïque par
   *  htmlMosaique() — ui-fiche-voyage.js les place dans deux zones différentes de la mise en page
   *  (le résumé toujours en tête de colonne principale, la mosaïque en bas de grille sur PC). */
  const resume = () => blocs().find((b) => b.type === "resume");
  const autres = () => blocs().filter((b) => b.type !== "resume");

  function htmlResume() {
    const r = resume();
    return `<div class="fiche-resume">${r ? carteBloc(r) : carteResumeVide()}</div>`;
  }

  function htmlMosaique() {
    const liste = [...autres()].sort((a, c) => a.ordre - c.ordre);
    return `<div class="fiche-blocs-mosaique">
      ${liste.map((b, i) => carteBloc(b, { premier: i === 0, dernier: i === liste.length - 1 })).join("")}
      <button type="button" class="carte-bloc carte-bloc-ajout" data-nouveau-bloc="info">+ Bloc</button>
    </div>`;
  }

  function rendre() {
    const zoneResume = $("#fiche-resume-corps");
    const zoneMosaique = $("#fiche-blocs-corps");
    if (zoneResume) zoneResume.innerHTML = htmlResume();
    if (zoneMosaique) zoneMosaique.innerHTML = htmlMosaique();
    brancher(zoneResume);
    brancher(zoneMosaique);
  }

  function brancher(racine) {
    if (!racine) return;
    for (const b of racine.querySelectorAll("[data-modifier-bloc]")) {
      b.addEventListener("click", () => formulaireBloc(blocs().find((x) => x.id === Number(b.dataset.modifierBloc))));
    }
    for (const b of racine.querySelectorAll("[data-nouveau-bloc]")) {
      b.addEventListener("click", () => formulaireBloc(null, b.dataset.nouveauBloc));
    }
    for (const b of racine.querySelectorAll("[data-monter-bloc]")) {
      b.addEventListener("click", () => deplacer(Number(b.dataset.monterBloc), -1));
    }
    for (const b of racine.querySelectorAll("[data-descendre-bloc]")) {
      b.addEventListener("click", () => deplacer(Number(b.dataset.descendreBloc), 1));
    }
  }

  /** Monte/descend un bloc dans la liste ORDONNÉE de sa catégorie (résumé seul dans la sienne,
   *  jamais mélangé aux autres — un seul résumé possible de toute façon). Optimiste avec rollback. */
  async function deplacer(id, sens) {
    const b = blocs().find((x) => x.id === id);
    if (!b) return;
    const memeGroupe = blocs().filter((x) => (x.type === "resume") === (b.type === "resume")).sort((a, c) => a.ordre - c.ordre);
    const i = memeGroupe.findIndex((x) => x.id === id);
    const voisin = memeGroupe[i + sens];
    if (!voisin) return;
    const [ordreA, ordreB] = [b.ordre, voisin.ordre];
    b.ordre = ordreB; voisin.ordre = ordreA;
    rendre();
    try { await api.echangerOrdreBlocs(b, voisin); }
    catch (e) { b.ordre = ordreA; voisin.ordre = ordreB; rendre(); cb.echec(e); }
  }

  function formulaireBloc(b, typeParDefaut = "info") {
    ouvrirFeuille(`<form class="pile" data-form-bloc>
      <h2>${b ? "Modifier le bloc" : "Nouveau bloc"}</h2>
      ${select("type", "Type", TYPES_BLOC.map((t) => [t.valeur, `${t.emoji} ${t.libelle}`]), b?.type ?? typeParDefaut)}
      ${champ("titre", "Titre (optionnel)", { valeur: b?.titre, placeholder: "ex. À savoir avant de partir" })}
      ${zone("texte", "Texte", b?.texte, { lignes: 10, placeholder: "## Titre\n- Un point\n- Un autre\n\nDu **gras** si besoin." })}
      <div class="detail-actions">
        ${b ? `<button type="button" class="btn-lien" data-retirer-bloc>Retirer</button>` : ""}
        <button type="submit" class="btn btn-bleu grandir">${b ? "Enregistrer" : "Ajouter"}</button>
      </div>
    </form>`, { onFermer: revenirALaFiche });
    const form = $("#feuille-corps [data-form-bloc]");
    form.querySelector("[data-retirer-bloc]")?.addEventListener("click", () => retirerBloc(b));
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const v = lire(form);
      const champs = { type: v.type, titre: v.titre, texte: v.texte ?? "" };
      try {
        if (b) await api.majBloc(b.id, champs);
        else await api.creerBloc({ ...champs, voyage_id: voyage().id, ordre: prochainOrdre(v.type), cree_par: etat.prenom });
        fermerFeuille(); // déclenche onFermer -> revenirALaFiche
        toast(b ? "Bloc enregistré." : "Bloc ajouté.");
      } catch (e) { cb.echec(e); }
    });
  }

  function prochainOrdre(type) {
    const memeGroupe = blocs().filter((x) => (x.type === "resume") === (type === "resume"));
    return memeGroupe.length ? Math.max(...memeGroupe.map((x) => x.ordre ?? 0)) + 1 : 0;
  }

  async function retirerBloc(b) {
    if (!(await confirmer(`Retirer ce bloc ${TYPES_BLOC.find((t) => t.valeur === b.type)?.libelle.toLowerCase() ?? ""} ?`, { ok: "Retirer" }))) return;
    try {
      await api.supprimerBloc(b.id);
      fermerFeuille(); // déclenche onFermer -> revenirALaFiche
      toast("Bloc retiré.");
    } catch (e) { cb.echec(e); }
  }

  return { rendre };
}
