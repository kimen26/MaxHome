// Écran « Réglages · Charges » : pour chaque charge, sa valeur de RÉFÉRENCE (montant_defaut)
// et sa répartition par défaut. Une ligne par charge, empilée : libellé + montant, puis le
// choix 50/50 | Prorata qui montre la part de chacun, puis — seulement si le mois diffère —
// le montant du mois et « Garder comme référence ». La maquette serrait tout sur une ligne
// (colonnes Référence | Règle | Ce mois) : illisible à 360 px, remplacée (D-039). Le détail
// complet d'une charge reste dans la feuille ouverte au tap sur le libellé (ui-mois-charges.js).

import { euros, versCentimes, regleEffective } from "./calc.js";
import { $, $$, txt, confirmer, toast } from "../socle/ui-base.js";
import { choixDetaille } from "../socle/blocs.js";
import { categoriesPresentes } from "./ui-mois-charges.js";
import { REGLES_COURANTES, libelleRegle, detailRegle, optionsRegle } from "./repartition.js";

const enSaisie = (c) => (c / 100).toFixed(2).replace(".", ",");

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
        <h3>Qui paie quoi, charge par charge</h3>
        <p><strong>50/50</strong> : chacun paie la moitié.<br>
        <strong>Prorata</strong> : chacun paie selon son salaire du mois
        (ce mois : ${txt(detailRegle("proport", etat))}).</p>
        <p>Le montant est la <strong>référence</strong> : chaque mois part de lui. Quand le mois
        en cours est différent, la ligne l'affiche et propose de garder le nouveau montant.</p>
      </div>
      ${categoriesPresentes(parCat).map((k) => carteCategorie(k, parCat[k])).join("")}`;
    brancher();
  }

  const carteCategorie = (nom, items) => `<div class="carte carte-charges-ref">
      <div class="carte-tete"><span>${txt(nom.toUpperCase())}</span></div>
      ${items.map(ligneChargeRef).join("")}
    </div>`;

  function ligneChargeRef(c) {
    const m = montantMois(c.id);
    const ref = c.montant_defaut;
    // « dernier » : la référence n'est pas un montant fixe mais le dernier saisi — on le dit
    // en toutes lettres, avec ce dernier montant quand il existe, plutôt qu'un champ vide.
    const dernier = etat.derniers[c.id];
    const montant = c.defaut_dernier
      ? `<span class="ref-dernier">dernier saisi${dernier != null ? `<strong class="mono">${euros(dernier)}</strong>` : ""}</span>`
      : `<input class="champ champ-montant" inputmode="decimal" data-ref="${c.id}"
               aria-label="Montant de référence : ${txt(c.libelle)}"
               value="${ref != null ? enSaisie(ref) : ""}" placeholder="0,00">`;
    const differe = !c.defaut_dernier && saisieMois(c.id) && ref != null && m !== ref;
    const regleMois = regleEffective(c, ligneMois(c.id));
    // Une règle rare (clé fixe, un seul paie) reste visible et cochée à côté des deux courantes.
    const valeurs = [...new Set([...REGLES_COURANTES, c.regle])];
    const notes = [
      differe ? `<span>Ce mois : <strong class="mono">${euros(m)}</strong></span>
        <button type="button" class="btn-lien" data-aligner="${c.id}">Garder comme référence</button>` : "",
      regleMois !== c.regle ? `<span>Ce mois seulement : ${txt(libelleRegle(regleMois))}</span>` : "",
    ].filter(Boolean);
    return `<div class="ligne-charges-ref" data-charge="${c.id}">
      <button type="button" class="lc-libelle" data-reglages="${c.id}">${txt(c.libelle)}</button>
      ${montant}
      ${choixDetaille(optionsRegle(etat, c, valeurs), c.regle, { attr: "regle", etiquette: `Répartition : ${c.libelle}` })}
      ${notes.length ? `<div class="ecart-mois">${notes.join("")}</div>` : ""}
    </div>`;
  }

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

    for (const b of $$("#charges-ref-corps .ligne-charges-ref [data-regle]")) {
      b.addEventListener("click", async () => {
        const id = Number(b.closest("[data-charge]").dataset.charge);
        const c = etat.charges.find((x) => x.id === id);
        if (b.dataset.regle === c.regle) return;
        try {
          await api.majCharge(id, { regle: b.dataset.regle });
          c.regle = b.dataset.regle;
          cb.recalculer();
          rendre();
          toast(`${c.libelle} : ${libelleRegle(c.regle)}.`);
        } catch (e) { cb.echec(e); }
      });
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
