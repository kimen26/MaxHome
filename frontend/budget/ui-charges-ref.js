// Écran « Réglages · Charges » (reglages-charges.png) : la valeur de RÉFÉRENCE par charge
// (montant_defaut), sa règle par défaut, et le « ≠ » qui aligne la référence sur le montant
// du mois en cours quand l'écart est durable. Le détail complet d'une charge (libellé,
// catégorie, archivage) reste dans la feuille de réglages ouverte depuis l'écran Mois
// (ui-mois-charges.js) : ici on tape le libellé pour l'atteindre, on ne la redessine pas.

import { euros, versCentimes, regleEffective } from "./calc.js";
import { $, $$, txt, confirmer, toast } from "../socle/ui-base.js";
import { REGLES, CATEGORIES } from "./ui-mois-charges.js";

export function creerUiChargesRef(api, etat, cb) {
  const ligneMois = (id) => etat.lignes[id];
  const montantMois = (id) => ligneMois(id)?.montant_centimes ?? 0;
  const saisieMois = (id) => ligneMois(id) !== undefined;

  // Les charges ponctuelles (« Ligne de ce mois ») n'ont pas de référence : hors de cet écran.
  const actives = () => etat.charges.filter((c) => c.actif !== false && !c.ponctuel);

  function rendre() {
    const liste = actives();
    const parCat = {};
    for (const c of liste) (parCat[c.categorie] ??= []).push(c);
    $("#charges-ref-corps").innerHTML = `
      <div class="carte-explication">
        <h3>Valeur de référence par charge</h3>
        <p>Chaque mois part de ces montants. Une correction dans le mois (loyer indexé,
        électricité qui grimpe) ne change pas la référence : tap le « ≠ » de la ligne pour
        aligner la référence sur le mois quand le changement est durable.</p>
      </div>
      ${CATEGORIES.filter((k) => parCat[k]).map((k) => carteCategorie(k, parCat[k])).join("")}
      <p class="legende">« ≠ » signale que le mois en cours diffère de la référence ; tap pour
      aligner la référence sur le mois.</p>`;
    brancher();
  }

  function carteCategorie(nom, items) {
    return `<div class="carte carte-charges-ref">
      <div class="carte-tete charges-ref-entete">
        <span>${txt(nom.toUpperCase())}</span>
        <span class="charges-ref-colonnes"><span>Référence</span><span>Règle</span><span>Ce mois</span></span>
      </div>
      ${items.map(ligneChargeRef).join("")}
    </div>`;
  }

  function ligneChargeRef(c) {
    const regle = regleEffective(c, ligneMois(c.id));
    const m = montantMois(c.id);
    const ref = c.montant_defaut;
    // « dernier » : la référence n'est pas un montant fixe mais le dernier saisi — le champ
    // reste lisible (désactivé) plutôt que de prétendre à une valeur qu'il n'a pas.
    if (c.defaut_dernier) {
      return `<div class="ligne-charges-ref" data-charge="${c.id}">
        <button type="button" class="titre lc-libelle" data-reglages="${c.id}">${txt(c.libelle)}</button>
        <span class="champ champ-montant cible44 desactive" title="Référence : dernier montant saisi">dernier</span>
        ${boutonRegle(c, regle)}
        ${boutonCeMois(c, m, ref, false)}
      </div>`;
    }
    const differe = saisieMois(c.id) && ref != null && m !== ref;
    return `<div class="ligne-charges-ref" data-charge="${c.id}">
      <button type="button" class="titre lc-libelle" data-reglages="${c.id}">${txt(c.libelle)}</button>
      <input class="champ champ-montant cible44" inputmode="decimal" data-ref="${c.id}"
             value="${ref != null ? (ref / 100).toFixed(2).replace(".", ",") : ""}" placeholder="0,00">
      ${boutonRegle(c, regle)}
      ${boutonCeMois(c, m, ref, differe)}
    </div>`;
  }

  const boutonRegle = (c, regle) => `<span class="segment charges-ref-regle" data-segment-regle="${c.id}">
    ${REGLES.slice(0, 2).map(([v, l]) => `<button type="button" data-regle="${v}" class="${regle === v ? "actif" : ""} cible44">${l}</button>`).join("")}
  </span>`;

  const boutonCeMois = (c, m, ref, differe) => differe
    ? `<button type="button" class="ce-mois ce-mois-differe cible44" data-aligner="${c.id}" title="Aligner la référence sur le mois">≠</button>`
    : `<span class="ce-mois ce-mois-egal">=</span>`;

  // ---------- écritures ----------
  function brancher() {
    for (const el of $$("#charges-ref-corps [data-ref]")) {
      el.addEventListener("change", async () => {
        const id = Number(el.dataset.ref);
        const c = etat.charges.find((x) => x.id === id);
        try {
          const montant_defaut = el.value.trim() ? versCentimes(el.value) : null;
          await api.majCharge(id, { montant_defaut });
          c.montant_defaut = montant_defaut;
          cb.recalculer();
          rendre();
          toast("Référence enregistrée.");
        } catch (e) { cb.echec(e); }
      });
    }

    for (const seg of $$("#charges-ref-corps [data-segment-regle]")) {
      const id = Number(seg.dataset.segmentRegle);
      for (const b of seg.querySelectorAll("button")) {
        b.addEventListener("click", async () => {
          try {
            await api.majCharge(id, { regle: b.dataset.regle });
            etat.charges.find((c) => c.id === id).regle = b.dataset.regle;
            cb.recalculer();
            rendre();
            toast("Règle par défaut enregistrée.");
          } catch (e) { cb.echec(e); }
        });
      }
    }

    for (const b of $$("#charges-ref-corps [data-aligner]")) {
      b.addEventListener("click", async () => {
        const id = Number(b.dataset.aligner);
        const c = etat.charges.find((x) => x.id === id);
        const montant = montantMois(id);
        if (!(await confirmer(`Aligner la référence de « ${c.libelle} » sur ${euros(montant)} ?`, { danger: false, ok: "Aligner" }))) return;
        try {
          await api.majCharge(id, { montant_defaut: montant });
          c.montant_defaut = montant;
          cb.recalculer();
          rendre();
          toast("Référence alignée sur le mois.");
        } catch (e) { cb.echec(e); }
      });
    }

    for (const b of $$("#charges-ref-corps [data-reglages]")) {
      b.addEventListener("click", () => cb.ouvrirReglagesCharge(Number(b.dataset.reglages)));
    }
  }

  return { rendre };
}
