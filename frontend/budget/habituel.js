// Montant HABITUEL d'une charge : ce que le mois propose quand rien n'est encore saisi, et ce
// que « Remplir avec les montants habituels » écrit d'un coup (D-040). Deux façons, choisies
// par charge dans sa feuille de réglage :
//   - « Toujours le même » (defaut_dernier = false) : le montant noté dans la charge
//     (montant_defaut) — crédit, assurance, abonnement ;
//   - « Change chaque mois » (defaut_dernier = true) : le dernier montant saisi, tous mois
//     confondus — électricité, courses, impôts.
// Avant D-040, `defaut_dernier` n'était lu par aucun code appelé : le réglage n'avait aucun effet.

import { euros, versCentimes } from "./calc.js";

export const FIXE = "fixe";
export const VARIABLE = "variable";

export const faconDe = (c) => (c.defaut_dernier ? VARIABLE : FIXE);

/** Montant proposé pour un mois sans saisie, ou null s'il n'y a rien à proposer. */
export function montantHabituel(c, derniers) {
  if (!c.defaut_dernier) return c.montant_defaut ?? null;
  return derniers[c.id] ?? c.montant_defaut ?? null;
}

/** Montant NOTÉ (« Toujours le même »), ou null quand on reprend le dernier. */
export const montantNote = (c) => (c.defaut_dernier ? null : c.montant_defaut ?? null);

/** Champs à écrire pour un montant tapé dans la rangée de Réglages · Charges (D-042) : un
 *  montant = « Toujours le même » ; champ vidé = « Change chaque mois » (le montant noté reste
 *  en base, repli tant qu'il n'y a pas de dernier). Même convention de signe que l'écran Mois
 *  et la feuille : on écrit ce qui est tapé, une charge se tape en négatif. Lève si illisible. */
export function champsDuMontant(saisie) {
  const s = String(saisie ?? "").trim();
  return s ? { montant_defaut: versCentimes(s), defaut_dernier: false } : { defaut_dernier: true };
}

/** La saisie ne change rien à la charge : pas d'écriture. */
export const montantInchange = (c, champs) => (champs.defaut_dernier
  ? !!c.defaut_dernier
  : !c.defaut_dernier && c.montant_defaut === champs.montant_defaut);

/** Options d'un `choixDetaille` (socle/blocs.js) : la façon dont le montant revient chaque mois. */
export function optionsFacon(c, derniers) {
  const dernier = derniers[c.id];
  return [
    { valeur: FIXE, titre: "Toujours le même", detail: "noté ci-dessous" },
    { valeur: VARIABLE, titre: "Change chaque mois",
      detail: dernier != null ? `reprend le dernier : ${euros(dernier)}` : "reprend le dernier saisi" },
  ];
}
