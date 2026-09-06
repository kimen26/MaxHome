// Bloc de COMPORTEMENT : un écran de réglages CRUD — liste avec Modifier / Retirer, bouton
// « + Nouveau », formulaire en feuille. Le module fournit le HTML de la liste et du formulaire,
// la lecture des champs et les appels API ; le bloc porte le cycle ouvrir → soumettre →
// écrire → fermer → rendre → toast → rafraîchir, et la confirmation de retrait.

import { $, txt, ouvrirFeuille, fermerFeuille, toast, confirmer } from "./ui-base.js";
import { brancherReglages } from "./blocs.js";

/**
 * @param liste          "#liste-recurrents" : conteneur de la liste
 * @param bouton         "#form-recurrent" : conteneur du bouton « + Nouveau »
 * @param libelleNouveau "+ Nouveau mouvement récurrent"
 * @param elements       () => éléments à lister, depuis l'état (chacun porte un `id`)
 * @param htmlListe      (elements) => HTML de la liste (carteListe + ligneReglage, ou cartes maison)
 * @param titreForm      (el|null) => titre de la feuille
 * @param htmlForm       (el|null) => corps du formulaire (sans <form> ni bouton de validation)
 * @param apresOuverture (form, el) => void, optionnel (visibilité conditionnelle…)
 * @param champs         (form, el) => colonnes à écrire ; peut lever (montant invalide)
 * @param api            { creer(valeurs) : crée ET pose dans l'état ; maj(id, valeurs) ;
 *                         retirer(el) : retire ET met l'état à jour }
 * @param apresEcriture  () => Promise, optionnel (rafraîchir un autre écran)
 * @param confirmerRetrait (el) => texte de confirmation
 * @param messageRetrait  "Mouvement retiré."
 * @param echec          (e) => void
 */
export function creerReglages({ liste, bouton, libelleNouveau, elements, htmlListe, titreForm, htmlForm,
  apresOuverture, champs, api, apresEcriture, confirmerRetrait, messageRetrait, echec }) {
  function rendre() {
    $(liste).innerHTML = htmlListe(elements());
    $(bouton).innerHTML = `<button class="btn btn-tirets" data-nouveau>${txt(libelleNouveau)}</button>`;
    $(bouton).querySelector("[data-nouveau]").addEventListener("click", () => formulaire(null));
    brancherReglages($(liste), (id) => formulaire(elements().find((e) => e.id === id) ?? null), retirer);
  }

  function formulaire(el) {
    ouvrirFeuille(`<form class="pile" data-reglages-form>
      <h2>${txt(titreForm(el))}</h2>
      ${htmlForm(el)}
      <button type="submit" class="btn btn-bleu grandir">${el ? "Enregistrer" : "Ajouter"}</button>
    </form>`);
    const form = $("#feuille-corps [data-reglages-form]");
    apresOuverture?.(form, el);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      let valeurs;
      try { valeurs = champs(form, el); } catch (e) { return echec(e); }
      try {
        if (el) {
          await api.maj(el.id, valeurs);
          Object.assign(el, valeurs);
        } else {
          await api.creer(valeurs);
        }
        fermerFeuille();
        rendre();
        toast("Enregistré.");
        await apresEcriture?.();
      } catch (e) { echec(e); }
    });
  }

  async function retirer(id) {
    const el = elements().find((e) => e.id === id);
    if (!el || !(await confirmer(confirmerRetrait(el), { ok: "Retirer" }))) return;
    try {
      await api.retirer(el);
      rendre();
      toast(messageRetrait);
      await apresEcriture?.();
    } catch (e) { echec(e); }
  }

  return { rendre, formulaire };
}
