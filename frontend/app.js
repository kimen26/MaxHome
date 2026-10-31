// Orchestrateur : authentification, état partagé, sélecteur de mois, accueil, boucle sur les
// modules. Ne cite aucun module par son nom : tout passe par le registre (modules.js).

import { creerApi } from "./socle/api.js";
import { LISTE } from "./modules.js";
import { $, txt, MOIS_COURT, decaler, montrerEcran, ecranCourant, ecranDeDepart, moduleDe,
  enregistrerModules, brancherNavigation, bandeauErreur, cacherBandeau } from "./socle/ui-base.js";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const api = creerApi(sb);

const etat = { annee: 0, mois: 0, prenom: null, membres: [] };
for (const m of LISTE) Object.assign(etat, structuredClone(m.etatInitial));

let instances = {};
const prets = new Set(); // modules dont le premier chargement est terminé
const moduleDuMois = LISTE.find((m) => m.avecMois)?.cle ?? null;

// Un JWT refusé pour cause d'horodatage n'est pas une panne. Deux cas : supabase-js
// rafraîchit le token (TOKEN_REFRESHED, plus bas), ou — token tout neuf, décalage d'horloge
// de 1-2 s à la connexion — il n'émet rien et l'app doit réessayer seule (reprise
// programmée dans echec). On le dit sans bouton « Réessayer », qui redonnerait la même erreur.
const DELAI_REPRISE_MS = 3000;
const REPRISES_MAX = 5;
let reprise = null;       // minuteur de la reprise en attente (une seule à la fois)
let reprisesFaites = 0;   // remis à zéro au premier chargement réussi et à la déconnexion
const estJetonPasEncoreValide = (e) =>
  /issued at future|jwt.*not yet valid/i.test(e?.message ?? String(e));

const echec = (e) => {
  console.error(e);
  if (estJetonPasEncoreValide(e)) {
    // Plusieurs modules échouent ensemble : une seule reprise en attente, bornée.
    if (reprise === null && reprisesFaites < REPRISES_MAX) {
      reprisesFaites++;
      reprise = setTimeout(() => { reprise = null; repartir(); }, DELAI_REPRISE_MS);
    }
    if (reprise !== null) {
      bandeauErreur("Connexion en cours de validation…", null, { patience: true });
      return;
    }
    // Reprises épuisées : l'erreur normale, avec Réessayer (qui redonne droit à des reprises).
    bandeauErreur(`Erreur : ${e.message ?? e}`, () => { reprisesFaites = 0; rafraichir(moduleDuMois); });
    return;
  }
  // Bandeau OU toast, jamais les deux : le même message affiché deux fois se lit
  // comme deux pannes distinctes.
  bandeauErreur(`Erreur : ${e.message ?? e}`, () => rafraichir(moduleDuMois));
};

/** Recharge les données d'un module et rend son écran s'il est visible (ou l'accueil). */
async function rafraichir(cle) {
  const instance = instances[cle];
  if (!instance) return;
  instance.avantChargement?.();
  try {
    await instance.charger();
    prets.add(cle);
    reprisesFaites = 0;
    cacherBandeau();
    rendreSi(cle);
  } catch (e) { echec(e); }
}
const cb = { echec, rafraichir };

// ---------- auth ----------
$("#form-login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const { error } = await api.auth.connecter(f.get("email"), f.get("password"));
  $("#login-erreur").textContent = error ? error.message : "";
});
$("#logout").addEventListener("click", () => { api.auth.deconnecter().catch(echec); });
// Supabase notifie plusieurs fois une même session (INITIAL_SESSION puis SIGNED_IN au
// rechargement) : démarrer deux fois brancherait chaque bouton statique en double et
// chaque formulaire partirait deux fois. On ne démarre qu'une fois par session.
let demarre = false;
let socleEnPlace = false; // demarrer() est allé jusqu'au bout : modules construits, navigation branchée

function annulerReprise() {
  clearTimeout(reprise);
  reprise = null;
}

/** Repart après un jeton refusé (TOKEN_REFRESHED ou reprise programmée). Distinguer les deux
 *  échecs possibles : si demarrer() n'a jamais abouti, il n'y a aucune instance à rafraîchir
 *  (rafraichir() sortirait aussitôt) — il faut le rejouer entièrement. */
