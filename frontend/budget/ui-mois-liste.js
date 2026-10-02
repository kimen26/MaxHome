// Liste unifiée « À faire » / « Fait » de l'écran Mois (D-052 : chaque virement ou charge à
// régler n'apparaît plus qu'UNE fois — avant, un même virement pouvait se lire dans le bloc
// « Virements à faire » groupé par trajet, dans la liste de mouvements, ET dans sa catégorie de
// charges, chacun avec sa propre case). Rend dans `#mvts-a-faire` / `#mvts-faits` (plus de bloc
// séparé `#groupes-virements` ni grille `#mois-categories` : voir ui-mouvements.js).
//
// Sélecteur segmenté Destinataires (défaut) | Catégories, mémorisé par appareil (même clé que
// l'ancien sélecteur de ui-mois-charges.js) :
//  - Destinataires (Yann : « regroupe par compte vers où ça part ») : un groupe par trajet
//    (De → Vers, groupes-virements.js), sa case `.gv-groupe` valide tout le groupe (même cycle
//    qu'avant) ; replié par défaut, le tap sur la ligne déplie ses éléments (`.mois-charge`),
//    chacun avec sa propre case cycle ;
//  - Catégories : les lignes de charge groupées par catégorie (groupes-categories.js), les
//    mouvements seuls dans un groupe « Virements » toujours en tête.
// Une ligne sans montant saisi ne propose ni case ni saisie inline (le montant se tape dans la
// feuille de réglage, ouverte au tap) : elle dit « Montant à saisir ».

import { euros } from "./calc.js";
import { $, txt, toast } from "../socle/ui-base.js";
import { caseCycle } from "../socle/blocs.js";
import { brancherCycles } from "../socle/blocs-cycle.js";
import { construireGroupes, preparerBasculeGroupe } from "./groupes-virements.js";
import { construireGroupesCategories, CLE_VIREMENTS } from "./groupes-categories.js";
import { SANS_PRENOM, valeurAffichee, preparerBascule as preparerBasculeLigne, appliquerBascule as appliquerBasculeLigne,
  annulerBascule as annulerBasculeLigne, ecrireBascule as ecrireBasculeLigne } from "./coche-ligne.js";
import { libelleACompleter } from "./libelle-virement.js";
import { htmlBlocLibelle, brancherBlocLibelle } from "./bloc-libelle-virement.js";

const CLE_VUE = "maxhome.budget.vueCharges";
const lireVue = () => { try { return localStorage.getItem(CLE_VUE) === "categories" ? "categories" : "destinataires"; } catch { return "destinataires"; } };
const ecrireVue = (v) => { try { localStorage.setItem(CLE_VUE, v); } catch { /* stockage indisponible : pas mémorisé, pas bloquant */ } };

