// Copie des pièces (billets, QR) en Cache Storage pour les lire sans réseau — utile à
// l'aéroport. Clé = id de la pièce (stable, indépendant de l'URL signée qui change à chaque
// lecture). Brief carnet-voyage.md §Hors ligne : à l'ouverture d'une fiche dont le voyage
// commence dans ≤ 14 jours ou est en cours, ses pièces sont copiées ; supprimer une pièce
// retire aussi son entrée de cache.

export const CACHE_PIECES = "maxhome-pieces";
const JOURS_ANTICIPATION = 14;

const cle = (pieceId) => `https://maxhome.local/piece/${pieceId}`;

/** true si `voyage` (debut/fin AAAA-MM-JJ) commence dans ≤ 14 j ou est en cours à `aujourdHui`
 *  (AAAA-MM-JJ) : c'est la fenêtre où l'app précopie les pièces pour l'usage hors ligne. */
export function dansLaFenetreHorsLigne(voyage, aujourdHui) {
  if (voyage.fin < aujourdHui) return false;
  if (voyage.debut <= aujourdHui) return true;
  const debut = new Date(`${voyage.debut}T00:00:00`);
  const auj = new Date(`${aujourdHui}T00:00:00`);
  const jours = Math.round((debut - auj) / 86400000);
  return jours <= JOURS_ANTICIPATION;
}

/** Copie une pièce dans le cache si Cache Storage est disponible (absent sur certains
 *  navigateurs/contextes non sécurisés) — un échec ne doit jamais empêcher l'affichage normal
 *  de la pièce (repli sur l'URL signée), donc silencieux ici, la cause part en console. */
export async function copierPieceEnCache(pieceId, urlSignee) {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(CACHE_PIECES);
    const reponse = await fetch(urlSignee);
    if (!reponse.ok) throw new Error(`copie pièce ${pieceId} : HTTP ${reponse.status}`);
    await cache.put(cle(pieceId), reponse);
  } catch (e) {
    console.error("copie hors ligne impossible pour la pièce", pieceId, e);
  }
}

/** URL affichable depuis le cache (objet blob local), ou null si absente. À libérer par
 *  l'appelant (`URL.revokeObjectURL`) quand elle n'est plus affichée. */
export async function urlPieceEnCache(pieceId) {
  if (!("caches" in window)) return null;
  const cache = await caches.open(CACHE_PIECES);
  const reponse = await cache.match(cle(pieceId));
  if (!reponse) return null;
  const blob = await reponse.blob();
  return URL.createObjectURL(blob);
}

export async function retirerPieceDuCache(pieceId) {
  if (!("caches" in window)) return;
  const cache = await caches.open(CACHE_PIECES);
  await cache.delete(cle(pieceId));
}
