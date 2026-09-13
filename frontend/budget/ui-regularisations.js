// Régularisations du mois (table `ajustements` : un transfert perso → perso, « resto avancé
// par Claudia »). Elles entrent dans le calcul (calc.js) et le bot sait les créer : l'écran
// Mois doit donc les montrer et permettre d'en ajouter ou d'en retirer une. Elles vivent dans la
// carte « Ce mois seulement », sous les charges ponctuelles, avec leur propre petit formulaire.

import { euros, versCentimes } from "./calc.js";
import { $, $$, txt, toast, ouvrirFeuille, fermerFeuille, confirmer } from "../socle/ui-base.js";
import { champ, select, membresOptions, lire } from "../socle/blocs-form.js";

export function creerUiRegularisations(api, etat, cb) {
  const ligne = (a) => `<div class="ligne regularisation" data-id="${a.id}">
    <button type="button" class="titre" data-suppr-regul="${a.id}" title="Retirer">${txt(a.motif || "Régularisation")}</button>
    <span class="repere">${txt(a.de)} → ${txt(a.vers)}</span>
    <span class="mono valeur">${euros(a.montant_centimes)}</span>
  </div>`;

  /** HTML des régularisations du mois (vide si aucune) + lien « + Régularisation ». */
  function html() {
    return `${etat.ajustements.map(ligne).join("")}
      <button type="button" class="btn-lien discret" data-nouvelle-regul>+ Régularisation entre nous</button>`;
  }

  function brancher(racine, rendre) {
    racine.querySelector("[data-nouvelle-regul]")?.addEventListener("click", () => formulaire(rendre));
    for (const b of racine.querySelectorAll("[data-suppr-regul]")) {
      b.addEventListener("click", async () => {
        const id = Number(b.dataset.supprRegul);
        if (!(await confirmer("Retirer cette régularisation ?", { ok: "Retirer" }))) return;
        try {
          await api.supprimerAjustement(id);
          etat.ajustements = etat.ajustements.filter((a) => a.id !== id);
          cb.recalculer();
          rendre();
          toast("Régularisation retirée.");
        } catch (e) { cb.echec(e); }
      });
    }
  }

  function formulaire(rendre) {
    const [p1, p2] = etat.membres.map((m) => m.prenom);
    ouvrirFeuille(`<form id="form-regul" class="pile">
      <h2 class="feuille-titre">Régularisation entre nous</h2>
      <p class="sous">Une somme que l’un doit à l’autre ce mois-ci : elle corrige les restes, pas le commun.</p>
      ${select("de", "Qui a avancé", membresOptions(etat), etat.prenom ?? p1)}
      ${select("vers", "Pour qui", membresOptions(etat), etat.prenom === p1 ? p2 : p1)}
      <label class="champ-label"><span class="etiquette">Montant</span>
        <input class="champ champ-montant" name="montant" inputmode="decimal" placeholder="0,00" required></label>
      ${champ("motif", "Motif", { placeholder: "ex. Resto avancé" })}
      <button type="submit" class="btn btn-bleu grandir">Ajouter</button>
    </form>`);
    $("#form-regul").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const v = lire(ev.target);
      if (v.de === v.vers) return cb.echec(new Error("Choisir deux personnes différentes."));
      let montant_centimes;
      try { montant_centimes = versCentimes(v.montant); } catch (e) { return cb.echec(e); }
      try {
        const cree = await api.creerAjustement({ annee: etat.annee, mois: etat.mois, de: v.de, vers: v.vers, montant_centimes, motif: v.motif });
        etat.ajustements = [...etat.ajustements, cree];
        fermerFeuille();
        cb.recalculer();
        rendre();
        toast("Régularisation ajoutée.");
      } catch (e) { cb.echec(e); }
    });
  }

  return { html, brancher };
}
