// « Ce mois seulement » : les charges ponctuelles (charges.ponctuel = true), affichées et
// validables comme les charges par catégorie (D-046). Sorti de ui-mouvements.js (qui dépassait
// 400 lignes) : même rôle que ui-regularisations.js, un sous-bloc de la carte « Ce mois
// seulement » avec son propre rendu et ses écritures. Une ligne de ce mois EST une charge
// comme les autres pour le calcul (elle entre dans totalCommun) : `ponctuel` ne sert qu'à
// l'afficher ici plutôt que dans les catégories, et à ne pas lui proposer de référence d'un
// mois sur l'autre.

import { euros } from "./calc.js";
import { txt, toast, confirmer } from "../socle/ui-base.js";
import { caseACocher, creerFileEcritures } from "../socle/blocs.js";
import { libelleRegle } from "./repartition.js";
import { preparerBascule, appliquerBascule, annulerBascule, ecrireBascule } from "./coche-ligne.js";

/** jj/mm d'une date ISO — même calcul que jourMois() de ui-mouvements.js. */
const jourMois = (iso) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function creerUiExtras(api, etat, cb) {
  const ponctuelles = () => etat.charges.filter((c) => c.ponctuel && c.actif !== false);
  // Une charge à la fois, file indépendante de celle des catégories (creerFileEcritures, blocs.js).
  const enFileValidation = creerFileEcritures();

  const ligne = (c) => {
    const m = etat.lignes[c.id]?.montant_centimes ?? 0;
    const fait = etat.lignes[c.id]?.fait_le;
    return `<div class="ligne extra${fait ? " fait" : ""}" data-charge="${c.id}">
      ${caseACocher({ id: c.id, cochee: !!fait, titre: c.libelle, attr: "valider" })}
      <button type="button" class="titre" data-suppr-extra="${c.id}" title="Retirer">${txt(c.libelle)}</button>
      <span class="repere">${txt(libelleRegle(c.regle))}</span>
      ${fait ? `<span class="repere mc-fait">✓ ${[etat.lignes[c.id].fait_par, jourMois(fait)].filter(Boolean).join(" · ")}</span>` : ""}
      <span class="mono valeur">${euros(m)}</span>
    </div>`;
  };

  async function basculerValidation(chargeId, rendre) {
    const prep = preparerBascule(etat, chargeId);
    if (!prep.ok) { toast(prep.message, true); return; }
    const restaure = appliquerBascule(etat, chargeId, prep);
    cb.recalculer();
    rendre();
    try {
      await enFileValidation(chargeId, () => ecrireBascule(api, etat, chargeId, prep));
      toast(prep.message);
    } catch (e) {
      annulerBascule(etat, chargeId, restaure, prep.mouvementLie);
      cb.recalculer();
      rendre();
      cb.echec(e);
    }
  }

  /** HTML des lignes de ce mois + total, sans les régularisations (ajoutées par l'appelant). */
  function html() {
    return ponctuelles().map(ligne).join("");
  }

  function total() {
    return ponctuelles().reduce((s, c) => s + (etat.lignes[c.id]?.montant_centimes ?? 0), 0);
  }

  /** Branche suppr et case de validation sur `racine` (la carte « Ce mois seulement »). */
  function brancher(racine, rendre) {
    for (const b of racine.querySelectorAll("[data-suppr-extra]")) {
      b.addEventListener("click", async () => {
        const id = Number(b.dataset.supprExtra);
        if (!(await confirmer("Retirer cette ligne ?", { ok: "Retirer" }))) return;
        try {
          await api.majCharge(id, { actif: false });
          etat.charges.find((c) => c.id === id).actif = false;
          delete etat.lignes[id];
          cb.recalculer();
          rendre();
          toast("Ligne retirée.");
        } catch (e) { cb.echec(e); }
      });
    }
    for (const el of racine.querySelectorAll("[data-valider]")) {
      const agir = (e) => { e.stopPropagation(); basculerValidation(Number(el.dataset.valider), rendre); };
      el.addEventListener("click", agir);
      el.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); agir(e); } });
    }
  }

  return { html, total, brancher };
}
