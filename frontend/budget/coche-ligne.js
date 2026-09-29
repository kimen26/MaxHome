// Cycle de validation d'UNE ligne de charge (D-048, Yann 2026-09-30 : « si je clique 2 fois, ça
// met l'action pour l'autre, comme les tâches ») — partagé par ui-mois-charges.js (charges par
// catégorie), ui-extras.js (« Ce mois seulement ») et ui-mouvements.js (mouvements, groupes de
// virement D-048 §3). Une charge envoyée vers un autre compte (mode "charge" d'un récurrent,
// compte-charge.js) a SON mouvement du mois : le cycle de la ligne bascule ce mouvement pareil,
// montant figé à LA PREMIÈRE coche (jamais à chaque changement de personne) — même geste que
// `basculer.appliquer` de ui-mouvements.js.
// Cycle optimiste/rollback (D-024) : `preparerBascule` mute l'état AVANT tout appel réseau
// (l'appelant rend l'écran juste après), `ecrireBascule` fait l'écriture ; en cas d'échec
// l'appelant restaure `avant` lui-même — pas de logique HTML ni de rollback ici, seulement
// le calcul, comme calc.js.

import { montantTheorique } from "./calc.js";
import { suivante } from "../socle/blocs-cycle.js";

/** Marqueur « coché, mais sans prénom connu » (D-048, Yann 2026-09-30 : coches d'avant la
 *  migration D-048, ou posées par le bot — `fait_le` posé, `fait_par` null). Un `Symbol`,
 *  jamais une chaîne : ne peut jamais coïncider avec un vrai prénom, et n'est JAMAIS écrit en
 *  base (voir `champsCycle` — sa valeur d'écriture reste toujours `null` pour `fait_par`).
 *  Affichage : case cochée pleine (« ✓ », fond vert), comme l'ancienne case binaire — jamais
 *  une case vide, qui mentirait sur l'état réel de la ligne. */
export const SANS_PRENOM = Symbol("sans-prenom");

/** Valeurs du cycle d'une ligne (D-048) : rien → premier membre → second → rien. Pas de
 *  « à deux » (une charge ou un virement se valide par UNE personne, pas les deux ensemble).
 *  `SANS_PRENOM` n'y figure jamais : ce n'est pas une étape du cycle, c'est un état de DÉPART
 *  hérité (voir `prochaineValeur`) qui rejoint le cycle normal dès le premier tap. */
export const valeursCycleLigne = (etat) => [null, ...etat.membres.map((m) => m.prenom)];

/** Valeur courante d'une ligne, dérivée de `fait_le`/`fait_par` — jamais recalculée à part :
 *  - pas cochée (`fait_le` null) → `null` (rien) ;
 *  - cochée avec un prénom → ce prénom ;
 *  - cochée SANS prénom (coche d'avant D-048, ou posée par le bot) → `SANS_PRENOM` — jamais
 *    `null`, sinon la case s'affiche vide alors que la ligne EST validée (L-042). */
export const valeurCourante = (ligne) => {
  if (!ligne?.fait_le) return null;
  return ligne.fait_par ?? SANS_PRENOM;
};

/** Convertit une valeur de `valeurCourante` pour `caseCycle` (socle/blocs.js, générique) :
 *  `SANS_PRENOM` → `true` (case pleine « ✓ », socle agnostique des Symbols du Budget), tout le
 *  reste inchangé. À appeler à l'assemblage du HTML, jamais avant (le cycle logique travaille
 *  sur `SANS_PRENOM`, seul l'affichage a besoin de `true`). */
export const valeurAffichee = (valeur) => (valeur === SANS_PRENOM ? true : valeur);

/** Valeur suivante du cycle depuis `courant` (D-048) : depuis `SANS_PRENOM`, avance vers le
 *  PREMIER membre — comme depuis `null`, jamais un index dans `valeursCycleLigne` (où
 *  `SANS_PRENOM` n'existe pas). Ailleurs, cycle normal. */
export const prochaineValeur = (valeurs, courant) =>
  suivante(valeurs, courant === SANS_PRENOM ? null : courant);

/** Champs à écrire sur `lignes` pour une valeur du cycle : `fait_le` posé à la PREMIÈRE coche
 *  (valeur courante null OU `SANS_PRENOM`, D-048) et gardé au changement de personne, remis à
 *  null au retour à rien — pur. `fait_par` s'écrit toujours tel quel (jamais `SANS_PRENOM`, qui
 *  ne doit jamais atteindre la base). `dateCible` (optionnel, D-048 §3) : impose la date au
 *  lieu de `new Date()` — un groupe de virements pose LA MÊME date sur toutes ses lignes en un
 *  seul tap, pas une par ligne (des appels successifs à `new Date()` divergeraient de quelques
 *  millisecondes). */
export const champsCycle = (valeurCourante, valeurSuivante, faitLeCourant, dateCible) => ({
  fait_le: valeurSuivante === null ? null : (faitLeCourant ?? dateCible ?? new Date().toISOString()),
  fait_par: valeurSuivante,
});

