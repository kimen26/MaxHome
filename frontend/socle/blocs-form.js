// Helpers de formulaire : chaque champ échappe ses valeurs, chaque <option> porte un value.
// Un écran compose un formulaire avec ces briques, il n'écrit pas ses <input> à la main.

import { txt } from "./ui-base.js";

/** Centimes → « 1 234,56 » pour un champ ; vide si null. */
export const enEuros = (c) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

export const champ = (name, label, { type = "text", valeur = "", placeholder = "", requis = false, attrs = "" } = {}) =>
  `<label>${txt(label)} <input class="champ" name="${name}" type="${type}" value="${txt(valeur ?? "")}"` +
  `${placeholder ? ` placeholder="${txt(placeholder)}"` : ""}${requis ? " required" : ""} ${attrs}></label>`;

export const montant = (name, label, centimes, { placeholder = "0,00", requis = false } = {}) =>
  `<label>${txt(label)} <input class="champ champ-montant" name="${name}" inputmode="decimal"` +
  ` value="${enEuros(centimes)}" placeholder="${txt(placeholder)}"${requis ? " required" : ""}></label>`;

export const zone = (name, label, valeur = "", { lignes = 2, placeholder = "" } = {}) =>
  `<label>${txt(label)} <textarea class="champ" name="${name}" rows="${lignes}"` +
  `${placeholder ? ` placeholder="${txt(placeholder)}"` : ""}>${txt(valeur ?? "")}</textarea></label>`;

/** `options` : [[valeur, libellé]] ; `vide` = libellé d'une option "" en tête ; `attrs` va sur le label. */
export const select = (name, label, options, choisi, { vide = null, attrs = "" } = {}) =>
  `<label ${attrs}>${txt(label)} <select class="champ" name="${name}">` +
  `${vide !== null ? `<option value="">${txt(vide)}</option>` : ""}` +
  options.map(([v, l]) => `<option value="${txt(String(v))}"${String(v) === String(choisi ?? "") ? " selected" : ""}>${txt(l)}</option>`).join("") +
  `</select></label>`;

export const caseACocher = (name, label, coche) =>
  `<label class="case-a-cocher"><input type="checkbox" name="${name}"${coche ? " checked" : ""}> ${txt(label)}</label>`;

export const listeChoix = (id, valeurs) =>
  `<datalist id="${id}">${valeurs.map((v) => `<option value="${txt(v)}">`).join("")}</datalist>`;

export const membresOptions = (etat) => etat.membres.map((m) => [m.prenom, m.prenom]);
export const comptesOptions = (etat) => etat.comptes.map((c) => [c.id, c.nom]);

/** Lit un formulaire en objet : chaînes rognées, "" → null, Number() sur `nombres`, booléens sur `booleens`. */
export function lire(form, { nombres = [], booleens = [] } = {}) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (booleens.includes(el.name)) { out[el.name] = el.checked; continue; }
    const v = String(el.value ?? "").trim();
    if (nombres.includes(el.name)) out[el.name] = v === "" ? null : Number(v);
    else out[el.name] = v === "" ? null : v;
  }
  return out;
}
