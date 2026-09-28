// Règles de répartition, dites en clair : un bouton « Prorata » seul ne dit pas qui paie quoi
// (retour de Yann, 2026-09-28). Chaque option montre la part de chacun — calculée sur les
// salaires du mois pour le prorata — et c'est le même bloc partout où l'on choisit (D-039).

export const REGLES = [["egales", "50/50"], ["proport", "Prorata"], ["cle", "Clé fixe"], ["perso", "Un seul paie"]];

/** Les deux règles du quotidien, dans cet ordre partout. */
export const REGLES_COURANTES = ["egales", "proport"];

export const libelleRegle = (v) => REGLES.find(([x]) => x === v)?.[1] ?? v;

const initiale = (m) => m.prenom[0].toUpperCase();

/** « C 47 % · Y 53 % » : le second complète à 100, un arrondi ne donne jamais 101 %. */
function partsEnPourcent(membres, pctPremier) {
  const [a, b] = membres;
  if (!b) return `${initiale(a)} 100 %`;
  const p = Math.round(pctPremier);
  return `${initiale(a)} ${p} % · ${initiale(b)} ${100 - p} %`;
}

/** Ce qu'une règle implique ce mois-ci, en une ligne courte. */
export function detailRegle(regle, etat, charge = {}) {
  const membres = etat.membres;
  if (!membres.length) return "";
  if (regle === "egales") return partsEnPourcent(membres, 100 / membres.length);
  if (regle === "proport") {
    const r = etat.resultat;
    // Un seul salaire manquant donnerait « C 0 % · Y 100 % » : faux tant que le mois n'est pas saisi.
    const complets = r?.totalRevenus && membres.every((m) => (etat.revenus?.[m.prenom] ?? 1) !== 0);
    return complets ? partsEnPourcent(membres, r.ratio[membres[0].prenom] * 100) : "salaires à saisir";
  }
  if (regle === "cle") return partsEnPourcent(membres, charge.cle_pct ?? 50);
  if (regle === "perso") return charge.payeur ? `payé par ${charge.payeur}` : "payeur à choisir";
  throw new Error(`règle de répartition inconnue : ${regle}`);
}

/** Règle obtenue en touchant le bouton de partage d'une rangée de Réglages · Charges (D-042) :
 *  50/50 ↔ Prorata. null pour une règle rare, qui se règle dans la feuille de la charge. */
export const regleBasculee = (regle) => ({ egales: "proport", proport: "egales" })[regle] ?? null;

/** Mot du bouton de partage : « 50/50 », « Prorata », « Clé 60 % », « Un seul paie ». Espace
 *  insécable avant « % » : le bouton est étroit, le signe ne part pas seul à la ligne. */
export const motPartage = (charge) =>
  (charge.regle === "cle" ? `Clé ${charge.cle_pct ?? 50} %` : libelleRegle(charge.regle));

/** Options d'un `choixDetaille` (socle/blocs.js) pour la règle d'une charge. */
export const optionsRegle = (etat, charge, valeurs = REGLES_COURANTES) =>
  valeurs.map((v) => ({ valeur: v, titre: libelleRegle(v), detail: detailRegle(v, etat, charge) }));
