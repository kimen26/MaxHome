// Bloc partagé du geste « tap = valeur suivante » (bouton-cycle) : parts, obligatoire,
// à deux, fois par période, minutes indicatives, écart, coche tri-état. Sept écrans du
// handoff réutilisent ce même geste — une seule copie du cycle, comme brancherCoches
// porte l'unique copie de la case à cocher (blocs.js).

import { txt } from "./ui-base.js";

/**
 * Rend un bouton-cycle. Ne branche rien (cf. brancherCycles).
 * @param cle     identifiant métier de l'élément cyclé (id de la tâche récurrente, etc.)
 * @param valeurs liste des valeurs du cycle, dans l'ordre ; peut contenir `null`
 * @param valeur  valeur courante
 * @param rendu   (valeur) => string (libellé seul) ou { libelle, classe } (libellé + classe CSS)
 * @param classe  classes additionnelles, toujours appliquées
 * @param taille  "reglage" (30 px, deux mains, réglages) ou "jour" (44 px, écran Jour) — défaut "jour"
 */
export function boutonCycle({ cle, valeurs, valeur, rendu, classe = "", taille = "jour" }) {
  const suivant = suivante(valeurs, valeur);
  const r = rendu(valeur);
  const { libelle, classe: classeValeur = "" } = typeof r === "string" ? { libelle: r } : r;
  const rSuivant = rendu(suivant);
  const libelleSuivant = typeof rSuivant === "string" ? rSuivant : rSuivant.libelle;
  const aria = `${libelle}. Tap pour passer à ${libelleSuivant}`;
  const classes = ["cycle", `cycle-${taille}`, classeValeur, classe].filter(Boolean).join(" ");
  return `<button type="button" class="${classes}" data-cycle="${txt(cle)}" aria-label="${txt(aria)}">${txt(libelle)}</button>`;
}

/** Branche tous les [data-cycle] d'une racine : clic et clavier (Espace/Entrée). */
export function brancherCycles(racine, surChangement) {
  for (const el of racine.querySelectorAll("[data-cycle]")) {
    const agir = (e) => { e.stopPropagation(); surChangement(el.dataset.cycle); };
    el.addEventListener("click", agir);
    el.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); agir(e); } });
  }
}

/**
 * Valeur suivante dans une liste, en boucle. `null` est une valeur légitime du cycle
 * (l'écart : null → Claudia → Yann → null). Une valeur absente de la liste retombe sur
 * la première : on ne bloque jamais l'affichage sur une valeur qui n'existe plus.
 */
export const suivante = (valeurs, valeur) => {
  const i = valeurs.indexOf(valeur);
  return valeurs[i === -1 ? 0 : (i + 1) % valeurs.length];
};
