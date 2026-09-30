// Budget par poste (D-047 §V2) : une ligne par poste — emoji + libellé, barre engagé plein / à
// venir plus clair, montants « 320 € engagés · 150 € à venir / 800 € prévus », « dépassé » en mot
// ET en rouge (jamais la couleur seule). « Cadrer le budget » ouvre une feuille avec les 6 postes,
// un montant chacun, → fixerEnveloppe.

import { $, txt, ouvrirFeuille, fermerFeuille, toast } from "../socle/ui-base.js";
import { titreSection } from "../socle/blocs.js";
import { montant, lire } from "../socle/blocs-form.js";
import { euros, versCentimes } from "../budget/calc.js";
import { POSTES, budgetParPoste } from "./carnet.js";

export function creerFicheBudget(api, etat, cb, { voyage, resas, enveloppes, rafraichir, revenirALaFiche }) {
  function ligne(l) {
    const poste = POSTES.find((p) => p.valeur === l.poste) ?? POSTES.at(-1);
    const pct = (v) => (l.prevu > 0 ? Math.min(100, Math.round((v / l.prevu) * 100)) : 0);
    return `<div class="ligne-budget${l.depasse ? " depasse" : ""}">
      <div class="lb-tete">
        <span class="lb-libelle">${poste.emoji} ${txt(poste.libelle)}</span>
        ${l.depasse ? `<span class="lb-depasse">Dépassé</span>` : ""}
      </div>
      ${l.prevu > 0 ? `<div class="lb-barre">
        <span class="lb-barre-engage" style="width:${pct(l.engage)}%"></span>
        <span class="lb-barre-avenir" style="width:${pct(l.engage + l.aVenir) - pct(l.engage)}%"></span>
      </div>` : ""}
      <p class="lb-montants">
        ${txt(euros(l.engage))} engagés${l.aVenir ? ` · ${txt(euros(l.aVenir))} à venir` : ""}${l.prevu > 0 ? ` / ${txt(euros(l.prevu))} prévus` : ""}
      </p>
    </div>`;
  }

  function html() {
    const { parPoste, totaux } = budgetParPoste(resas(), enveloppes());
    if (!parPoste.length) {
      return `<div class="fiche-budget">
        ${titreSection("Budget")}
        <button type="button" class="carte-invitante" data-cadrer-budget>Cadrez les grandes lignes</button>
      </div>`;
    }
    // Aucune enveloppe DU TOUT (des lignes existent, mais rien n'est cadré nulle part) : invite
    // en tête plutôt qu'un budget qui a l'air complet alors que rien n'est prévu (relecture point 5).
    const aucuneEnveloppe = enveloppes().length === 0;
    return `<div class="fiche-budget">
      ${titreSection("Budget")}
      ${aucuneEnveloppe ? `<p class="budget-invite">Fixez un montant par poste pour suivre ce qui reste.</p>` : ""}
      <div class="budget-lignes">${parPoste.map(ligne).join("")}</div>
      <p class="budget-total${totaux.depasse ? " depasse" : ""}">
        Total : ${txt(euros(totaux.engage + totaux.aVenir))}${totaux.prevu > 0 ? ` / ${txt(euros(totaux.prevu))}` : ""}
        ${totaux.depasse ? `<span class="lb-depasse">Dépassé</span>` : ""}
      </p>
      <button type="button" class="btn btn-budget-secondaire" data-cadrer-budget>Cadrer le budget</button>
    </div>`;
  }

  function rendre() {
    $("#fiche-budget-corps").innerHTML = html();
    $("#fiche-budget-corps [data-cadrer-budget]").addEventListener("click", formulaireEnveloppes);
  }

  function formulaireEnveloppes() {
    const enveloppeDe = Object.fromEntries(enveloppes().map((e) => [e.poste, e.prevu_centimes]));
    ouvrirFeuille(`<form class="pile" data-form-enveloppes>
      <h2>Cadrer le budget</h2>
      <p class="sous">Un montant prévu par poste. Laisser vide un poste que tu ne veux pas cadrer.</p>
      ${POSTES.map((p) => montant(`poste_${p.valeur}`, `${p.emoji} ${p.libelle}`, enveloppeDe[p.valeur] ?? null)).join("")}
      <button type="submit" class="btn btn-bleu grandir">Enregistrer</button>
    </form>`, { onFermer: revenirALaFiche });
    const form = $("#feuille-corps [data-form-enveloppes]");
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const v = lire(form);
      try {
        await Promise.all(POSTES.map(async (p) => {
          const brut = v[`poste_${p.valeur}`];
          const centimes = brut ? Math.abs(versCentimes(brut)) : 0;
          await api.fixerEnveloppe(voyage().id, p.valeur, centimes);
        }));
        fermerFeuille(); // déclenche onFermer -> revenirALaFiche (rafraîchit + scroll Budget)
        toast("Budget cadré.");
      } catch (e) { cb.echec(e); }
    });
  }

  return { rendre };
}
