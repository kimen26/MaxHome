// Briques UI partagées : navigation d'écrans, feuille mobile, toast, bandeau d'erreur, helpers DOM.

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

// ---------- écrans ----------
const ECRANS = ["mois", "charges", "stats", "recurrents", "comptes", "annuel"];
let surEcran = () => {};

export function montrerEcran(nom, { rendre = true } = {}) {
  if (!ECRANS.includes(nom)) return;
  for (const e of ECRANS) $(`#ecran-${e}`).hidden = e !== nom;
  $$("#barre-pc .onglet").forEach((b) => b.classList.toggle("actif", b.dataset.ecran === nom));
  const ongletMobile = ["mois", "charges", "stats"].includes(nom) ? nom : "plus";
  $$("#onglets button").forEach((b) => b.classList.toggle("actif", b.dataset.ecran === ongletMobile));
  window.scrollTo(0, 0);
  if (rendre) surEcran(nom);
}

export function ecranCourant() {
  return ECRANS.find((e) => !$(`#ecran-${e}`).hidden) ?? "mois";
}

/** Branche les onglets. `onChange(nom)` est appelé après chaque bascule. */
export function brancherNavigation(onChange) {
  surEcran = onChange ?? (() => {});
  $$("#barre-pc .onglet").forEach((b) => b.addEventListener("click", () => montrerEcran(b.dataset.ecran)));
  $$("#onglets button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.ecran === "plus") return menuPlus();
    montrerEcran(b.dataset.ecran);
  }));
}

function menuPlus() {
  const entrees = [["recurrents", "Mouvements récurrents"], ["comptes", "Comptes"], ["annuel", "Vue annuelle"]];
  ouvrirFeuille(`
    <h2 style="font-size:18px;margin-bottom:12px">Plus</h2>
    ${entrees.map(([e, l]) => `<button class="btn" data-aller="${e}" style="width:100%;margin-bottom:8px;justify-content:flex-start">${l}</button>`).join("")}
    <button class="btn" id="feuille-logout" style="width:100%;color:var(--rouge)">Déconnexion</button>`);
  $$("#feuille-corps [data-aller]").forEach((b) => b.addEventListener("click", () => {
    fermerFeuille();
    montrerEcran(b.dataset.aller);
  }));
  $("#feuille-logout").addEventListener("click", () => { fermerFeuille(); $("#logout").click(); });
}

// ---------- feuille mobile ----------
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
}

export const feuilleOuverte = () => !$("#feuille").hidden;

$("#feuille-fond").addEventListener("click", fermerFeuille);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermerFeuille(); });

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
  } catch {
    toast("Copie impossible sur ce navigateur", true);
  }
}
