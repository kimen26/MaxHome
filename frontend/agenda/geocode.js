// Géocodage Nominatim (OpenStreetMap) : recherche d'un lieu par texte, jusqu'à 5 résultats.
// Politique d'usage OSM : une requête à la fois, au moins 1100 ms d'écart entre deux appels —
// une file d'attente simple porte cette contrainte, pas un debounce (un appel manqué doit
// quand même partir, juste plus tard). Sans clé, gratuit.

const BASE = "https://nominatim.openstreetmap.org/search";
const ECART_MIN_MS = 1100;

let dernierAppel = 0;
let file = Promise.resolve();

/** Attend, si besoin, que l'écart minimal depuis le dernier appel soit passé. */
function attendreCreneau() {
  const maintenant = Date.now();
  const attente = Math.max(0, dernierAppel + ECART_MIN_MS - maintenant);
  return new Promise((resolve) => setTimeout(resolve, attente));
}

/**
 * Cherche un lieu par texte libre (nom + indice de lieu, ex. "Colisée, Rome") : jusqu'à 5
 * résultats { nom, lat, lng, type }. Les appels sont sérialisés et espacés d'au moins
 * `ECART_MIN_MS` (politique d'usage Nominatim), même si plusieurs arrivent en même temps.
 * `fetchFn` injectable pour les tests et la recette (jamais de réseau réel en recette).
 */
export function chercherLieu(texte, { fetchFn = fetch } = {}) {
  const tache = file.then(async () => {
    await attendreCreneau();
    dernierAppel = Date.now();
    const url = `${BASE}?format=jsonv2&limit=5&accept-language=fr&q=${encodeURIComponent(texte)}`;
    const reponse = await fetchFn(url);
    if (!reponse.ok) throw new Error(`Nominatim : HTTP ${reponse.status}`);
    const data = await reponse.json();
    if (!Array.isArray(data)) throw new Error("Nominatim : réponse inattendue");
    return data.map((r) => ({
      nom: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
      type: r.type ?? null,
    }));
  });
  // Une recherche qui échoue ne doit pas bloquer les suivantes : la file continue même en
  // erreur, seule la promesse renvoyée à l'appelant porte l'échec.
  file = tache.catch(() => {});
  return tache;
}
