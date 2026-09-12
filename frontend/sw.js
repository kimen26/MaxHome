// sw.js — Service worker MaxHome, calqué sur celui de MaxPlay (voir
// ../MaxPlay/site/sw.js) mais réduit au besoin réel : rendre la liste de
// courses utilisable dans le magasin, là où le réseau est mauvais.
//
// Stratégie de cache PAR TYPE (rapidité/hors-ligne vs fraîcheur) :
//
//   1. COQUILLE (SW_PRECACHE, importé de sw-precache.js) — index.html, css,
//      tous les .js de frontend/ (socle/, budget/, taches/, courses/), le
//      manifeste, les icônes. Précachée à l'install, versionnée par
//      SW_VERSION (hash de contenu, voir scripts/gen-sw-version.mjs — jamais
//      de version en dur). Servie CACHE-FIRST : elle doit s'afficher
//      instantanément et hors ligne, quitte à être une version derrière le
//      dernier déploiement. Elle se renouvelle seule au déploiement suivant,
//      sans geste de Claudia ou Yann.
//
//   2. SUPABASE (tout hôte contenant "supabase") — NETWORK-FIRST, JAMAIS mis
//      en cache. Non négociable : les montants, les coches de courses et les
//      parts de tâches doivent refléter l'état réel, et Claudia/Yann écrivent
//      dans la même base depuis deux téléphones. Un cache ici créerait des
//      divergences invisibles entre les deux. Si le réseau manque, la requête
//      échoue normalement (pas de repli cache) : c'est à l'app de gérer l'état
//      hors ligne, pas au worker de mentir sur les données.
//
//   3. Google Fonts (fonts.googleapis.com, fonts.gstatic.com) —
//      STALE-WHILE-REVALIDATE : autant profiter du cache pour un affichage
//      instantané en rayon, la police ne change quasiment jamais donc le
//      risque de fraîcheur est nul.
//
//   4. Le reste (JS/CSS non précachés, pages non listées) — NETWORK-FIRST
//      avec repli cache si présent.
//
// Chemins et scope RELATIFS partout : le site est servi sous un sous-chemin
// GitHub Pages (kimen26.github.io/MaxHome/), jamais à la racine du domaine.
// Un chemin absolu ('/sw.js', '/style.css') casserait le scope et le cache dès
// que le repo est servi ailleurs qu'à la racine (piège documenté aussi dans
// memory/DECISIONS.md D-033, et dans MaxPlay/site/sw.js).

importScripts("./sw-version.js", "./sw-precache.js");

const VERSION = self.SW_VERSION || "dev";
const SHELL_CACHE = `maxhome-shell-${VERSION}`;
const FONTS_CACHE = "maxhome-fonts";
const PRECACHE_LIST = self.SW_PRECACHE || [];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_LIST)).then(() => self.skipWaiting())
  );
});

// skipWaiting() + clients.claim() : un worker mis à jour prend la main
// immédiatement, sans attendre la fermeture de tous les onglets. Choisi
// délibérément — Claudia et Yann ne savent pas ce qu'est un onglet à fermer
// pour "forcer la mise à jour" ; le risque (un onglet ouvert bascule de
// version en cours de session) est bien plus faible que celui qu'on corrige
// (un cache qui ne se met jamais à jour, la raison même de D-033 révisée).
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((noms) =>
        Promise.all(
          noms
            .filter((nom) => nom.startsWith("maxhome-shell-") && nom !== SHELL_CACHE)
            .map((nom) => caches.delete(nom))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** stale-while-revalidate : sert le cache immédiatement, revalide en tâche de fond. */
function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then(async (cache) => {
    const cached = await cache.match(request);
    const depuisReseau = fetch(request)
      .then((reponse) => {
        if (reponse && reponse.ok) cache.put(request, reponse.clone());
        return reponse;
      })
      .catch(() => undefined);
    return cached || depuisReseau;
  });
}

/** network-first : réseau si possible, repli cache sinon (pas de page offline.html dédiée —
 *  la coquille précachée EST la page, cache.match(request) suffit à la resservir). */
function networkFirst(request, cacheName) {
  return fetch(request)
    .then((reponse) => {
      if (reponse && reponse.ok && request.method === "GET" && cacheName) {
        caches.open(cacheName).then((cache) => cache.put(request, reponse.clone()));
      }
      return reponse;
    })
    .catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      return Response.error();
    });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // écritures Supabase jamais interceptées

  const url = new URL(request.url);

  // Garde-fou explicite, avant tout autre traitement : une requête Supabase
  // n'est JAMAIS interceptée ni mise en cache, quel que soit son origin.
  if (url.hostname.includes("supabase")) return;

  const isNavigation = request.mode === "navigate";
  const memeOrigine = url.origin === self.location.origin;

  if (memeOrigine) {
    // Chemin relatif au scope du worker (ex. "index.html", "socle/blocs.js").
    const chemin = url.pathname.replace(self.registration.scope.replace(self.location.origin, ""), "");
    const dansCoquille = PRECACHE_LIST.includes(chemin) || PRECACHE_LIST.includes("./" + chemin);

    // 1. Coquille précachée, ou navigation (index.html servi pour toute route) → cache-first.
    if (dansCoquille || isNavigation) {
      event.respondWith(
        caches.match(request).then((cached) => cached || networkFirst(request, SHELL_CACHE))
      );
      return;
    }

    // 2. Reste du même domaine, non précaché → network-first avec repli cache.
    event.respondWith(networkFirst(request, null));
    return;
  }

  // 3. Google Fonts → stale-while-revalidate.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(request, FONTS_CACHE));
    return;
  }

  // 4. Tout autre tiers (CDN Supabase JS, etc.) : laissé au navigateur, pas d'interception.
});
