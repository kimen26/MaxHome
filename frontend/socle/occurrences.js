// Synchronisation des occurrences d'un modèle récurrent (mouvements du mois, tâches du jour) :
// une seule boucle, une stratégie par module. Aucune connaissance des modules ici.

/**
 * Crée les occurrences manquantes puis purge les périmées, dans cet ordre : si la purge
 * échoue, les périmées restent visibles et seront retentées ; si la création échouait après
 * une purge réussie, on aurait perdu des lignes sans rien créer.
 *
 * `strategie` = {
 *   existantes(etat)                → occurrences déjà en état
 *   perimees(existantes, etat)      → celles à supprimer
 *   manquantes(etat, restantes)     → lignes à créer
 *   creer(api, lignes)              → Promise<créées>
 *   supprimer(api, ids)             → Promise
 *   poser(etat, restantes, creees)  → range le résultat dans l'état
 * }
 */
export async function synchroniserOccurrences(api, etat, strategie) {
  const existantes = strategie.existantes(etat);
  const mortes = strategie.perimees(existantes, etat);
  const restantes = mortes.length ? existantes.filter((e) => !mortes.includes(e)) : existantes;
  const manquantes = strategie.manquantes(etat, restantes);
  const creees = manquantes.length ? await strategie.creer(api, manquantes) : [];
  if (mortes.length) await strategie.supprimer(api, mortes.map((e) => e.id));
  strategie.poser(etat, restantes, creees);
}
