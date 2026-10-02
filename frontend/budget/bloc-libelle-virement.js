// Bloc d'affichage + comportement du libellé de virement (D-050), partagé entre un groupe
// déplié de la liste unifiée (ui-mois-liste.js) et le détail d'un mouvement seul
// (ui-mouvements.js) — D-024 :
// un écran assemble, il n'écrit pas deux fois le même HTML ni le même cycle d'écriture. La règle
// (quelle valeur, à compléter ou non) reste pure dans libelle-virement.js, testée sans DOM.

import { txt, toast, copier, $ } from "../socle/ui-base.js";
import { libelleEffectif, libelleACompleter, modeleLibelle } from "./libelle-virement.js";

/** HTML du bloc, dans une feuille de détail : valeur à copier, champ « à compléter » si le
 *  compte est variable et le mois pas encore saisi, ou rien si le compte n'a pas de libellé. */
export function htmlBlocLibelle(mouvement, compteVers) {
  const valeur = libelleEffectif(mouvement, compteVers);
  if (valeur) {
    return `<div class="gv-libelle">
      <span class="etiquette">Libellé</span> <span class="mono">${txt(valeur)}</span>
      <button class="btn-lien" data-copier-libelle-mvt="${txt(valeur)}">Copier</button>
    </div>`;
  }
  if (libelleACompleter(mouvement, compteVers)) {
    if (!mouvement) return ""; // pas de mouvement du mois : rien à surcharger encore.
    const modele = modeleLibelle(compteVers) ?? "";
    return `<div class="gv-libelle gv-libelle-manquant">
      <p class="mvt-note">Libellé à compléter ce mois</p>
      <input class="champ" data-libelle-mois="${mouvement.id}" value="${txt(modele)}" placeholder="ex. Prénom Nom Facture n°12">
      <button class="btn btn-bleu" data-valider-libelle="${mouvement.id}">Enregistrer</button>
    </div>`;
  }
  return "";
}

/** Branche le bouton Copier et l'enregistrement du champ « à compléter », dans `racine` (le
 *  conteneur qui vient de recevoir htmlBlocLibelle). Écrit sur `etat.mouvements` (pas seulement
 *  l'objet local) pour que le reste de l'écran (groupes, détail) reste cohérent après coup.
 *  `apresEnregistrement` redessine l'appelant (ex. rouvrir le détail) avec la nouvelle valeur. */
export function brancherBlocLibelle(racine, api, etat, cb, apresEnregistrement) {
  racine.querySelector("[data-copier-libelle-mvt]")?.addEventListener("click",
    (e) => copier(e.currentTarget.dataset.copierLibelleMvt));
  racine.querySelector("[data-valider-libelle]")?.addEventListener("click", async (e) => {
    const mouvementId = Number(e.currentTarget.dataset.validerLibelle);
    const input = racine.querySelector(`[data-libelle-mois="${mouvementId}"]`);
    const valeur = input.value.trim();
    if (!valeur) { toast("Saisis le libellé du mois."); return; }
    try {
      await api.majMouvement(mouvementId, { libelle_virement: valeur });
      const m = etat.mouvements.find((x) => x.id === mouvementId);
      if (m) m.libelle_virement = valeur;
      toast("Enregistré.");
      apresEnregistrement();
    } catch (err) { cb.echec(err); }
  });
}
