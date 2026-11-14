// Page publique d'un sondage de date : rendu PUR (aucun DOM global, aucun réseau) et sélection pure.
// Testé dans tests/test_sondage_page.mjs. Les dates sont des chaînes AAAA-MM-JJ locales (L-004).
import { txt } from "../socle/ui-base.js";
import { depuisIso, decalerJours } from "../agenda/calendrier.js";

export const PRENOM_MAX = 40;
export const MSG_TERMINE = "Ce sondage est terminé.";
const JOURS_COURT = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MOIS_COURT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « sam. 21 nov. » */
export function libelleJour(iso) {
  const d = depuisIso(iso);
  return `${JOURS_COURT[d.getDay()]} ${d.getDate()} ${MOIS_COURT[d.getMonth()]}`;
}

/** Lundi de la semaine d'un jour (dimanche = fin de semaine). */
function lundiDe(iso) {
  const n = (depuisIso(iso).getDay() + 6) % 7;
  return decalerJours(iso, -n);
}

/** Jours regroupés par semaine lun→dim, dans l'ordre : [{ lundi, jours: [...] }]. */
export function grouperParSemaine(jours) {
  const triees = [...jours].sort((a, b) => a.jour.localeCompare(b.jour));
  const semaines = [];
  for (const j of triees) {
    const lundi = lundiDe(j.jour);
    const derniere = semaines[semaines.length - 1];
    if (derniere && derniere.lundi === lundi) derniere.jours.push(j);
    else semaines.push({ lundi, jours: [j] });
  }
  return semaines;
}

/** Ajoute ou retire un jour de la sélection (copie triée, jamais de mutation). Un jour pris est refusé. */
export function basculer(selection, jour, jours) {
  const cible = jours.find((j) => j.jour === jour);
  if (!cible || !cible.libre) return [...selection];
  const sans = selection.filter((s) => s !== jour);
  return (sans.length === selection.length ? [...sans, jour] : sans).sort();
}

/** On ne garde que les jours encore libres (le sondage a pu changer depuis le dernier vote). */
export const garderLibres = (selection, jours) => selection.filter((s) => jours.some((j) => j.jour === s && j.libre));

export const prenomNettoye = (p) => String(p ?? "").replace(/\s+/g, " ").trim();
export const peutEnvoyer = (selection, prenom) => selection.length > 0 && prenomNettoye(prenom).length > 0;

const etiquettes = (j) => [j.ferie && `Férié : ${j.ferie}`, j.vacances && `Vacances : ${j.vacances}`].filter(Boolean);

function rendreJour(j, etat, votes) {
  const notes = etiquettes(j).map((e) => `<span class="sd-note">${txt(e)}</span>`).join("");
  const prenoms = (votes ?? []).filter((v) => v.jours.includes(j.jour)).map((v) => v.prenom);
  const qui = prenoms.length
    ? `<span class="sd-qui">${prenoms.length} ${prenoms.length > 1 ? "réponses" : "réponse"} : ${txt(prenoms.join(", "))}</span>` : "";
  if (!j.libre) {
    return `<li class="sd-jour sd-pris"><span class="sd-date">${txt(libelleJour(j.jour))}</span><span class="sd-etat">pris</span>${notes}${qui}</li>`;
  }
  const coche = etat.selection.includes(j.jour);
  return `<li><button type="button" class="sd-jour sd-libre${coche ? " sd-coche" : ""}" data-jour="${txt(j.jour)}" aria-pressed="${coche}">`
    + `<span class="sd-case" aria-hidden="true">${coche ? "✓" : ""}</span><span class="sd-date">${txt(libelleJour(j.jour))}</span>`
    + `<span class="sd-etat">${coche ? "ça me va" : "libre"}</span>${notes}${qui}</button></li>`;
}

function rendreRecap(etat) {
  const liste = etat.selection.map((s) => libelleJour(s)).join(", ");
  return `<section class="sd-merci" role="status"><h2>Merci, c'est noté !</h2>`
    + `<p>${txt(etat.prenom)}, tu as choisi : ${txt(liste)}.</p>`
    + `<button type="button" class="sd-bouton sd-second" data-action="modifier">Modifier ma réponse</button></section>`;
}

function rendreFormulaire(etat) {
  const ok = peutEnvoyer(etat.selection, etat.prenom) && !etat.envoi;
  const erreur = etat.erreur ? `<p class="sd-erreur" role="alert">${txt(etat.erreur)}</p>` : "";
  return `<form class="sd-form" data-formulaire>`
    + `<label for="sd-prenom">Ton prénom</label>`
    + `<input id="sd-prenom" name="prenom" type="text" maxlength="${PRENOM_MAX}" autocomplete="given-name" value="${txt(etat.prenom)}">`
    + erreur
    + `<button type="submit" class="sd-bouton sd-envoyer" data-action="envoyer"${ok ? "" : " disabled"}>${etat.envoi ? "Envoi…" : "Envoyer"}</button>`
    + `</form>`;
}

/**
 * Page complète. `donnees` = retour de sondage_public (null : sondage inconnu ou terminé).
 * `etat` = { selection: [jours], prenom, envoye, envoi, erreur }.
 */
export function rendreSondage(donnees, etat = {}) {
  if (!donnees) return `<p class="sd-vide sd-termine">${txt(MSG_TERMINE)}</p>`;
  const e = { selection: [], prenom: "", envoye: false, envoi: false, erreur: "", ...etat };
  const mot = donnees.message ? `<p class="sd-mot">${txt(donnees.message)}</p>` : "";
  const votes = donnees.reponses_visibles ? (donnees.votes ?? []) : null;
  const semaines = grouperParSemaine(donnees.jours ?? []).map((s) =>
    `<section class="sd-semaine"><h2>Semaine du ${txt(libelleJour(s.lundi))}</h2><ul class="sd-jours">`
    + s.jours.map((j) => rendreJour(j, e, votes)).join("") + `</ul></section>`).join("");
  const aide = e.envoye ? "" : `<p class="sd-aide">Touche les jours qui te vont.</p>`;
  return `<header><h1>${txt(donnees.titre)}</h1>${mot}</header>${e.envoye ? rendreRecap(e) : aide}`
    + `<div class="sd-calendrier${e.envoye ? " sd-fige" : ""}">${semaines}</div>${e.envoye ? "" : rendreFormulaire(e)}`;
}