/** Récurrent en mode "charge" pour `chargeId`, et son mouvement du mois s'il existe — pur. */
const recurrentDeCharge = (etat, chargeId) =>
  etat.recurrents.find((r) => r.actif && r.mode === "charge" && r.charge_id === chargeId) ?? null;
const mouvementDe = (etat, recurrentId) => etat.mouvements.find((m) => m.recurrent_id === recurrentId) ?? null;

/** Champs à écrire sur le mouvement lié quand sa ligne avance dans le cycle : montant figé
 *  UNE SEULE FOIS, au passage rien → quelqu'un (première coche), gardé tel quel au changement
 *  de personne — jamais recalculé à chaque tap. Remis à null au retour à rien. `null` si aucun
 *  mouvement lié n'existe (rien à faire côté mouvements). Pur. */
export function champsMouvementLie(etat, chargeId, champsLigne, premiereCoche) {
  const recurrent = recurrentDeCharge(etat, chargeId);
  if (!recurrent) return null;
  const mouvement = mouvementDe(etat, recurrent.id);
  if (!mouvement) return null;
  if (!champsLigne.fait_le) return { id: mouvement.id, champs: { fait_le: null, fait_par: null } };
  const champs = { fait_le: champsLigne.fait_le, fait_par: champsLigne.fait_par };
  if (premiereCoche) champs.montant_centimes = montantTheorique(recurrent, etat) ?? mouvement.montant_centimes;
  return { id: mouvement.id, champs };
}

/**
 * Calcule ce qu'il faut écrire pour avancer `chargeId` d'un cran dans le cycle (rien → moi →
 * l'autre → rien), sans rien muter ni écrire — refuse (ok:false) si la charge n'a pas de ligne
 * ce mois (pas de montant saisi, règle 3 du brief D-046).
 * `valeurCible` (optionnel, D-048 §3) : impose la valeur suivante au lieu de la calculer par
 * `suivante()`. `dateCible` (idem) : impose la date de la première coche — un groupe de
 * virements pose LA MÊME personne et LA MÊME date sur toutes ses lignes non faites en un seul
 * tap, pas un cycle indépendant par ligne.
 * @returns { ok:false, message } ou { ok:true, message, champsLigne, mouvementLie }
 */
export function preparerBascule(etat, chargeId, valeurCible, dateCible) {
  const avant = etat.lignes[chargeId];
  if (avant === undefined) {
    const charge = etat.charges.find((c) => c.id === chargeId);
    return { ok: false, message: `Saisis d'abord le montant de ${charge?.libelle ?? "cette charge"}.` };
  }
  const courant = valeurCourante(avant);
  const suivant = valeurCible !== undefined ? valeurCible : prochaineValeur(valeursCycleLigne(etat), courant);
  // Première coche = la ligne n'était PAS cochée du tout (courant null) — depuis SANS_PRENOM,
  // fait_le existe déjà, le montant du mouvement lié reste tel quel (déjà figé une fois).
  const premiereCoche = courant === null && suivant !== null;
  const champsLigne = champsCycle(courant, suivant, avant.fait_le, dateCible);
  const mouvementLie = champsMouvementLie(etat, chargeId, champsLigne, premiereCoche);
  const message = suivant === null ? "Validation annulée." : `Validé pour ${suivant}.`;
  return { ok: true, message, champsLigne, mouvementLie };
}

/** Mute `etat` selon le résultat de `preparerBascule` (ok:true) : à appeler juste avant de
 *  rendre l'écran, avant l'écriture réseau (optimiste). Renvoie l'état d'avant, pour rollback. */
export function appliquerBascule(etat, chargeId, { champsLigne, mouvementLie }) {
  const ligneAvant = etat.lignes[chargeId];
  etat.lignes[chargeId] = { ...ligneAvant, ...champsLigne };
  let mouvementAvant = null;
  if (mouvementLie) {
    const m = etat.mouvements.find((x) => x.id === mouvementLie.id);
    mouvementAvant = { ...m };
    Object.assign(m, mouvementLie.champs);
  }
  return { ligneAvant, mouvementAvant };
}

/** Restaure `etat` avec ce que `appliquerBascule` a renvoyé — rollback après échec réseau. */
export function annulerBascule(etat, chargeId, { ligneAvant, mouvementAvant }, mouvementLie) {
  etat.lignes[chargeId] = ligneAvant;
  if (mouvementLie && mouvementAvant) {
    const m = etat.mouvements.find((x) => x.id === mouvementLie.id);
    if (m) Object.assign(m, mouvementAvant);
  }
}

/** Écrit en base les champs préparés — aucune mutation d'état ici (déjà faite par appliquerBascule). */
export async function ecrireBascule(api, etat, chargeId, { champsLigne, mouvementLie }) {
  await api.majLigne(etat.annee, etat.mois, chargeId, champsLigne);
  if (mouvementLie) await api.majMouvement(mouvementLie.id, mouvementLie.champs);
}
