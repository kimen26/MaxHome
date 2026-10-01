// Libellé à mettre sur le virement bancaire (référence à copier), D-050. Porté par le COMPTE
// destinataire (pas la charge ni le récurrent) : plusieurs charges peuvent partir vers le même
// compte avec le même libellé, et c'est le destinataire qui impose son format (code client fixe
// de la copropriété, ou « <Prénom NOM> Facture <numéro> » qui change chaque mois pour l'école).
// Pur, sans DOM : testé en node (tests/test_libelles.mjs), comme compte-charge.js.

/** Libellé effectif du mois pour un mouvement vers `compteVers` :
 *  - la surcharge du mois (mouvement.libelle_virement) si elle existe ;
 *  - sinon, si le compte n'est pas variable, son modèle (valeur fixe) ;
 *  - sinon (compte variable, mois pas encore saisi) : null — « à compléter ».
 *  `compteVers` peut être null (reste sur le commun, aucun libellé à afficher). */
export function libelleEffectif(mouvement, compteVers) {
  if (mouvement?.libelle_virement) return mouvement.libelle_virement;
  if (!compteVers) return null;
  return compteVers.libelle_variable ? null : (compteVers.libelle_virement ?? null);
}

/** Vrai si ce mouvement a besoin d'un libellé (compte variable) mais ne l'a pas encore pour ce
 *  mois — c'est ce qui déclenche « Libellé à compléter ce mois » à l'écran et dans le bot. */
export function libelleACompleter(mouvement, compteVers) {
  if (mouvement?.libelle_virement) return false;
  return Boolean(compteVers?.libelle_variable);
}

/** Modèle à proposer comme placeholder/pré-remplissage du champ de saisie du mois, pour un
 *  compte variable sans valeur encore saisie. `null` si rien à proposer. */
export const modeleLibelle = (compteVers) => compteVers?.libelle_variable ? (compteVers.libelle_virement ?? null) : null;
