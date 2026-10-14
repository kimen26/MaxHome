// Bloc de COMPORTEMENT : écriture optimiste d'un ou plusieurs champs d'un élément déjà en
// mémoire. L'unique copie du cycle appliquer → rendre → écrire → toast → retour arrière + erreur,
// pour les écrans qui ne passent pas par `creerCheckList` (panneau de détail) — ex. la fiche
// voyage, dont les lignes se modifient en place dans une feuille déjà ouverte.

import { toast } from "./ui-base.js";

/**
 * @param el       élément en mémoire (muté en place, restauré si l'écriture échoue)
 * @param champs   { champ: nouvelleValeur } appliqués tout de suite
 * @param ecrire   (id, champs) => Promise — l'appel API
 * @param rendre   () => void — re-rendu de l'écran (avant l'écriture, puis après un retour arrière)
 * @param message  texte du toast de succès (aucun toast si absent)
 * @param echec    (erreur) => void — affichage de l'erreur, jamais avalée
 * @param file     file de `creerFileEcritures()` (écritures d'un même élément dans l'ordre), optionnelle
 */
export async function ecrireOptimiste({ el, champs, ecrire, rendre, message = null, echec, file = null }) {
  const avant = Object.fromEntries(Object.keys(champs).map((k) => [k, el[k]]));
  Object.assign(el, champs);
  rendre();
  try {
    await (file ? file(el.id, () => ecrire(el.id, champs)) : ecrire(el.id, champs));
    if (message) toast(message);
  } catch (e) {
    Object.assign(el, avant);
    rendre();
    echec(e);
  }
}
