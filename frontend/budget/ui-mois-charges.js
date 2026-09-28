// Partie « charges » de l'écran Mois : une carte par catégorie, une colonne sur téléphone, deux
// au-dessus de 640 px (D-039). Chaque ligne : libellé entier, dessous sa répartition et, en
// ambre et en toutes lettres, « à saisir » ou l'écart au montant habituel. En tête d'écran,
// tant qu'il manque des montants, un bandeau le dit et propose de les remplir d'un geste avec
// les montants habituels (D-040, habituel.js). Le réglage d'une charge vit dans sa feuille
// (ui-charge-feuille.js), ouverte au tap sur le libellé.

import { euros, versCentimes, regleEffective } from "./calc.js";
import { $, $$, txt, toast } from "../socle/ui-base.js";
import { enEuros } from "../socle/blocs-form.js";
import { REGLES_COURANTES, libelleRegle, detailRegle } from "./repartition.js";
import { montantHabituel } from "./habituel.js";
import { creerFeuilleCharge } from "./ui-charge-feuille.js";

export const CATEGORIES = ["Logement", "Max", "Épargne", "Alimentation", "Impôts", "Banque", "Autre"];

/** Catégories à afficher, dans l'ordre de CATEGORIES puis les autres par ordre alphabétique :
 *  une charge dont la catégorie n'est pas dans la liste ne disparaît pas de l'écran. */
export const categoriesPresentes = (parCat) => [
  ...CATEGORIES.filter((k) => parCat[k]),
  ...Object.keys(parCat).filter((k) => !CATEGORIES.includes(k)).sort((a, b) => a.localeCompare(b, "fr")),
];

