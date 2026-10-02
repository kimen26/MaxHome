// Regroupement par CATÉGORIE des éléments à faire/fait de l'écran Mois (lignes de charge +
// mouvements), pour la vue « Catégories » de la liste unifiée (ui-mois-liste.js). Miroir de
// groupes-virements.js (qui regroupe par TRAJET) : même notion d'élément `{ type, id, libelle,
// montant_centimes, valeur }`, juste une autre clé. Pur, sans DOM, testé en node.
//
// Une ligne de charge entre avec la catégorie de sa charge ; un mouvement (virement au commun,
// récurrent "part"/"fixe", ponctuel) n'a pas de catégorie propre : il rejoint le groupe
// `CLE_VIREMENTS` toujours affiché en tête, avant les catégories de charges.

import { montantLigne, montantTheorique } from "./calc.js";
import { valeurCourante } from "./coche-ligne.js";

/** Clé du groupe des mouvements (hors ligne de charge) — jamais une catégorie réelle. */
export const CLE_VIREMENTS = "__virements__";
export const LIBELLE_VIREMENTS = "Virements";

/**
 * @param charges   charges AFFICHÉES du mois (même filtre que `affichees()` de
 *                  ui-mois-charges.js : actives + terminées avec une ligne ce mois).
 * @param lignes    etat.lignes
 * @param mouvements etat.mouvements
 * @param recurrents etat.recurrents
 * @returns [{ cle, libelle, elements }] — `elements`: [{ type, id, libelle, montant_centimes, valeur }]
 *   `cle === CLE_VIREMENTS` en tête, puis les catégories dans l'ordre de première apparition.
 */
export function construireGroupesCategories(charges, lignes, mouvements, recurrents) {
  const groupes = new Map();
  const groupe = (cle, libelle) => {
    if (!groupes.has(cle)) groupes.set(cle, { cle, libelle, elements: [] });
    return groupes.get(cle);
  };

  const recurrentDe = (m) => recurrents.find((r) => r.id === m.recurrent_id);
  const modeCharge = (m) => recurrentDe(m)?.mode === "charge";
  const virements = groupe(CLE_VIREMENTS, LIBELLE_VIREMENTS);
  for (const m of mouvements) {
    if (modeCharge(m)) continue; // déjà représenté par sa ligne de charge, ci-dessous.
    virements.elements.push({
      type: "mouvement", id: m.id, libelle: m.titre,
      montant_centimes: m.fait_le ? m.montant_centimes : (montantTheorique(recurrentDe(m), { lignes, resultat: { aVerser: {} } }) ?? m.montant_centimes),
      valeur: valeurCourante(m), fait_le: m.fait_le ?? null, fait_par: m.fait_par ?? null,
    });
  }

  for (const c of charges) {
    const l = lignes[c.id];
    groupe(c.categorie, c.categorie).elements.push({
      type: "ligne", id: c.id, libelle: c.libelle,
      montant_centimes: montantLigne(l), valeur: valeurCourante(l), saisi: l !== undefined,
      fait_le: l?.fait_le ?? null, fait_par: l?.fait_par ?? null,
    });
  }

  return [...groupes.values()].filter((g) => g.elements.length > 0);
}

/** Éléments non faits / faits d'un groupe — même notion que lignesAFaire/lignesFaites de
 *  groupes-virements.js, ici au niveau élément plutôt que groupe entier (une catégorie reste
 *  affichée tant qu'il y a au moins un élément de chaque côté). */
export const elementsAFaire = (g) => g.elements.filter((e) => e.valeur === null);
export const elementsFaits = (g) => g.elements.filter((e) => e.valeur !== null);
