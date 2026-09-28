// Écran « Réglages · Charges » : une RANGÉE par charge, où tout se règle sur place (D-042).
// Yann : « tu perds une place de ouf, toutes les infos d'une charge doivent tenir sur une
// ligne ». La liste en lecture seule de D-040 §3 demandait un tap et une feuille pour passer de
// 50/50 à Prorata ; ici chaque geste écrit tout de suite, comme les montants de l'écran Mois :
//   - le nom ouvre la feuille (ui-charge-feuille.js) pour ce qui est rare : nom, catégorie,
//     clé fixe, un seul paie, archiver ;
//   - le partage est UN bouton qui dit sa valeur en mots et bascule 50/50 ↔ Prorata ;
//   - le montant habituel : tapé = « Toujours le même », vidé = on reprend le dernier ;
//   - « va sur » : le compte où va l'argent (compte-charge.js).
// Pas d'affichage optimiste : l'écran montre ce que la base a accepté.

import { euros } from "./calc.js";
import { $, txt, toast } from "../socle/ui-base.js";
import { select, enEuros } from "../socle/blocs-form.js";
import { categoriesPresentes } from "./ui-mois-charges.js";
import { libelleRegle, detailRegle, regleBasculee, motPartage } from "./repartition.js";
import { montantHabituel, montantNote, champsDuMontant, montantInchange } from "./habituel.js";
import { AIDE_SANS_COMPTE, aAutreCompte, compteDeCharge, optionsCompte, nomDuCompte, choisirCompte } from "./compte-charge.js";
import { creerAjoutCharges, creerCarteTerminees } from "./ui-charges-ajout.js";