function repartir() {
  cacherBandeau();
  if (socleEnPlace) for (const m of LISTE) rafraichir(m.cle);
  else lancer();
}

async function lancer() {
  demarre = true;
  try { await demarrer(); } catch (e) { echec(e); }
}

api.auth.surChangement((ev, session) => {
  $("#login").hidden = !!session;
  $("#app").hidden = !session;
  if (!session) { annulerReprise(); reprisesFaites = 0; demarre = false; socleEnPlace = false; return; }
  if (!demarre) { lancer(); return; }

  // Déjà démarré. INITIAL_SESSION rend la session telle qu'elle dort dans localStorage :
  // si son token était périmé, demarrer() a échoué AVANT de construire les modules, et
  // l'app est restée sur son bandeau (il fallait un Ctrl+F5 pour s'en sortir). supabase-js
  // émet un token neuf peu après : c'est le moment de repartir seule.
  if (ev !== "TOKEN_REFRESHED") return;
  annulerReprise();
  repartir();
});

// ---------- mois courant (sélecteur en en-tête, partagé par les modules « avecMois ») ----------
function moisDepuisHash() {
  const m = location.hash.match(/^#(\d{4})-(\d{1,2})$/);
  const d = new Date();
  return m ? [Number(m[1]), Number(m[2])] : [d.getFullYear(), d.getMonth() + 1];
}

function rendrePuces() {
  const html = [-2, -1, 0, 1, 2].map((n) => {
    const [a, m] = decaler(etat.annee, etat.mois, n);
    return `<button data-mois="${a}-${m}" class="${n === 0 ? "actif" : ""}">${MOIS_COURT[m - 1]}</button>`;
  }).join("");
  for (const cible of ["#puces-mobile", "#puces-pc"]) {
    $(cible).innerHTML = html;
    for (const b of $(cible).querySelectorAll("button")) {
      b.addEventListener("click", () => { location.hash = b.dataset.mois; });
    }
  }
}

function changerDeMois() {
  [etat.annee, etat.mois] = moisDepuisHash();
  rendrePuces();
}
window.addEventListener("hashchange", () => { changerDeMois(); rafraichir(moduleDuMois); });

// ---------- démarrage ----------
async function demarrer() {
  enregistrerModules(LISTE);
  const referentiels = LISTE.flatMap((m) => Object.entries(m.referentiels(api)));
  const [membres, ...valeurs] = await Promise.all([api.membres(), ...referentiels.map(([, p]) => p)]);
  etat.membres = membres;
  referentiels.forEach(([cle], i) => { etat[cle] = valeurs[i]; });
  etat.prenom = await api.auth.prenomCourant(membres);

  instances = Object.fromEntries(LISTE.map((m) => [m.cle, m.creer(api, etat, cb)]));
  brancherNavigation(rendreEcran);
  socleEnPlace = true;
  changerDeMois();
  // L'écran est affiché sans être rendu : les chargements peuplent l'état puis déclenchent le rendu.
  montrerEcran(ecranDeDepart(), { rendre: false });
  await Promise.all(LISTE.map((m) => rafraichir(m.cle)));
}

function rendreEcran(nom) {
  if (nom === "accueil") return rendreAccueil();
  // Avant le premier chargement, l'écran garde son squelette : on ne montre pas un état
  // vide qui serait démenti une seconde plus tard.
  const cle = moduleDe(nom);
  if (prets.has(cle)) instances[cle].ecrans[nom]?.();
}

/** Rend l'écran courant s'il appartient au module donné (ou l'accueil, qui les résume tous). */
function rendreSi(cle) {
  const nom = ecranCourant();
  if (nom === "accueil" || moduleDe(nom) === cle) rendreEcran(nom);
}

// ---------- accueil : une carte par module, avec son résumé ----------
function rendreAccueil() {
  $("#sous-accueil").textContent = etat.prenom ? `Bonjour ${etat.prenom}.` : "";
  $("#modules").innerHTML = LISTE.map((m) => `
    <button class="carte module-carte" data-ecran="${m.defaut}">
      <span class="module-nom">${txt(m.nom)}</span>
      <span class="module-resume">${txt(prets.has(m.cle) ? instances[m.cle].resume() : "Chargement…")}</span>
    </button>`).join("");
  for (const b of $("#modules").querySelectorAll("[data-ecran]")) {
    b.addEventListener("click", () => montrerEcran(b.dataset.ecran));
  }
}
