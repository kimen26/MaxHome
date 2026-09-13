// Socle UI partagé : navigation par modules, feuille mobile, confirmation, toast, bandeau
// d'erreur, helpers DOM. Le socle ne connaît aucun module par son nom : app.js lui injecte
// le registre au démarrage (enregistrerModules).

export const $ = (s) => document.querySelector(s);
export const $$ = (s) => [...document.querySelectorAll(s)];

export const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const MOIS_COURT = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin",
  "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];

export const estPC = () => window.matchMedia("(min-width:1024px)").matches;

/** Échappe le texte inséré via innerHTML. */
export const txt = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Décale un mois de n, en gérant le passage d'année. */
export function decaler(annee, mois, n) {
  const t = (annee * 12 + (mois - 1)) + n;
  return [Math.floor(t / 12), (t % 12) + 1];
}

// ---------- modules et écrans ----------
let ORDRE = [];
let MODULES = {};

/** Registre des modules, dans l'ordre d'affichage. Appelé une fois par app.js. */
export function enregistrerModules(liste) {
  ORDRE = liste;
  MODULES = Object.fromEntries(liste.map((m) => [m.cle, m]));
}
export const modules = () => ORDRE;
// `ecransTransition` : écrans hors navigation (ni barre basse, ni segmenté) qu'un module garde
// atteignables par un lien direct pendant une transition (ex. Budget "charges"/"recurrents"
// avant fusion, D-036 §4). Optionnel, absent pour les modules qui n'en ont pas besoin.
// `defaut` est toujours l'écran ouvert par la barre basse, même quand le module n'a pas de
// segmenté d'en-tête (`onglets: []`, ex. Courses D-036 §3) : sans lui dans la liste,
// `moduleDe("courses")` renvoie null et `montrerEcran` ignore silencieusement la navigation
// (pas d'erreur console — juste un clic qui ne fait rien).
const ecransDe = (m) => [m.defaut, ...m.onglets.map(([e]) => e), ...m.reglages.map(([e]) => e)]
  .concat(m.ecransTransition ?? []);
export const moduleDe = (ecran) => ORDRE.find((m) => ecransDe(m).includes(ecran))?.cle ?? null;
/** Un écran de réglages appartient à son module pour le rendu, mais à l'entrée « Réglages »
 *  de la barre basse et à l'en-tête synthétique — pas au segmenté de son module d'origine. */
export const estReglages = (ecran) => ORDRE.some((m) => m.reglages.some(([e]) => e === ecran));
const CLE_ECRAN = "maxhome.ecran";

let surEcran = () => {};

export function montrerEcran(nom, { rendre = true } = {}) {
  const module = moduleDe(nom);
  if (nom !== "accueil" && !module) return;
  for (const s of $$("main .ecran")) s.hidden = s.id !== `ecran-${nom}`;
  rendreNavigation(module, nom);
  $("#puces-pc").hidden = !(module && MODULES[module].avecMois);
  $("#pied-reglages").hidden = !estReglages(nom);
  window.scrollTo(0, 0);
  try { localStorage.setItem(CLE_ECRAN, nom); } catch { /* stockage indisponible : on repart de l'accueil */ }
  if (rendre) surEcran(nom);
}

export function ecranCourant() {
  return $$("main .ecran").find((s) => !s.hidden)?.id.replace(/^ecran-/, "") ?? "accueil";
}

/** Dernier écran ouvert sur cet appareil, sinon l'accueil (première visite, ou stockage
 *  indisponible) — jamais directement `defaut` du premier module : l'accueil reste la porte
 *  d'entrée normale, avec sa carte par module (D-036 §3). */
export function ecranDeDepart() {
  try {
    const e = localStorage.getItem(CLE_ECRAN);
    return e === "accueil" || moduleDe(e) ? e : "accueil";
  } catch { return "accueil"; }
}

/** Segmenté d'en-tête partagé : boutons `.segment` sur les onglets d'UN module, dans SON
 *  ordre. Les agents d'écran l'utilisent pour peupler leurs `[data-segment="<cle_module>"]`
 *  (module.js s'en sert aussi pour Réglages, avec un pseudo-module synthétique). */
