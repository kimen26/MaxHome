// Bloc de COMPORTEMENT : une check-list avec panneau de détail (aside sur PC, feuille sur
// mobile). Le module fournit les données et le HTML ; le bloc porte l'unique copie du cycle
// figer → fermer la feuille → rendre → rouvrir sur PC → écrire → toast → rollback.

import { $, estPC, feuilleOuverte, fermerFeuille, toast } from "./ui-base.js";
import { brancherCoches, marquerChoisi, ouvrirPanneau, fermerPanneau, creerFileEcritures } from "./blocs.js";

/**
 * @param ecran        "#ecran-mois" : racine DOM de l'écran
 * @param aside        "#detail-pc" : colonne de détail PC
 * @param trouver      (id) => élément métier depuis l'état
 * @param premier      () => élément à ouvrir d'office sur PC quand rien n'est ouvert
 * @param htmlDetail   (el) => HTML du panneau (le module l'écrit avec enteteDetail)
 * @param brancherDetail (el, racine, { basculer, fermer }) => listeners spécifiques du module
 * @param basculer     { figer, appliquer, ecrire, message, apres } — voir basculer() ci-dessous
 * @param rendre       () => rendu de l'écran, fourni par le module
 * @param echec        (e) => void
 */
export function creerCheckList({ ecran, aside, trouver, premier, htmlDetail, brancherDetail, basculer: regles, rendre, echec }) {
  // Élément dont le détail va être réaffiché juste après un rendu : évite d'ouvrir le premier par défaut.
  let detailEnCours = null;
  const enFile = creerFileEcritures();

  function ouvrirDetail(id) {
    const el = trouver(id);
    if (!el) return;
    const racine = ouvrirPanneau(aside, htmlDetail(el));
    racine.querySelector("[data-fermer-detail]")?.addEventListener("click", fermerDetail);
    racine.querySelector("[data-basculer]")?.addEventListener("click", () => basculer(id));
    brancherDetail?.(el, racine, { basculer: (options) => basculer(id, options), fermer: fermerDetail });
    if (estPC()) marquerChoisi($(ecran), id);
  }

  const fermerDetail = () => fermerPanneau(aside);

  /**
   * Coche ou décoche. `figer(el)` est lu AVANT toute mutation (L-008) ; `appliquer(el, figee, options)`
   * mute l'élément et renvoie les champs à écrire ; `ecrire(id, champs)` est l'appel API ;
   * `message(el, avant)` le toast ; `apres()` un crochet optionnel.
   */
  async function basculer(id, options = {}) {
    const el = trouver(id);
    if (!el) return;
    const figee = regles.figer(el);
    const instantane = { ...el };
    const champs = regles.appliquer(el, figee, options);
    const avant = Object.fromEntries(Object.keys(champs).map((k) => [k, instantane[k]]));
    // Sur mobile la feuille se referme ; sur PC le panneau reste sur l'élément basculé.
    if (feuilleOuverte()) fermerFeuille();
    detailEnCours = estPC() ? id : null;
    rendre();
    if (estPC()) ouvrirDetail(id);
    detailEnCours = null;
    try {
      await enFile(id, () => regles.ecrire(id, champs));
      toast(regles.message(el, avant));
      regles.apres?.();
    } catch (e) {
      Object.assign(el, avant);
      rendre();
      if (estPC()) ouvrirDetail(id);
      echec(e);
    }
  }

  /** À appeler en fin de rendre() : branche les cases, ouvre le premier sur PC, surligne l'ouvert. */
  function apresRendu() {
    const racine = $(ecran);
    brancherCoches(racine, (id) => basculer(id), ouvrirDetail);
    if (estPC() && $(aside).hidden && !detailEnCours) {
      const p = premier();
      if (p) ouvrirDetail(p.id);
    }
    if (estPC()) marquerChoisi(racine, Number($(aside).querySelector(".detail")?.dataset.id));
  }

  return { ouvrirDetail, fermerDetail, basculer, apresRendu };
}
