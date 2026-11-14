// Règles PURES du suivi des sondages : validation du formulaire, lien partagé, classement des
// réponses. Sans DOM ni réseau — testé dans tests/test_proches.mjs.

import { JOURS_MAX } from "./jours-libres.js";

export const TITRE_MAX = 80;
export const MESSAGE_MAX = 300;

/** Lien public d'un sondage. `base` = origine ET dossier de l'app (document.baseURI) : marche sous
 *  GitHub Pages (sous-chemin) comme en local, comme le partage de voyage (partage.html). */
export const lienSondage = (jeton, base) => new URL(`sondage.html?j=${jeton}`, base).href;

/** Champs à écrire pour un nouveau sondage ; lève une erreur lisible si le formulaire est invalide.
 *  `jours` : [{ jour, libre, ferie, vacances }] — rien d'autre n'est copié (principe 1 du brief). */
export function champsSondage({ titre, message, jours, reponsesVisibles }, creePar) {
  const t = String(titre ?? "").trim();
  const m = String(message ?? "").trim();
  if (!t) throw new Error("Donnez un titre au sondage.");
  if (t.length > TITRE_MAX) throw new Error(`Le titre est trop long : ${TITRE_MAX} caractères au plus.`);
  if (m.length > MESSAGE_MAX) throw new Error(`Le mot est trop long : ${MESSAGE_MAX} caractères au plus.`);
  if (!jours.length) throw new Error("Aucun jour dans la période.");
  if (jours.length > JOURS_MAX) throw new Error(`${JOURS_MAX} jours au plus.`);
  if (!jours.some((j) => j.libre)) throw new Error("Aucun jour libre : touchez les jours pour en libérer.");
  return {
    titre: t,
    message: m || null,
    jours: jours.map(({ jour, libre, ferie, vacances }) => ({ jour, libre, ferie, vacances })),
    reponses_visibles: Boolean(reponsesVisibles),
    cree_par: creePar ?? null,
  };
}

/** Réponses classées par jour : `[{ jour, n, prenoms }]`, le jour le plus coché en tête (à égalité,
 *  le plus proche d'abord). Les jours sans aucune réponse sont omis. */
export function classerReponses(votes) {
  const parJour = new Map();
  for (const v of votes ?? []) {
    for (const jour of new Set(v.jours ?? [])) parJour.set(jour, [...(parJour.get(jour) ?? []), v.prenom]);
  }
  return [...parJour].map(([jour, prenoms]) => ({ jour, n: prenoms.length, prenoms }))
    .sort((a, b) => b.n - a.n || a.jour.localeCompare(b.jour));
}