export function segmentEcrans(entrees, ecranCourantNom, { large = false } = {}) {
  return `<div class="segment${large ? " large" : ""}">${entrees.map(([e, l]) =>
    `<button data-ecran="${e}" class="${e === ecranCourantNom ? "actif" : ""}">${txt(l)}</button>`).join("")}</div>`;
}

/** Remplit tous les `[data-segment]` de l'écran affiché : ceux du module courant avec ses
 *  `onglets`, et — sur les écrans de réglages — le segmenté synthétique `data-segment="reglages"`
 *  avec les entrées `reglages` de tous les modules, dans l'ordre des modules (D-036 §3). */
function remplirSegments(module, nom) {
  const m = module ? MODULES[module] : null;
  if (m && !estReglages(nom)) {
    for (const cible of $$(`main .ecran:not([hidden]) [data-segment="${m.cle}"]`)) {
      cible.innerHTML = segmentEcrans(m.onglets, nom);
    }
  }
  if (estReglages(nom)) {
    const entrees = ORDRE.flatMap((mod) => mod.reglages);
    for (const cible of $$('main .ecran:not([hidden]) [data-segment="reglages"]')) {
      cible.innerHTML = segmentEcrans(entrees, nom, { large: true });
    }
  }
}

function rendreOngletsGlobaux(nom) {
  // Barre basse GLOBALE, 4 entrées fixes : un module par bouton (son écran `defaut`), puis
  // Réglages (premier écran de réglages du premier module qui en a un). Actif = le module de
  // l'écran courant, ou Réglages si l'écran courant en est un (D-036 §3).
  const reglagesDefaut = ORDRE.flatMap((m) => m.reglages)[0]?.[0] ?? null;
  const module = moduleDe(nom);
  const entrees = [
    ...ORDRE.map((m) => [m.defaut, m.nom, module === m.cle && !estReglages(nom)]),
    reglagesDefaut ? [reglagesDefaut, "Réglages", estReglages(nom)] : null,
  ].filter(Boolean);
  $("#onglets").innerHTML = entrees.map(([e, l, actif]) =>
    `<button data-ecran="${e}" class="${actif ? "actif" : ""}">${txt(l)}</button>`).join("");
}

function rendreBarrePc(module, nom) {
  const m = module ? MODULES[module] : null;
  const reglagesDefaut = ORDRE.flatMap((mm) => mm.reglages)[0]?.[0] ?? null;
  const entreesModules = [
    ...ORDRE.map((mm) => [mm.defaut, mm.nom, mm.cle]),
    reglagesDefaut ? [reglagesDefaut, "Réglages", "reglages"] : null,
  ].filter(Boolean);
  const cleActive = estReglages(nom) ? "reglages" : module;
  $("#modules-pc").innerHTML = entreesModules.map(([e, l, cle]) =>
    `<button class="onglet${cle === cleActive ? " actif" : ""}" data-ecran="${e}">${txt(l)}</button>`).join("");
  const entreesEcran = estReglages(nom) ? ORDRE.flatMap((mm) => mm.reglages) : (m?.onglets ?? []);
  $("#onglets-pc").innerHTML = entreesEcran.length ? segmentEcrans(entreesEcran, nom) : "";
}

function rendreNavigation(module, nom) {
  rendreOngletsGlobaux(nom);
  rendreBarrePc(module, nom);
  remplirSegments(module, nom);
}

/** Navigation par délégation : `main` ET la barre basse/PC portent des `[data-ecran]`
 *  reconstruits à chaque écran (segmentés d'en-tête compris, D-036 §3). */