export function creerUiMoisCharges(api, etat, cb) {
  const ligne = (id) => etat.lignes[id];
  const montantDe = (id) => ligne(id)?.montant_centimes ?? 0;
  const saisie = (id) => ligne(id) !== undefined;

  const habituel = (c) => montantHabituel(c, etat.derniers);

  // Les charges ponctuelles (« Ligne de ce mois ») vivent dans la carte « Ce mois seulement »
  // de ui-mouvements.js, pas dans la grille par catégorie.
  // Deux notions (D-043) : PROPOSÉES = actives, celles qu'on peut encore saisir ce mois-ci ou
  // remplir d'un geste. AFFICHÉES = actives + une charge terminée qui a déjà une ligne ce mois —
  // un mois passé garde ce qui a été payé, sinon son montant compterait dans le total sans être
  // visible nulle part. Une terminée SANS ligne ce mois n'apparaît plus du tout ici.
  const proposees = () => etat.charges.filter((c) => c.actif !== false && !c.ponctuel);
  const affichees = () => etat.charges.filter((c) => !c.ponctuel
    && (c.actif !== false || saisie(c.id)));

  // ---------- rendu ----------
  function rendre() {
    const liste = affichees();
    const parCat = {};
    for (const c of liste) (parCat[c.categorie] ??= []).push(c);
    $("#mois-categories").innerHTML = categoriesPresentes(parCat).map((k) => {
      const items = parCat[k];
      const remplies = items.filter((c) => montantDe(c.id)).length;
      const complet = remplies === items.length;
      return `<div class="carte carte-charges">
        <div class="carte-tete${complet ? " complete" : ""}">
          <span>${txt(k.toUpperCase())}</span><span class="mono">${remplies}/${items.length}</span>
        </div>
        ${items.map(ligneCharge).join("")}
      </div>`;
    }).join("");
    // PROPOSÉES seulement (jamais une terminée) : « à remplir » et « montants habituels »
    // ne portent que sur ce qui reste à saisir pour de vrai ce mois-ci.
    rendreACompleter(proposees());
    brancher();
  }

  /** Bandeau de tête : ce qui manque ce mois-ci, et le geste qui le remplit. Vide si complet. */
  function rendreACompleter(liste) {
    const manquantes = liste.filter((c) => !saisie(c.id));
    const remplissables = manquantes.filter((c) => habituel(c) != null);
    const zone = $("#mois-a-completer");
    if (!manquantes.length) { zone.innerHTML = ""; return; }
    const n = manquantes.length;
    const aTaper = n - remplissables.length;
    zone.innerHTML = `<div class="carte a-completer">
      <p><strong>${n} charge${n > 1 ? "s" : ""} sans montant ce mois-ci.</strong>
      Les virements ne sont justes qu'une fois toutes les charges remplies.</p>
      ${remplissables.length ? `<button type="button" class="btn btn-bleu" data-remplir>
        Remplir avec les montants habituels (${remplissables.length})</button>` : ""}
      ${aTaper ? `<p class="sous">${aTaper} à taper à la main : en ambre plus bas.</p>` : ""}
    </div>`;
    zone.querySelector("[data-remplir]")?.addEventListener("click", () => remplir(remplissables));
  }

  async function remplir(charges) {
    const lignes = charges.map((c) => ({ charge_id: c.id, montant_centimes: habituel(c) }));
    try {
      await api.majLignes(etat.annee, etat.mois, lignes);
      for (const l of lignes) etat.lignes[l.charge_id] = { montant_centimes: l.montant_centimes, regle: null };
      cb.recalculer();
      cb.rendreMois();
      toast(`${lignes.length} montant${lignes.length > 1 ? "s" : ""} rempli${lignes.length > 1 ? "s" : ""}. Corrige ceux qui ont changé.`);
    } catch (e) { cb.echec(e); }
  }

  function ligneCharge(c) {
    const m = montantDe(c.id);
    const hab = habituel(c);
    const manque = !saisie(c.id);
    // Écart dit seulement pour un montant « Toujours le même » : un montant qui change chaque
    // mois diffère du précédent par nature.
    const differe = !manque && !c.defaut_dernier && hab !== null && m !== hab;
    const regle = regleEffective(c, ligne(c.id));
    // L'écart se DIT (« habituel −1 200,00 € »), jamais par une pastille de couleur seule. Une
    // règle rare dit aussi la part de chacun : « Clé fixe » seul ne dit pas qui paie quoi.
    const nomRegle = REGLES_COURANTES.includes(regle)
      ? libelleRegle(regle) : `${libelleRegle(regle)} (${detailRegle(regle, etat, c)})`;
    const infos = [
      `${nomRegle}${regle !== c.regle ? " ce mois" : ""}`,
      manque ? "à saisir" : "",
      differe ? `habituel ${euros(hab)}` : "",
    ].filter(Boolean).join(" · ");
    return `<div class="mois-charge${manque ? " a-faire" : ""}${differe ? " differe" : ""}" data-charge="${c.id}">
      <button type="button" class="mc-libelle" data-reglages="${c.id}">
        <span class="mc-nom">${txt(c.libelle)}</span><span class="mc-infos">${txt(infos)}</span>
      </button>
      <input class="champ champ-montant${m > 0 ? " pos" : ""}${manque ? " oubli" : ""}" inputmode="decimal"
             aria-label="Montant de ce mois : ${txt(c.libelle)}"
             data-montant="${c.id}" value="${saisie(c.id) ? enEuros(m) : ""}"
             placeholder="${hab !== null ? enEuros(hab) : "0,00"}">
    </div>`;
  }

  // ---------- écritures ----------
  async function ecrireLigne(chargeId, champs) {
    try {
      await api.majLigne(etat.annee, etat.mois, chargeId, champs);
      etat.lignes[chargeId] = { ...(etat.lignes[chargeId] ?? { montant_centimes: 0, regle: null }), ...champs };
      cb.recalculer();
      cb.rendreMois();
    } catch (e) { cb.echec(e); }
  }

  function brancher() {
    for (const el of $$("#mois-categories [data-montant]")) {
      el.addEventListener("change", async () => {
        const id = Number(el.dataset.montant);
        if (!el.value.trim()) {
          try {
            await api.supprimerLigne(etat.annee, etat.mois, id);
            delete etat.lignes[id];
            cb.recalculer();
            cb.rendreMois();
          } catch (e) { cb.echec(e); }
          return;
        }
        try { await ecrireLigne(id, { montant_centimes: versCentimes(el.value) }); }
        catch (e) { cb.echec(e); }
      });
    }
    for (const b of $$("#mois-categories [data-reglages]")) {
      b.addEventListener("click", () => ouvrirReglages(Number(b.dataset.reglages)));
    }
  }

  // ---------- réglages d'une charge : feuille dédiée (ui-charge-feuille.js) ----------
  const feuille = creerFeuilleCharge(api, etat, cb, CATEGORIES);
  const ouvrirReglages = (id, options) => feuille.ouvrir(id, options);
  const fermerReglages = () => feuille.fermer();

  return { rendre, fermerReglages, ouvrirReglages };
}
