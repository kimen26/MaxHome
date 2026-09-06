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
const ecransDe = (m) => [...m.onglets, ...m.plus].map(([e]) => e);
export const moduleDe = (ecran) => ORDRE.find((m) => ecransDe(m).includes(ecran))?.cle ?? null;
const CLE_ECRAN = "maxhome.ecran";

let surEcran = () => {};

export function montrerEcran(nom, { rendre = true } = {}) {
  const module = moduleDe(nom);
  if (nom !== "accueil" && !module) return;
  for (const s of $$("main .ecran")) s.hidden = s.id !== `ecran-${nom}`;
  rendreOnglets(module, nom);
  $("#puces-pc").hidden = !(module && MODULES[module].avecMois);
  window.scrollTo(0, 0);
  try { localStorage.setItem(CLE_ECRAN, nom); } catch { /* stockage indisponible : on repart de l'accueil */ }
  if (rendre) surEcran(nom);
}

export function ecranCourant() {
  return $$("main .ecran").find((s) => !s.hidden)?.id.replace(/^ecran-/, "") ?? "accueil";
}

/** Dernier écran ouvert sur cet appareil, sinon l'accueil. */
export function ecranDeDepart() {
  try {
    const e = localStorage.getItem(CLE_ECRAN);
    return e === "accueil" || moduleDe(e) ? e : "accueil";
  } catch { return "accueil"; }
}

function rendreOnglets(module, nom) {
  const m = module ? MODULES[module] : null;
  $("#onglets-pc").innerHTML = m
    ? [...m.onglets, ...m.plus].map(([e, l]) =>
      `<button class="onglet${e === nom ? " actif" : ""}" data-ecran="${e}">${txt(l)}</button>`).join("")
    : "";
  $("#module-pc").textContent = m ? m.nom : "";
  // « Plus » est toujours présent dans un module : c'est la seule porte de sortie sur
  // mobile (accueil, autres modules, déconnexion), même quand le module n'a qu'un onglet.
  const mobile = m
    ? [...m.onglets.map(([e, l]) => [e, l, e === nom]), ["plus", "Plus", m.plus.some(([e]) => e === nom)]]
    : ORDRE.map((v) => [v.defaut, v.nom, false]);
  $("#onglets").innerHTML = mobile.map(([e, l, actif]) =>
    `<button data-ecran="${e}" class="${actif ? "actif" : ""}">${txt(l)}</button>`).join("");
}

/** Navigation par délégation : les onglets sont reconstruits à chaque écran. */
export function brancherNavigation(onChange) {
  surEcran = onChange ?? (() => {});
  const aller = (e) => {
    const b = e.target.closest("[data-ecran]");
    if (!b) return;
    if (b.dataset.ecran === "plus") return menuPlus();
    montrerEcran(b.dataset.ecran);
  };
  $("#barre-pc").addEventListener("click", aller);
  $("#onglets").addEventListener("click", aller);
  $("#logo").addEventListener("click", () => montrerEcran("accueil"));
}

function menuPlus() {
  const module = moduleDe(ecranCourant());
  // Le menu ouvre TOUT écran de l'app, pas seulement le premier des autres modules :
  // sans cela, un module à un seul onglet (Courses) enferme la navigation mobile.
  const groupes = [
    module ? [`Encore dans ${MODULES[module].nom}`, MODULES[module].plus] : null,
    ["Aller à", [["accueil", "Accueil MaxHome"]]],
    ...ORDRE.filter((m) => m.cle !== module).map((m) => [m.nom, [...m.onglets, ...m.plus]]),
  ].filter((g) => g && g[1].length);

  ouvrirFeuille(`
    <h2 class="feuille-titre">Plus</h2>
    ${groupes.map(([titre, entrees]) => `<h3 class="titre-section">${txt(titre)}</h3>
      ${entrees.map(([e, l]) => `<button class="btn btn-menu" data-aller="${e}">${txt(l)}</button>`).join("")}`).join("")}
    <button class="btn btn-menu danger" id="feuille-logout">Déconnexion</button>`);
  $$("#feuille-corps [data-aller]").forEach((b) => b.addEventListener("click", () => {
    fermerFeuille();
    montrerEcran(b.dataset.aller);
  }));
  $("#feuille-logout").addEventListener("click", () => { fermerFeuille(); $("#logout").click(); });
}

// ---------- feuille mobile ----------
let confirmationEnAttente = null;

export function ouvrirFeuille(html) {
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

$("#feuille-fond").addEventListener("click", fermerFeuille);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermerFeuille(); });

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
export function bandeauErreur(message, reessayer) {
  $("#bandeau-erreur-texte").textContent = message;
  $("#bandeau-erreur").hidden = false;
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
