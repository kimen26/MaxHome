// Ajouter une charge, et la carte « Terminées » de Réglages · Charges (D-043). Demande de Yann :
// pouvoir créer une ligne (nom + catégorie), et pouvoir en arrêter une sans la perdre — elle
// descend dans « Terminées », repliée, plutôt que de disparaître (D-024 : l'écran s'assemble,
// il ne redessine pas ; ce fichier ne fait que ça pour ui-charges-ref.js, trop chargé sinon).
// Le montant se règle ensuite dans la rangée (champ déjà existant) : la feuille d'ajout ne
// demande que ce qui ne se corrige pas d'un tap plus tard.

import { $, txt, toast, ouvrirFeuille, fermerFeuille, confirmer } from "../socle/ui-base.js";
import { choixDetaille, marquerChoix } from "../socle/blocs.js";
import { champ, select, lire } from "../socle/blocs-form.js";
import { CATEGORIES } from "./ui-mois-charges.js";
import { REGLES_COURANTES, optionsRegle } from "./repartition.js";

/** Catégories proposées au select : la liste connue, plus celles déjà en usage qui n'y sont
 *  pas (une charge d'une catégorie ancienne ne doit pas obliger à en choisir une nouvelle). */
const categoriesProposees = (charges) => [
  ...CATEGORIES,
  ...new Set(charges.map((c) => c.categorie).filter((k) => !CATEGORIES.includes(k))),
];

const dejaPrise = (charges, libelle) => charges.some((c) =>
  c.actif !== false && c.libelle.trim().toLowerCase() === libelle.trim().toLowerCase());

export function creerAjoutCharges(api, etat, cb) {
  function html() {
    const cats = categoriesProposees(etat.charges);
    return `<form class="pile reglages" id="form-ajout-charge" novalidate>
      <div class="detail-tete"><h2>Ajouter une charge</h2>
        <button type="button" class="btn-lien" data-fermer-ajout>Fermer</button></div>
      ${champ("libelle", "Nom", { requis: true, placeholder: "ex. Assurance auto" })}
      ${select("categorie", "Catégorie", cats.map((k) => [k, k]), "Autre")}
      <fieldset class="bloc-reglage"><legend class="etiquette">Qui paie quoi</legend>
        ${choixDetaille(optionsRegle(etat, {}, REGLES_COURANTES), "proport", { attr: "regle", etiquette: "Qui paie quoi" })}
      </fieldset>
      <div class="detail-actions">
        <button type="submit" class="btn btn-bleu grandir">Ajouter</button>
      </div>
    </form>`;
  }

  function ouvrir() {
    ouvrirFeuille(html());
    brancher();
  }

  function brancher() {
    const form = $("#form-ajout-charge");
    let regle = "proport";
    form.querySelector("[data-fermer-ajout]").addEventListener("click", fermerFeuille);
    for (const b of form.querySelectorAll("[data-regle]")) {
      b.addEventListener("click", () => { regle = b.dataset.regle; marquerChoix(b); });
    }
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const v = lire(form);
      if (!v.libelle) { toast("Le nom de la charge est vide."); return; }
      if (dejaPrise(etat.charges, v.libelle)) { toast(`« ${v.libelle} » existe déjà.`); return; }
      const ordre = Math.max(0, ...etat.charges.map((c) => c.ordre ?? 0)) + 10;
      try {
        const cree = await api.creerCharge({
          libelle: v.libelle, categorie: v.categorie, regle, type: regle, cle_pct: null, payeur: null,
          ponctuel: false, actif: true, montant_defaut: null, defaut_dernier: true, ordre,
        });
        etat.charges = [...etat.charges, cree];
        fermerFeuille();
        cb.recalculer();
        cb.rendre();
        toast(`${cree.libelle} ajoutée.`);
      } catch (e) { cb.echec(e); }
    });
  }

  return { ouvrir };
}

// ---------- carte « Terminées » ----------
export function creerCarteTerminees(api, etat, cb) {
  let ouverte = false;

  const terminees = () => etat.charges.filter((c) => c.actif === false && !c.ponctuel);

  /** Ligne d'une charge terminée : gris lisible (--texte-2, jamais l'opacité — contraste ≥
   *  4.5:1), sa catégorie, un bouton « Reprendre ». Pas de rangée éditable : elle ne se règle
   *  plus tant qu'elle n'est pas reprise. */
  const ligne = (c) => `<div class="charge-terminee">
      <div class="ct-corps"><span class="ct-nom">${txt(c.libelle)}</span>
        <span class="ct-categorie">${txt(c.categorie)}</span></div>
      <button type="button" class="btn" data-reprendre="${c.id}">Reprendre</button>
    </div>`;

  function html() {
    const liste = terminees();
    if (!liste.length) return "";
    return `<div class="carte carte-terminees">
      <button type="button" class="ct-entete" data-plier-terminees aria-expanded="${ouverte}">
        <span>Terminées (${liste.length})</span><span class="ct-voir">${ouverte ? "Replier" : "Voir"}</span>
      </button>
      <div class="ct-liste"${ouverte ? "" : " hidden"}>${liste.map(ligne).join("")}</div>
    </div>`;
  }

  function brancher(racine) {
    racine.querySelector("[data-plier-terminees]")?.addEventListener("click", () => {
      ouverte = !ouverte;
      cb.rendre();
    });
    for (const b of racine.querySelectorAll("[data-reprendre]")) {
      b.addEventListener("click", () => reprendre(Number(b.dataset.reprendre)));
    }
  }

  async function reprendre(id) {
    const c = etat.charges.find((x) => x.id === id);
    try {
      await api.majCharge(id, { actif: true });
      etat.charges = etat.charges.map((x) => (x.id === id ? { ...x, actif: true } : x));
      cb.recalculer();
      cb.rendre();
      toast(`${c.libelle} reprise.`);
    } catch (e) { cb.echec(e); }
  }

  return { html, brancher };
}

/** Confirmation avant de terminer une charge (ui-charge-feuille.js) : dit ce qui reste acquis
 *  (les mois passés) et ce qui s'arrête (elle ne sera plus proposée). */
export const confirmerFinDeCharge = (libelle) => confirmer(
  `${libelle} ne sera plus proposée les mois suivants. Les mois passés gardent leur montant.`,
  { ok: "Terminer" });
