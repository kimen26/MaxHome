// Partie « charges par catégorie » de l'écran Mois (budget.png) : deux colonnes de cartes,
// une par catégorie, ligne compacte libellé + champ montant, pastille ambre quand le montant
// du mois diffère de la référence (montant_defaut). Le réglage d'une charge (libellé,
// catégorie, règle par défaut, montant de référence, archivage) reste dans sa propre feuille,
// ouverte au tap sur le libellé — ce fichier ne la redessine pas deux fois.

import { euros, versCentimes, regleEffective } from "./calc.js";
import { $, $$, txt } from "../socle/ui-base.js";
import { ouvrirPanneau, fermerPanneau } from "../socle/blocs.js";
import { champ, select, membresOptions, lire } from "../socle/blocs-form.js";

export const REGLES = [["egales", "50/50"], ["proport", "Prorata"], ["cle", "Clé %"], ["perso", "Perso"]];
export const CATEGORIES = ["Logement", "Max", "Épargne", "Alimentation", "Impôts", "Banque", "Autre"];

const ASIDE = "#reglages-pc";

export function creerUiMoisCharges(api, etat, cb) {
  const ligne = (id) => etat.lignes[id];
  const montantDe = (id) => ligne(id)?.montant_centimes ?? 0;
  const saisie = (id) => ligne(id) !== undefined;

  /** Montant proposé si rien n'est saisi : dernier montant si la charge le demande, sinon la valeur fixe. */
  const prefixe = (c) => (c.defaut_dernier ? etat.derniers[c.id] ?? c.montant_defaut : c.montant_defaut) ?? null;

  // Les charges ponctuelles (« Ligne de ce mois ») vivent dans la carte « Ce mois seulement »
  // de ui-mouvements.js, pas dans la grille par catégorie.
  const actives = () => etat.charges.filter((c) => c.actif !== false && !c.ponctuel);

  // ---------- rendu ----------
  function rendre() {
    const liste = actives();
    const parCat = {};
    for (const c of liste) (parCat[c.categorie] ??= []).push(c);
    $("#mois-categories").innerHTML = CATEGORIES.filter((k) => parCat[k]).map((k) => {
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
    brancher();
  }

  function ligneCharge(c) {
    const m = montantDe(c.id);
    const ref = c.montant_defaut ?? null;
    // Pastille ambre : un montant est saisi ce mois ET diffère de la référence.
    const differe = saisie(c.id) && ref !== null && m !== ref;
    const manque = !saisie(c.id);
    return `<div class="ligne mois-charge${manque ? " a-faire" : ""}" data-charge="${c.id}">
      <button type="button" class="titre lc-libelle" data-reglages="${c.id}">${txt(c.libelle)}</button>
      ${differe ? '<span class="point-ambre" title="Diffère de la référence"></span>' : ""}
      <input class="champ champ-montant cible44${m > 0 ? " pos" : ""}${manque ? " oubli" : ""}" inputmode="decimal"
             data-montant="${c.id}" value="${saisie(c.id) ? (m / 100).toFixed(2).replace(".", ",") : ""}"
             placeholder="${ref !== null ? (ref / 100).toFixed(2).replace(".", ",") : "0,00"}">
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

  // ---------- réglages d'une charge ----------
  function htmlReglages(c) {
    const regle = regleEffective(c, ligne(c.id));
    const surchargee = regle !== c.regle;
    return `<form class="pile reglages" data-charge="${c.id}">
      <div class="detail-tete"><div><h2>${txt(c.libelle)}</h2>
        <span class="sous">${txt(c.categorie)}</span></div>
        <button type="button" class="btn-lien" data-fermer-reglages>Fermer</button></div>

      ${champ("libelle", "Libellé", { valeur: c.libelle, requis: true })}
      ${select("categorie", "Catégorie", CATEGORIES.map((k) => [k, k]), c.categorie)}

      <div><span class="etiquette">Montant de référence</span>
        <input class="champ champ-montant grand-montant" name="montant_defaut" inputmode="decimal"
               value="${c.montant_defaut != null ? (c.montant_defaut / 100).toFixed(2).replace(".", ",") : ""}" placeholder="0,00">
        <label class="case-a-cocher"><input type="checkbox" name="defaut_dernier" ${c.defaut_dernier ? "checked" : ""}>
          Reprendre le dernier montant saisi</label></div>

      <div><span class="etiquette">Règle par défaut</span>
        <span class="segment large" data-regle-defaut>
          ${REGLES.map(([v, l]) => `<button type="button" data-regle="${v}" class="${c.regle === v ? "actif" : ""}">${l}</button>`).join("")}
        </span></div>

      ${c.regle === "cle" ? champ("cle_pct", `Clé pour ${etat.membres[0]?.prenom ?? ""} (%)`,
    { type: "number", valeur: c.cle_pct ?? 50, attrs: 'min="0" max="100"' }) : ""}
      ${c.regle === "perso" ? select("payeur", "Payeur", membresOptions(etat), c.payeur) : ""}

      <div class="regle-mois"><span class="etiquette">Règle de ce mois</span>
        <p>${txt(REGLES.find(([v]) => v === regle)?.[1] ?? regle)}${surchargee ? " (surchargée pour ce mois)" : " (règle par défaut)"}
        ${surchargee ? '<button type="button" class="btn-lien" data-rendre-defaut>Revenir au défaut</button>' : ""}</p></div>

      <div class="detail-actions">
        <button type="button" class="btn" data-archiver>Archiver</button>
        <button type="submit" class="btn btn-bleu grandir">Enregistrer</button>
      </div>
    </form>`;
  }

  function ouvrirReglages(id) {
    const c = etat.charges.find((x) => x.id === id);
    if (!c) return;
    brancherReglages(c, ouvrirPanneau(ASIDE, htmlReglages(c)));
  }

  const fermerReglages = () => fermerPanneau(ASIDE);

  function brancherReglages(c, racine) {
    racine.querySelector("[data-fermer-reglages]").addEventListener("click", fermerReglages);

    for (const b of racine.querySelectorAll("[data-regle-defaut] button")) {
      b.addEventListener("click", async () => {
        try {
          await api.majCharge(c.id, { regle: b.dataset.regle });
          c.regle = b.dataset.regle;
          cb.recalculer();
          cb.rendreMois();
          ouvrirReglages(c.id);
        } catch (e) { cb.echec(e); }
      });
    }

    racine.querySelector("[data-rendre-defaut]")?.addEventListener("click", async () => {
      await ecrireLigne(c.id, { regle: null, montant_centimes: montantDe(c.id) });
      ouvrirReglages(c.id);
    });

    racine.querySelector("[data-archiver]").addEventListener("click", async () => {
      try {
        await api.majCharge(c.id, { actif: false });
        c.actif = false;
        fermerReglages();
        cb.recalculer();
        cb.rendreMois();
      } catch (e) { cb.echec(e); }
    });

    racine.querySelector("form.reglages").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const v = lire(ev.target, { nombres: ["cle_pct"], booleens: ["defaut_dernier"] });
        const champs = {
          libelle: v.libelle, categorie: v.categorie,
          montant_defaut: v.montant_defaut ? versCentimes(v.montant_defaut) : null,
          defaut_dernier: v.defaut_dernier,
        };
        if ("cle_pct" in v) champs.cle_pct = v.cle_pct;
        if ("payeur" in v) champs.payeur = v.payeur;
        await api.majCharge(c.id, champs);
        Object.assign(c, champs);
        fermerReglages();
        cb.recalculer();
        cb.rendreMois();
      } catch (e) { cb.echec(e); }
    });
  }

  return { rendre, fermerReglages, ouvrirReglages };
}