/** jj/mm d'une date ISO — même calcul que jourMois() de ui-mouvements.js. */
const jourMois = (iso) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function creerUiMoisListe(api, etat, cb, { basculerMouvement }) {
  let vue = lireVue();
  // Groupes dépliés : repliés par défaut à chaque session (pas mémorisé, comme une boîte mail).
  const deplies = new Set();

  const [p1] = etat.membres.map((m) => m.prenom);
  const ligneDe = (id) => etat.lignes[id];
  const compteDe = (id) => etat.comptes.find((c) => c.id === id);

  /** Une ligne de charge sans montant ne peut pas encore se valider (règle 3 du brief) ; un
   *  mouvement a toujours un montant (théorique ou figé), jamais « à saisir ». */
  const manqueMontant = (e) => e.type === "ligne" && ligneDe(e.id) === undefined;

  function htmlSelecteurVue() {
    const options = [["destinataires", "Destinataires"], ["categories", "Catégories"]];
    return `<div class="segment segment-vue-charges" role="radiogroup" aria-label="Regrouper par">
      ${options.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === vue}"
        class="${v === vue ? "actif" : ""}" data-vue-charges="${v}">${txt(l)}</button>`).join("")}
    </div>`;
  }

  /** Élément déplié (ligne de charge ou mouvement) — même gabarit `.mois-charge` qu'avant
   *  (D-024 : pas un second gabarit pour la même information), sans champ montant inline.
   *  Montant toujours affiché en POSITIF (D-053) : le trajet (De → Vers) dit déjà le sens du
   *  virement, un signe négatif en plus n'ajoute rien et mélangeait + et − dans la même liste. */
  function ligneElement(e) {
    const manque = manqueMontant(e);
    const fait = e.fait_le ?? null;
    const droite = manque
      ? `<span class="mc-manque">Montant à saisir</span>`
      : `<span class="mono mvt-montant${e.valeur !== null ? " pale" : ""}">${euros(Math.abs(e.montant_centimes))}</span>`;
    return `<div class="mois-charge ml-element${manque ? " a-faire" : ""}${e.valeur !== null ? " fait" : ""} cliquable"
        data-ml-type="${e.type}" data-id="${e.id}">
      ${manque ? '<span class="case case-cycle-vide" aria-hidden="true"></span>'
        : caseCycle({ id: e.id, valeur: valeurAffichee(e.valeur), p1, titre: e.libelle, attr: `cycle-${e.type}` })}
      <div class="mc-libelle"><span class="mc-nom">${txt(e.libelle)}</span>
        ${fait ? `<span class="mc-fait">✓ ${[e.fait_par, jourMois(fait)].filter(Boolean).join(" · ")}</span>` : ""}
      </div>
      ${droite}
    </div>`;
  }

  /** Tap sur un élément déplié (hors case) : la ligne de charge ouvre toujours sa feuille de
   *  réglage (montant manquant ou pas — même geste), le mouvement son détail. */
  function ouvrirElement(type, id) {
    if (type === "ligne") cb.ouvrirReglagesCharge(id);
    else cb.ouvrirDetailMouvement(id);
  }

  // ---------- vue Destinataires (groupes-virements.js) ----------
  function mouvementDuGroupe(g) {
    return etat.mouvements.find((m) => m.compte_vers === g.vers
      && (m.compte_de ?? (m.qui ? `perso:${m.qui}` : null)) === g.de);
  }

  function ligneGroupeTrajet(g) {
    const valeur = g.fait ? g.prenom : null;
    const suffixeFait = g.fait ? ` · ✓${g.prenom !== SANS_PRENOM ? ` ${txt(g.prenom)}` : ""}` : "";
    const aCompleter = libelleACompleter(mouvementDuGroupe(g), compteDe(g.vers));
    const deplie = deplies.has(g.cle);
    return `<div class="ml-groupe${deplie ? " ouvert" : ""}">
      <div class="mvt gv-groupe cliquable" data-ml-groupe="${txt(g.cle)}">
        ${caseCycle({ id: g.cle, valeur: valeurAffichee(valeur), p1, titre: `${g.libelleDe} vers ${g.libelleVers}` })}
        <div class="mvt-corps">
          <span class="mvt-titre">${txt(g.libelleDe)} → ${txt(g.libelleVers)}</span>
          <span class="mvt-trajet">${g.lignes.length} ligne${g.lignes.length > 1 ? "s" : ""}${suffixeFait}</span>
          ${aCompleter ? `<span class="mvt-note gv-libelle-alerte">Libellé à compléter</span>` : ""}
        </div>
        <div class="mvt-droite"><span class="mono mvt-montant">${euros(Math.abs(g.total))}</span></div>
      </div>
      ${deplie ? `<div class="ml-sous-lignes">
        ${htmlBlocLibelle(mouvementDuGroupe(g), compteDe(g.vers))}
        ${g.lignes.map(ligneElement).join("")}
      </div>` : ""}
    </div>`;
  }

  function rendreDestinataires() {
    const groupes = construireGroupes(etat);
    const aFaire = groupes.filter((g) => !g.fait);
    const faits = groupes.filter((g) => g.fait);
    // Somme des valeurs ABSOLUES (D-053) : un virement au commun (crédit, positif) et une charge
    // envoyée ailleurs (débit, négatif) sont deux montants à déplacer, jamais à compenser.
    const totalAFaire = aFaire.reduce((s, g) => s + Math.abs(g.total), 0);
    const totalFaits = faits.reduce((s, g) => s + Math.abs(g.total), 0);
    cb.majEnTeteAFaire(aFaire.length, totalAFaire);
    $("#mvts-a-faire").innerHTML = aFaire.length ? aFaire.map(ligneGroupeTrajet).join("")
      : `<p class="vide">Rien à faire ce mois-ci.</p>`;
    $("#mvts-faits").innerHTML = faits.map(ligneGroupeTrajet).join("");
    return { n: faits.length, total: totalFaits };
  }

  // ---------- vue Catégories (groupes-categories.js) ----------
  // Une seule clé de pli par catégorie (pas une par À faire/Fait) : déplier « Logement » montre
  // ses lignes à faire ET ses lignes faites ensemble — sinon valider une ligne à faire la fait
  // disparaître dans la section Fait restée repliée (bug trouvé par recette_connectee.mjs).
  function ligneGroupeCategorie(g, faitListe) {
    const elements = g.elements.filter((e) => (e.valeur !== null) === faitListe);
    if (!elements.length) return "";
    const cle = `cat:${g.cle}`;
    const deplie = deplies.has(cle);
    // Montant à déplacer toujours en positif (D-053, même choix que la vue Destinataires) :
    // somme des valeurs ABSOLUES, pas la valeur absolue de la somme — une catégorie peut mêler
    // une charge (négative) et un virement reçu (positif), les deux sont des MONTANTS à traiter,
    // jamais à compenser l'un l'autre dans le total affiché.
    const total = elements.reduce((s, e) => s + (manqueMontant(e) ? 0 : Math.abs(e.montant_centimes)), 0);
    const libelle = g.cle === CLE_VIREMENTS ? g.libelle : g.libelle.toUpperCase();
    return `<div class="ml-groupe${deplie ? " ouvert" : ""}">
      <button type="button" class="mvt gv-groupe" data-ml-groupe="${txt(cle)}">
        <span class="mvt-corps"><span class="mvt-titre">${txt(libelle)}</span>
          <span class="mvt-trajet">${elements.length} ligne${elements.length > 1 ? "s" : ""}</span></span>
        <span class="mvt-droite"><span class="mono mvt-montant">${euros(total)}</span></span>
      </button>
      ${deplie ? `<div class="ml-sous-lignes">${elements.map(ligneElement).join("")}</div>` : ""}
    </div>`;
  }

  function rendreCategories() {
    const liste = cb.chargesAffichees();
    const groupes = construireGroupesCategories(liste, etat.lignes, etat.mouvements, etat.recurrents);
    const aFaireHtml = groupes.map((g) => ligneGroupeCategorie(g, false)).filter(Boolean).join("");
    const faitHtml = groupes.map((g) => ligneGroupeCategorie(g, true)).filter(Boolean).join("");
    const nAFaire = groupes.reduce((s, g) => s + g.elements.filter((e) => e.valeur === null).length, 0);
    const nFaits = groupes.reduce((s, g) => s + g.elements.filter((e) => e.valeur !== null).length, 0);
    // Somme des valeurs ABSOLUES (D-053) : jamais la somme signée, qui compenserait une charge
    // et un virement reçu au lieu de les additionner comme deux montants à traiter.
    const totalAFaire = groupes.reduce((s, g) => s + g.elements
      .filter((e) => e.valeur === null && !manqueMontant(e))
      .reduce((s2, e) => s2 + Math.abs(e.montant_centimes), 0), 0);
    const totalFaits = groupes.reduce((s, g) => s + g.elements
      .filter((e) => e.valeur !== null)
      .reduce((s2, e) => s2 + Math.abs(e.montant_centimes), 0), 0);
    cb.majEnTeteAFaire(nAFaire, totalAFaire);
    $("#mvts-a-faire").innerHTML = aFaireHtml || `<p class="vide">Rien à faire ce mois-ci.</p>`;
    $("#mvts-faits").innerHTML = faitHtml;
    return { n: nFaits, total: totalFaits };
  }

  // ---------- rendu + bascule ----------
  function rendre() {
    $("#mois-vue-charges").innerHTML = htmlSelecteurVue();
    const { n: nFaits, total: totalFaits } = vue === "destinataires" ? rendreDestinataires() : rendreCategories();
    cb.majEnTeteFait(nFaits, totalFaits);
    brancher();
  }

  async function basculerGroupeTrajet(cle) {
    const groupes = construireGroupes(etat);
    const g = groupes.find((x) => x.cle === cle);
    if (!g) return;
    const { valeurCible, cibles } = preparerBasculeGroupe(g, etat.membres);
    if (!cibles.length) return;
    const dateCible = valeurCible === null ? null : new Date().toISOString();
    for (const c of cibles) {
      if (c.type === "mouvement") { await basculerMouvement(c.id, { valeurCible, dateCible }); continue; }
      const prep = preparerBasculeLigne(etat, c.id, valeurCible, dateCible);
      if (!prep.ok) { toast(prep.message, true); continue; }
      const restaure = appliquerBasculeLigne(etat, c.id, prep);
      try { await ecrireBasculeLigne(api, etat, c.id, prep); }
      catch (e) { annulerBasculeLigne(etat, c.id, restaure, prep.mouvementLie); cb.echec(e); }
    }
    cb.recalculer();
    cb.rendreMois();
    toast(valeurCible === null ? "Validation annulée." : `Validé pour ${valeurCible}.`);
  }

  async function basculerElement(type, id) {
    if (type === "mouvement") { await basculerMouvement(id, {}); return; }
    const prep = preparerBasculeLigne(etat, id);
    if (!prep.ok) { toast(prep.message, true); return; }
    const restaure = appliquerBasculeLigne(etat, id, prep);
    cb.recalculer();
    cb.rendreMois();
    try {
      await ecrireBasculeLigne(api, etat, id, prep);
      toast(prep.message);
    } catch (e) { annulerBasculeLigne(etat, id, restaure, prep.mouvementLie); cb.recalculer(); cb.rendreMois(); cb.echec(e); }
  }

  function brancher() {
    const racine = $("#ecran-mois");
    for (const b of racine.querySelectorAll("#mois-vue-charges [data-vue-charges]")) {
      b.addEventListener("click", () => {
        if (b.dataset.vueCharges === vue) return;
        vue = b.dataset.vueCharges;
        ecrireVue(vue);
        rendre();
      });
    }
    // Déplier/replier un groupe (tap sur la ligne, hors case) — vue Destinataires et Catégories.
    for (const el of racine.querySelectorAll("[data-ml-groupe]")) {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-cycle]")) return;
        const cle = el.dataset.mlGroupe;
        deplies.has(cle) ? deplies.delete(cle) : deplies.add(cle);
        rendre();
      });
    }
    // Case cycle d'un groupe trajet (vue Destinataires seulement, id = clé de trajet).
    if (vue === "destinataires") {
      for (const zone of [$("#mvts-a-faire"), $("#mvts-faits")]) {
        brancherCycles(zone, (cle) => basculerGroupeTrajet(cle));
      }
    }
    // Cases des éléments dépliés (ligne de charge ou mouvement), et tap sur la ligne elle-même.
    for (const el of racine.querySelectorAll(".ml-element[data-id]")) {
      const type = el.dataset.mlType;
      el.querySelector(`[data-cycle-${type}]`)?.addEventListener("click", (e) => {
        e.stopPropagation();
        basculerElement(type, Number(el.dataset.id));
      });
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-cycle]")) return;
        ouvrirElement(type, Number(el.dataset.id));
      });
    }
    // Libellé de virement (D-050) dans un groupe trajet déplié : même bloc que l'ancien détail
    // de groupe (htmlBlocLibelle), branché sur chaque sous-lignes qui en porte un.
    if (vue === "destinataires") {
      const groupes = construireGroupes(etat);
      for (const zone of racine.querySelectorAll(".ml-groupe.ouvert .ml-sous-lignes")) {
        const cle = zone.closest(".ml-groupe").querySelector("[data-ml-groupe]")?.dataset.mlGroupe;
        const g = groupes.find((x) => x.cle === cle);
        if (g) brancherBlocLibelle(zone, api, etat, cb, () => rendre());
      }
    }
  }

  return { rendre };
}
