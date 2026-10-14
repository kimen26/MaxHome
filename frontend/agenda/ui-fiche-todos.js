// Onglet « À faire » de la fiche voyage V3 : liste cochable (`fait_le`, `fait_par` = membre connecté),
// ajout d'une ligne (texte, détail, lien), suppression ; faites en bas, barrées. Patron du socle :
// case = `caseACocher` branchée par `brancherCoches`, écriture = `ecrireOptimiste`, champs =
// `blocs-form` — aucun cycle optimiste réécrit ici (invariant 6).

import { $, txt, toast, confirmer } from "../socle/ui-base.js";
import { caseACocher, brancherCoches, creerFileEcritures } from "../socle/blocs.js";
import { ecrireOptimiste } from "../socle/blocs-optimiste.js";
import { champ, zone, lire } from "../socle/blocs-form.js";
import { lienSur } from "./fiche-statuts.js";

const parOrdre = (a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.id - b.id;
export const nbAFaire = (todos) => todos.filter((t) => !t.fait_le).length;

function ligne(t) {
  const lien = lienSur(t.lien);
  return `<li class="fv-todo${t.fait_le ? " fait" : ""}" data-todo="${t.id}">
    ${caseACocher({ id: t.id, cochee: !!t.fait_le, titre: t.texte })}
    <div class="fv-todo-c">
      <span class="fv-todo-t">${txt(t.texte)}</span>
      ${t.detail ? `<span class="fv-item-d">${txt(t.detail)}</span>` : ""}
      ${lien ? `<a class="fv-todo-lien" href="${lien}" target="_blank" rel="noopener">Ouvrir le lien ↗</a>` : ""}
      ${t.fait_le && t.fait_par ? `<span class="fv-item-d">Fait par ${txt(t.fait_par)}</span>` : ""}
    </div>
    <button type="button" class="fv-todo-suppr" data-supprimer-todo="${t.id}" aria-label="Supprimer : ${txt(t.texte)}">✕</button>
  </li>`;
}

export function creerFicheTodos(api, etat, cb, { voyage, todos, rendreTout, revenirALaFiche }) {
  const file = creerFileEcritures();

  function html() {
    const aFaire = todos().filter((t) => !t.fait_le).sort(parOrdre);
    const faites = todos().filter((t) => t.fait_le).sort(parOrdre);
    return `<div class="fv-todos">
      ${aFaire.length ? `<ul class="fv-todo-liste">${aFaire.map(ligne).join("")}</ul>` : `<p class="vide">Rien à faire pour l'instant.</p>`}
      ${faites.length ? `<h3 class="fv-groupe-t">Faites (${faites.length})</h3><ul class="fv-todo-liste">${faites.map(ligne).join("")}</ul>` : ""}
      <form class="fv-todo-form pile" data-form-todo>
        <h3 class="fv-groupe-t">Ajouter une ligne</h3>
        ${champ("texte", "À faire", { requis: true, placeholder: "ex. Réserver le pass" })}
        ${zone("detail", "Détail (optionnel)", "", { lignes: 2 })}
        ${champ("lien", "Lien (optionnel)", { type: "url", placeholder: "https://…" })}
        <button type="submit" class="btn btn-bleu">Ajouter</button>
      </form>
    </div>`;
  }

  function rendre() {
    const racine = $("#fiche-todos-corps");
    if (!racine) return;
    racine.innerHTML = html();
    brancherCoches(racine, cocher);
    for (const b of racine.querySelectorAll("[data-supprimer-todo]")) {
      b.addEventListener("click", () => supprimer(Number(b.dataset.supprimerTodo)));
    }
    racine.querySelector("[data-form-todo]").addEventListener("submit", ajouter);
  }

  function cocher(id) {
    const t = todos().find((x) => x.id === id);
    if (!t) return;
    const fait = !t.fait_le;
    return ecrireOptimiste({
      el: t, champs: { fait_le: fait ? new Date().toISOString() : null, fait_par: fait ? etat.prenom : null },
      ecrire: api.majTodo, rendre: rendreTout, file, echec: cb.echec,
      message: fait ? "Fait." : "Remis à faire.",
    });
  }

  async function ajouter(ev) {
    ev.preventDefault();
    const v = lire(ev.target);
    if (!v.texte) { toast("Écris ce qu'il y a à faire."); return; }
    if (v.lien && !lienSur(v.lien)) { toast("Le lien doit commencer par http:// ou https://."); return; }
    const ordre = todos().reduce((m, t) => Math.max(m, t.ordre ?? 0), 0) + 1;
    try {
      const cree = await api.creerTodo({ voyage_id: voyage().id, texte: v.texte, detail: v.detail, lien: v.lien, ordre, cree_par: etat.prenom });
      todos().push(cree);
      rendreTout();
      toast("Ajouté.");
    } catch (e) { cb.echec(e); }
  }

  /** `confirmer` remplace le contenu de la feuille unique (celle de la fiche) : on rouvre donc la
   *  fiche sur l'onglet quoi qu'il arrive (revenirALaFiche recharge aussi les données). */
  async function supprimer(id) {
    const t = todos().find((x) => x.id === id);
    if (!t) return;
    if (await confirmer(`Supprimer « ${t.texte} » ?`, { ok: "Supprimer" })) {
      try {
        await api.supprimerTodo(id);
        toast("Supprimé.");
      } catch (e) { cb.echec(e); }
    }
    await revenirALaFiche();
  }

  return { rendre };
}