export function creerUiChargesRef(api, etat, cb) {
  // Les charges ponctuelles (« Ligne de ce mois ») n'ont ni montant habituel ni compte : hors d'ici.
  const actives = () => etat.charges.filter((c) => c.actif !== false && !c.ponctuel);
  const chargeDe = (id) => etat.charges.find((c) => c.id === id);
  const ouvrirFeuille = (id) => cb.ouvrirReglagesCharge(id, { enFeuille: true, apres: rendre });

  // Le bouton d'ajout et la carte Terminées se rafraîchissent comme cet écran : `cb.rendre`
  // leur est passé tel quel, `rendre` ci-dessous appelle l'un ET l'autre.
  const ajout = creerAjoutCharges(api, etat, { ...cb, rendre });
  const finies = creerCarteTerminees(api, etat, { ...cb, rendre });

  function rendre() {
    const parCat = {};
    for (const c of actives()) (parCat[c.categorie] ??= []).push(c);
    const corps = $("#charges-ref-corps");
    corps.innerHTML = `${carteExplication()}
      <div class="grille-charges-ref">${categoriesPresentes(parCat).map((k) => carteCategorie(k, parCat[k])).join("")}</div>
      <button type="button" class="btn-tirets btn-ajouter-charge" data-ajouter-charge>+ Ajouter une charge</button>
      ${finies.html()}`;
    brancher(corps);
  }

  const carteExplication = () => `<div class="carte-explication">
      <p>Touche <strong>50/50</strong> ou <strong>Prorata</strong> pour basculer (prorata ce mois :
      ${txt(detailRegle("proport", etat))}). Montant tapé : toujours le même ; en italique : le dernier, repris.</p>
      ${aAutreCompte(etat.comptes) ? "" : `<p>${txt(AIDE_SANS_COMPTE)}</p>`}
    </div>`;

  const carteCategorie = (nom, items) => `<div class="carte carte-charges-ref">
      <div class="carte-tete"><span>${txt(nom.toUpperCase())}</span></div>
      ${items.map(rangee).join("")}
    </div>`;

  // `.ligne-charge-ref` reste la classe du bouton qui ouvre la feuille : les recettes la touchent.
  // Le montant est rempli par accorderChamp() au branchement, seul endroit qui le décide.
  const rangee = (c) => `<div class="rang-charge" data-regle="${txt(c.regle)}">
      <button type="button" class="ligne-charge-ref" data-reglages="${c.id}">${txt(c.libelle)}</button>
      ${select("compte", "va sur", optionsCompte(etat.comptes), compteDeCharge(c, etat.recurrents),
    { attrs: `class="rc-compte" data-compte="${c.id}"` })}
      ${boutonPartage(c)}
      <input class="champ champ-montant rc-montant" inputmode="decimal" data-montant="${c.id}"
             aria-label="${txt(`Montant habituel : ${c.libelle}`)}">
    </div>`;

  /** Le mot ET le fond disent la règle (jamais la couleur seule) ; une règle rare ouvre la feuille. */
  function boutonPartage(c) {
    const suivante = regleBasculee(c.regle);
    const mot = motPartage(c);
    const aria = suivante
      ? `Partage : ${mot}. Toucher pour passer en ${libelleRegle(suivante)}`
      : `Partage : ${libelleRegle(c.regle)}, ${detailRegle(c.regle, etat, c)}. Toucher pour le régler`;
    return `<button type="button" class="rc-partage ${suivante ? `regle-${c.regle}` : "regle-rare"}"
      data-partage="${c.id}" aria-label="${txt(aria)}">${txt(mot)}</button>`;
  }

  /** Montant noté en valeur ; sinon champ vide et, en indice, ce qu'on reprendra (le dernier). */
  function accorderChamp(el, c) {
    const note = montantNote(c);
    const indice = montantHabituel(c, etat.derniers);
    el.value = enEuros(note);
    el.placeholder = indice == null ? "à noter" : enEuros(indice);
    el.classList.toggle("pos", note > 0);
  }

  function brancher(corps) {
    corps.querySelector("[data-ajouter-charge]").addEventListener("click", () => ajout.ouvrir());
    finies.brancher(corps);
    for (const b of corps.querySelectorAll("[data-reglages]")) {
      b.addEventListener("click", () => ouvrirFeuille(Number(b.dataset.reglages)));
    }
    for (const b of corps.querySelectorAll("[data-partage]")) b.addEventListener("click", () => basculerPartage(b));
    for (const el of corps.querySelectorAll("[data-montant]")) {
      accorderChamp(el, chargeDe(Number(el.dataset.montant)));
      el.addEventListener("change", () => changerMontant(el));
    }
    for (const l of corps.querySelectorAll("[data-compte]")) {
      l.querySelector("select").addEventListener("change", (e) => changerCompte(Number(l.dataset.compte), e.target.value));
    }
  }

  // ---------- écritures ----------
  /** Écrit la charge puis recalcule : la règle change la part de chacun sur l'écran Mois. */
  async function ecrireCharge(c, champs, message) {
    await api.majCharge(c.id, champs);
    etat.charges = etat.charges.map((x) => (x.id === c.id ? { ...x, ...champs } : x));
    cb.recalculer();
    toast(message);
  }

  async function basculerPartage(b) {
    const c = chargeDe(Number(b.dataset.partage));
    const regle = regleBasculee(c.regle);
    // Clé fixe, un seul paie : la feuille, qui demande la part ou le payeur.
    if (!regle) { ouvrirFeuille(c.id); return; }
    const garderFocus = document.activeElement === b;
    b.disabled = true; // un double toucher n'écrit pas deux bascules croisées
    try { await ecrireCharge(c, { regle }, `${c.libelle} : ${libelleRegle(regle)}`); }
    catch (e) { cb.echec(e); }
    rendre();
    if (garderFocus) $(`#charges-ref-corps [data-partage="${c.id}"]`)?.focus();
  }

  async function changerMontant(el) {
    const c = chargeDe(Number(el.dataset.montant));
    let champs;
    try { champs = champsDuMontant(el.value); }
    catch { toast(`Montant illisible : « ${el.value.trim()} ».`, true); accorderChamp(el, c); return; }
    if (!montantInchange(c, champs)) {
      const message = champs.defaut_dernier
        ? `${c.libelle} : on reprendra le dernier montant.`
        : `${c.libelle} : ${euros(champs.montant_defaut)} chaque mois.`;
      try { await ecrireCharge(c, champs, message); } catch (e) { cb.echec(e); }
    }
    // Sans redessiner l'écran : le focus reste où il est, on enchaîne les montants au clavier.
    accorderChamp(el, chargeDe(c.id));
  }

  async function changerCompte(id, valeur) {
    const c = chargeDe(id);
    const compteId = valeur ? Number(valeur) : null;
    try {
      if (await choisirCompte(api, etat, c, compteId)) {
        toast(`${c.libelle} : va sur ${nomDuCompte(etat.comptes, compteId)}.`);
        // Le rechargement crée le virement du mois s'il manque, et redessine cet écran.
        if (cb.rafraichir) { await cb.rafraichir("budget"); return; }
      }
    } catch (e) { cb.echec(e); }
    rendre();
  }

  return { rendre };
}
