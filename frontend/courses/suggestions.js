// Aide à la saisie de la ligne d'ajout (écran Courses) : logique PURE, sans DOM, testée dans
// tests/test_courses.mjs. Propose les classiques (articles déjà achetés) pendant qu'on tape,
// les plus récents d'abord — « la liste des derniers aliments ».

export const MAX_SUGGESTIONS = 6;

/** Minuscules, sans accents ni espaces de bord : « Œufs » et « oeufs » se retrouvent. */
export const normaliser = (s) => (s ?? "")
  .toString().trim().toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/œ/g, "oe").replace(/æ/g, "ae");

const dejaDansListe = (libelle, articlesEnAttente) =>
  articlesEnAttente.some((a) => a?.libelle === libelle);

/** Plus récent d'abord ; à date égale (lignes antérieures à la migration 015), le plus acheté. */
const parRecence = (a, b) =>
  (Date.parse(b.dernier_le ?? 0) || 0) - (Date.parse(a.dernier_le ?? 0) || 0) || (b.fois - a.fois);

/**
 * Classiques à proposer pour une saisie : ceux dont le libellé COMMENCE par la saisie
 * d'abord, puis ceux qui la CONTIENNENT ; chaque groupe par récence. Saisie vide = les
 * derniers achetés. Un article déjà dans la liste n'est jamais proposé.
 */
export function suggerer(saisie, classiques, articlesEnAttente, max = MAX_SUGGESTIONS) {
  const cle = normaliser(saisie);
  const candidats = classiques
    .filter(Boolean)
    .filter((c) => !dejaDansListe(c.libelle, articlesEnAttente))
    .sort(parRecence);
  if (!cle) return candidats.slice(0, max);
  const commence = candidats.filter((c) => normaliser(c.libelle).startsWith(cle));
  const contient = candidats.filter((c) => !commence.includes(c) && normaliser(c.libelle).includes(cle));
  return [...commence, ...contient].slice(0, max);
}

/** Le classique dont le libellé est exactement la saisie (aux accents et à la casse près). */
export function classiqueCorrespondant(saisie, classiques) {
  const cle = normaliser(saisie);
  if (!cle) return null;
  return classiques.filter(Boolean).find((c) => normaliser(c.libelle) === cle) ?? null;
}
