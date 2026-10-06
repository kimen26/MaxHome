// Réserve relais (D-054, 027_reserve_relais.sql) : une charge mise de côté chaque mois sur un
// compte tampon, payée à son rythme (relais_tous_les mois) vers le compte final relais_vers.
// L'étape 1 (mise de côté) est déjà la ligne de charge habituelle, comptée dans calc.js — rien
// ne change là. L'étape 2 (paiement) n'est JAMAIS une dépense, jamais lue par calc.js : un
// simple déplacement tampon -> relais_vers, dont ce module calcule seulement le mois et le
// montant. Pur, sans DOM : testé en node (tests/test_reserve.mjs).

/** Un récurrent a une réserve dès que `relais_vers` est posé (NULL = comportement actuel,
 *  sans réserve). */
export const aReserve = (recurrent) => recurrent?.relais_vers != null;

/** Vrai si `mois` (1-12) est un mois de paiement du cycle, selon `relais_depart` (1-12) et
 *  `relais_tous_les` (1, 2, 3, 6 ou 12). Sans `relais_depart` connu, aucun mois n'est un mois
 *  de paiement (il faut d'abord le choisir dans la feuille de réglage du récurrent). */
export function estMoisPaiement(recurrent, mois) {
  if (!aReserve(recurrent) || recurrent.relais_depart == null) return false;
  return ((mois - recurrent.relais_depart) % recurrent.relais_tous_les + recurrent.relais_tous_les)
    % recurrent.relais_tous_les === 0;
}

/**
 * Montant accumulé sur le tampon depuis le dernier paiement, ce mois inclus : somme des valeurs
 * ABSOLUES des lignes de la charge sur les `relais_tous_les` mois se terminant par `anneeMois`
 * (année/mois courants). Un mois sans ligne saisie vaut 0 (pas d'hypothèse sur un montant qui
 * n'existe pas encore). `ligneDuMois(annee, mois)` : fonction fournie par l'appelant qui rend
 * le montant en centimes (positif ou négatif, peu importe — on prend sa valeur absolue) de la
 * ligne de la charge pour un mois donné du passé, ou `null`/`undefined` si elle n'existe pas.
 * @returns centimes (entier, toujours ≥ 0).
 */
export function montantCumule(recurrent, { annee, mois }, ligneDuMois) {
  const n = recurrent.relais_tous_les;
  let total = 0;
  for (let i = 0; i < n; i++) {
    let m = mois - i;
    let a = annee;
    while (m < 1) { m += 12; a -= 1; }
    const montant = ligneDuMois(a, m);
    if (montant) total += Math.abs(montant);
  }
  return total;
}

/** Montant du cycle complet estimé (Y du brief) : part théorique du mois × tous_les — une
 *  estimation à montant constant, affichée tant que le cycle n'est pas achevé. `montantMoisCentimes`
 *  : montant (positif ou négatif) de la ligne du mois courant, ou 0 si pas encore saisie. */
export const montantCycleEstime = (recurrent, montantMoisCentimes) =>
  Math.abs(montantMoisCentimes ?? 0) * recurrent.relais_tous_les;

/** Prochain mois de paiement (1-12) après `mois`, pour l'annonce « payé en <mois> » d'un mois
 *  sans paiement. Boucle sur l'année suivante si besoin. `null` sans `relais_depart` connu. */
export function prochainMoisPaiement(recurrent, mois) {
  if (!aReserve(recurrent) || recurrent.relais_depart == null) return null;
  for (let i = 1; i <= 12; i++) {
    const m = ((mois - 1 + i) % 12) + 1;
    if (estMoisPaiement(recurrent, m)) return m;
  }
  return null;
}
