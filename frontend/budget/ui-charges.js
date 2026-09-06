// Écran « Charges » : revenus et montants du mois, règle par ligne, réglages d'une charge, ajustements.

import { euros, versCentimes, regleEffective } from "./calc.js";
import { $, $$, txt, ouvrirFeuille, fermerFeuille, toast, MOIS, MOIS_COURT, decaler } from "../socle/ui-base.js";
import { ouvrirPanneau, fermerPanneau, carteListe } from "../socle/blocs.js";
import { champ, montant, select, membresOptions, lire } from "../socle/blocs-form.js";

const REGLES = [["egales", "50/50"], ["proport", "Prorata"], ["cle", "Clé %"], ["perso", "Perso"]];
const CATEGORIES = ["Logement", "Max", "Épargne", "Alimentation", "Impôts", "Banque", "Autre"];

const ASIDE = "#reglages-pc";

export function creerUiCharges(api, etat, cb) {
  const ligne = (id) => etat.lignes[id];
  const montantDe = (id) => ligne(id)?.montant_centimes ?? 0;
  const saisie = (id) => ligne(id) !== undefined;

  /** Montant proposé si rien n'est saisi : dernier montant si la charge le demande, sinon la valeur fixe. */
  const prefixe = (c) => (c.defaut_dernier ? etat.derniers[c.id] ?? c.montant_defaut : c.montant_defaut) ?? null;

  const actives = () => etat.charges.filter((c) => c.actif !== false);

  // ---------- rendu ----------
  function rendre() {
    const [aPrec, mPrec] = decaler(etat.annee, etat.mois, -1);
    const nomMois = MOIS[etat.mois - 1];
    $("#titre-charges").textContent = `Charges · ${nomMois[0].toUpperCase()}${nomMois.slice(1)}`;
    const liste = actives();
    const remplies = liste.filter((c) => montantDe(c.id)).length;
    $("#sous-charges").textContent = `${remplies} / ${liste.length} renseignées`;
    $("#jauge-charges").style.width = liste.length ? `${Math.round((remplies / liste.length) * 100)}%` : "0%";
    $("#jauge-charges").style.background = "var(--bleu)";

    $("#revenus").innerHTML = `<div class="revenus">${etat.membres.map((m) => `
      <label class="revenu"><span class="etiquette">Revenu ${txt(m.prenom)}</span>
        <input class="champ champ-montant pos" inputmode="decimal" data-revenu="${txt(m.prenom)}"
               value="${etat.revenus[m.prenom] ? (etat.revenus[m.prenom] / 100).toFixed(2).replace(".", ",") : ""}"
               placeholder="0,00"></label>`).join("")}</div>`;

    const parCat = {};
    for (const c of liste) (parCat[c.categorie] ??= []).push(c);
    $("#categories").innerHTML = CATEGORIES.filter((k) => parCat[k]).map((k) => {
      const sous = parCat[k].reduce((s, c) => s + montantDe(c.id), 0);
      return `<section class="groupe">
        <div class="groupe-tete"><span>${txt(k)}</span><span class="mono">${euros(sous)}</span></div>
        ${parCat[k].map((c) => ligneCharge(c, mPrec)).join("")}
      </section>`;
    }).join("");

    rendreAjustements();
    brancher();
  }

  function ligneCharge(c, mPrec) {
    const regle = regleEffective(c, ligne(c.id));
    const m = montantDe(c.id);
    const pre = prefixe(c);
    const precedent = etat.moisPrecedent?.[c.id];
    // Rien de saisi : on rappelle en ambre le montant habituel. Saisi et différent du mois
    // précédent : on rappelle en gris ce qu'il valait le mois d'avant.
    const habituel = precedent ?? pre;
    let repere = "";
    if (!m && habituel) repere = `<span class="repere habituel">habit. ${euros(habituel)}</span>`;
    else if (precedent && precedent !== m) repere = `<span class="repere">${MOIS_COURT[mPrec - 1]} : ${euros(precedent)}</span>`;
    // Oubli probable : rien de saisi ce mois alors qu'un montant est attendu (repère ou préaffichage).
    const oubli = !saisie(c.id) && (!!precedent || pre !== null);
    return `<div class="ligne-charge" data-charge="${c.id}">
      <div class="lc-corps">
        <button class="lc-libelle" data-reglages="${c.id}">${txt(c.libelle)}</button>
        <div class="lc-meta">
          <span class="segment" data-segment="${c.id}">
            ${REGLES.slice(0, 2).map(([v, l]) => `<button data-regle="${v}" class="${regle === v ? "actif" : ""}">${l}</button>`).join("")}
          </span>
          ${repere}
        </div>
      </div>
      <input class="champ champ-montant${m > 0 ? " pos" : ""}${oubli ? " oubli" : ""}" inputmode="decimal"
             data-montant="${c.id}" value="${saisie(c.id) ? (m / 100).toFixed(2).replace(".", ",") : ""}"
             placeholder="${pre !== null ? (pre / 100).toFixed(2).replace(".", ",") : "0,00"}">
    </div>`;
  }

  // ---------- écritures ----------
  async function ecrireLigne(chargeId, champs) {
    try {
      await api.majLigne(etat.annee, etat.mois, chargeId, champs);
      etat.lignes[chargeId] = { ...(etat.lignes[chargeId] ?? { montant_centimes: 0, regle: null }), ...champs };
      cb.recalculer();
      rendre();
      toast("Enregistré.");
    } catch (e) { cb.echec(e); }
  }

  function brancher() {
    for (const el of $$("#ecran-charges [data-revenu]")) {
      el.addEventListener("change", async () => {
        const prenom = el.dataset.revenu;
        try {
          const v = el.value.trim() ? versCentimes(el.value) : 0;
          await api.majRevenu(etat.annee, etat.mois, prenom, v);
          etat.revenus[prenom] = v;
          cb.recalculer();
          rendre();
          toast("Enregistré.");
        } catch (e) { cb.echec(e); }
      });
    }

    for (const el of $$("#ecran-charges [data-montant]")) {
      el.addEventListener("change", async () => {
        const id = Number(el.dataset.montant);
        if (!el.value.trim()) {
          try {
            await api.supprimerLigne(etat.annee, etat.mois, id);
            delete etat.lignes[id];
            cb.recalculer();
            rendre();
            toast("Effacé.");
          } catch (e) { cb.echec(e); }
          return;
        }
        try { await ecrireLigne(id, { montant_centimes: versCentimes(el.value) }); }
        catch (e) { cb.echec(e); }
      });
    }

    for (const seg of $$("#ecran-charges [data-segment]")) {
      const id = Number(seg.dataset.segment);
      for (const b of seg.querySelectorAll("button")) {
        b.addEventListener("click", () => {
          const charge = etat.charges.find((c) => c.id === id);
          const choisie = b.dataset.regle;
          // null si on revient à la règle par défaut de la charge : pas de surcharge inutile.
          ecrireLigne(id, { regle: choisie === charge.regle ? null : choisie, montant_centimes: montantDe(id) });
        });
      }
    }

    for (const b of $$("#ecran-charges [data-reglages]")) {
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

      <div><span class="etiquette">Montant préaffiché</span>
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
          rendre();
          ouvrirReglages(c.id);
          toast("Règle par défaut enregistrée.");
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
        rendre();
        toast("Charge archivée.");
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
        rendre();
        toast("Enregistré.");
      } catch (e) { cb.echec(e); }
    });
  }

  // ---------- ajustements du mois ----------
  const ligneAjustement = (a) => `<div class="rec">
    <div class="rec-corps"><span class="rec-titre">${txt(a.de)} → ${txt(a.vers)}</span>
      ${a.motif ? `<span class="rec-trajet">${txt(a.motif)}</span>` : ""}</div>
    <div class="rec-droite"><span class="mono">${euros(a.montant_centimes)}</span></div>
    <div class="rec-actions"><button class="btn-lien" data-suppr-ajust="${a.id}">Retirer</button></div>
  </div>`;

  function rendreAjustements() {
    $("#ajustements").innerHTML = carteListe(etat.ajustements.map(ligneAjustement), "Aucun ajustement ce mois.");
    for (const b of $$("#ajustements [data-suppr-ajust]")) {
      b.addEventListener("click", async () => {
        const id = Number(b.dataset.supprAjust);
        try {
          await api.supprimerAjustement(id);
          etat.ajustements = etat.ajustements.filter((x) => x.id !== id);
          cb.recalculer();
          rendre();
          toast("Ajustement retiré.");
        } catch (e) { cb.echec(e); }
      });
    }
  }

  /** « X verse N € en plus ce mois » : l'autre membre verse autant de moins. */
  function formulaireAjustement() {
    const [a] = etat.membres.map((m) => m.prenom);
    ouvrirFeuille(`<form id="form-ajust" class="pile">
      <h2>Ajustement ce mois</h2>
      ${select("de", "Qui verse en plus", membresOptions(etat), a)}
      ${montant("montant", "Montant", null, { requis: true })}
      ${champ("motif", "Motif", { placeholder: "ex. resto payé par l’autre" })}
      <button type="submit" class="btn btn-bleu grandir">Ajouter</button>
    </form>`);
    $("#form-ajust").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const v = lire(ev.target);
        const vers = etat.membres.map((m) => m.prenom).find((p) => p !== v.de) ?? v.de;
        const cree = await api.creerAjustement({
          annee: etat.annee, mois: etat.mois, de: v.de, vers,
          montant_centimes: Math.abs(versCentimes(v.montant)), motif: v.motif,
        });
        etat.ajustements.push(cree);
        fermerFeuille();
        cb.recalculer();
        rendre();
        toast("Ajustement ajouté.");
      } catch (e) { cb.echec(e); }
    });
  }

  $("#btn-ajouter-ajustement").addEventListener("click", formulaireAjustement);

  return { rendre, fermerReglages };
}
