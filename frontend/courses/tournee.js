// Logique PURE de la tournée « On fait le tour » : sans DOM, testable en Node, et rejouable
// à l'identique par le bot Telegram (README §4, logique-metier.md §7 — « une question, une
// réponse courte, deux surfaces »). Ni ui-courses.js ni le bot ne réécrivent cette séquence.

/** Un classique est déjà dans la liste si un article non pris porte le même libellé. */
const dejaDansListe = (libelle, articlesEnAttente) =>
  articlesEnAttente.some((a) => a?.libelle === libelle);

/**
 * Classiques absents de la liste, triés par fréquence décroissante (les plus achetés
 * d'abord — ce sont les questions les plus rentables à poser en premier).
 */
export function classiquesAbsents(classiques, articlesEnAttente) {
  // Les entrées vides sont écartées d'abord : une écriture qui ne renvoie pas sa ligne a déjà
  // glissé un `null` dans l'état une fois (upsert sans `.select()`, vu en recette connectée),
  // et la liste de courses ne doit pas mourir pour autant.
  return classiques
    .filter(Boolean)
    .filter((c) => !dejaDansListe(c.libelle, articlesEnAttente))
    .sort((a, b) => b.fois - a.fois);
}

/** Ingrédients d'un repas qui ne sont pas déjà dans la liste (en attente). */
export function ingredientsManquants(repas, ingredients, articlesEnAttente) {
  return ingredients
    .filter(Boolean)
    .filter((i) => i.repas_id === repas.id)
    .filter((i) => !dejaDansListe(i.libelle, articlesEnAttente));
}

/** Un repas est déjà entièrement dans la liste quand aucun de ses ingrédients ne manque. */
export function repasDansListe(repas, ingredients, articlesEnAttente) {
  return ingredientsManquants(repas, ingredients, articlesEnAttente).length === 0;
}

/**
 * Repas actifs proposés pour la tournée, avec leurs ingrédients manquants calculés.
 * Ordre du champ `ordre` (celui de la carte « Repas de la semaine »).
 */
export function repasProposes(repas, ingredients, articlesEnAttente) {
  return repas
    .filter((r) => r.actif)
    .sort((a, b) => a.ordre - b.ordre)
    .map((r) => ({
      repas: r,
      manquants: ingredientsManquants(r, ingredients, articlesEnAttente),
      dansListe: repasDansListe(r, ingredients, articlesEnAttente),
    }));
}

/**
 * Séquence complète de la tournée : d'abord les classiques absents (une question chacun),
 * puis les repas dont il manque au moins un ingrédient. Une structure neutre (ni DOM ni
 * Telegram) que chaque surface parcourt à sa façon (feuille mobile, messages du bot).
 */
export function sequenceTournee({ classiques, repas, ingredients, articlesEnAttente }) {
  return {
    classiques: classiquesAbsents(classiques, articlesEnAttente),
    repas: repasProposes(repas, ingredients, articlesEnAttente).filter((p) => !p.dansListe),
  };
}
