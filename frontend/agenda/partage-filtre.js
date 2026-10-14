// Filtrage PUR des données d'un voyage partagé : le miroir JS de la fonction SQL `voyage_partage`
// (migration 033). Le fichier « Télécharger la page » est bâti avec CE filtre, la page en ligne avec
// la fonction SQL : mêmes champs, liste blanche des deux côtés. Jamais code, prix, payé par,
// prestataire, note, poste ; ni todos, enveloppes, pièces.

export const CHAMPS_VOYAGE = ["titre", "lieu", "debut", "fin"];
export const CHAMPS_LIEU = ["id", "nom", "categorie", "statut", "jour", "ordre", "lat", "lng", "lien", "topo", "horaires"];
export const CHAMPS_RESA = ["id", "type", "titre", "debut", "fin", "statut", "lieu_id"];
export const CHAMPS_BLOC = ["type", "titre", "texte", "ordre"];

const garder = (objet, champs) => Object.fromEntries(champs.map((c) => [c, objet[c] ?? null]));

/** → { voyage, lieux, resas, blocs } : seulement les champs autorisés, résas annulées retirées. */
export function filtrerPourPartage(voyage, lieux, resas, blocs) {
  return {
    voyage: garder(voyage, CHAMPS_VOYAGE),
    lieux: lieux.map((l) => garder(l, CHAMPS_LIEU)),
    resas: resas.filter((r) => r.statut !== "annule").map((r) => garder(r, CHAMPS_RESA)),
    blocs: blocs.map((b) => garder(b, CHAMPS_BLOC)),
  };
}