export function brancherNavigation(onChange) {
  surEcran = onChange ?? (() => {});
  const aller = (e) => {
    const b = e.target.closest("[data-ecran]");
    if (!b) return;
    montrerEcran(b.dataset.ecran);
  };
  $("#barre-pc").addEventListener("click", aller);
  $("#onglets").addEventListener("click", aller);
  $("main").addEventListener("click", aller);
  $("#logo").addEventListener("click", () => montrerEcran("accueil"));
  // Pied des écrans Réglages (mobile) : « Accueil MaxHome » passe par la délégation
  // ci-dessus (data-ecran), « Déconnexion » déclenche le même bouton que la barre PC.
  $("#pied-reglages-logout")?.addEventListener("click", () => $("#logout").click());
}

// ---------- feuille mobile ----------
let confirmationEnAttente = null;

export function ouvrirFeuille(html) {
  brancherFeuille();
  $("#feuille-corps").innerHTML = html;
  $("#feuille-fond").hidden = false;
  const f = $("#feuille");
  f.classList.add("entrante");
  f.hidden = false;
  requestAnimationFrame(() => f.classList.remove("entrante"));
}

export function fermerFeuille() {
  $("#feuille").hidden = true;
  $("#feuille-fond").hidden = true;
  $("#feuille-corps").innerHTML = "";
  // Une confirmation fermée par le fond ou Échap vaut « non ».
  const attente = confirmationEnAttente;
  confirmationEnAttente = null;
  attente?.(false);
}

export const feuilleOuverte = () => !$("#feuille").hidden;

// Branché au premier usage, pas à l'import : un module du socle qui touche le DOM au
// chargement ne s'importe plus en Node, et toute la logique pure qu'il exporte devient
// intestable (blocs-cycle.js importe `txt` d'ici). Idempotent comme le démarrage (L-017).
let feuilleBranchee = false;
function brancherFeuille() {
  if (feuilleBranchee) return;
  feuilleBranchee = true;
  $("#feuille-fond").addEventListener("click", fermerFeuille);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermerFeuille(); });
}

/** Confirmation en feuille, à la place de confirm() : résout true si l'utilisateur confirme. */
export function confirmer(texte, { ok = "Confirmer", danger = true } = {}) {
  return new Promise((resolve) => {
    ouvrirFeuille(`<div class="pile confirmation">
      <p class="texte-confirmation">${txt(texte)}</p>
      <div class="detail-actions">
        <button type="button" class="btn grandir" data-annuler>Annuler</button>
        <button type="button" class="btn grandir ${danger ? "btn-rouge" : "btn-bleu"}" data-ok>${txt(ok)}</button>
      </div></div>`);
    confirmationEnAttente = resolve;
    $("#feuille-corps [data-ok]").addEventListener("click", () => {
      confirmationEnAttente = null;
      fermerFeuille();
      resolve(true);
    });
    $("#feuille-corps [data-annuler]").addEventListener("click", fermerFeuille);
  });
}

// ---------- toast ----------
let minuteurToast;
export function toast(message, erreur = false) {
  const t = $("#toast");
  t.textContent = message;
  t.classList.toggle("erreur", erreur);
  t.hidden = false;
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => { t.hidden = true; }, erreur ? 4000 : 2000);
}

// ---------- bandeau d'erreur réseau ----------
export function bandeauErreur(message, reessayer, { patience = false } = {}) {
  $("#bandeau-erreur-texte").textContent = message;
  $("#bandeau-erreur").hidden = false;
  $("#bandeau-erreur").classList.toggle("patience", patience);
  // Sans action de reprise, pas de bouton : proposer « Réessayer » là où retenter
  // redonnerait la même erreur est un faux espoir, et un bouton qui ne répare rien
  // apprend à ne plus faire confiance aux boutons.
  $("#btn-reessayer").hidden = !reessayer;
  $("#btn-reessayer").onclick = () => { cacherBandeau(); reessayer?.(); };
}
export const cacherBandeau = () => { $("#bandeau-erreur").hidden = true; };

// ---------- presse-papier ----------
export async function copier(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    toast(`${texte} copié`);
  } catch (e) {
    // Refus de permission ou contexte non sécurisé : le message reste simple pour
    // l'utilisateur, mais la cause réelle part dans la console.
    console.error("copie refusée", e);
    toast("Copie impossible ici", true);
  }
}
