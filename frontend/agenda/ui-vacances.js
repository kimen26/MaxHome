// Écran « Agenda · Vacances » : les prochaines vacances scolaires d'une zone (segmenté
// A | B | C pour comparer), notre zone en tête, les jours fériés à venir. Le changement de
// zone du foyer est un geste explicite (bouton), pas un effet de la consultation.

import { $, txt, toast } from "../socle/ui-base.js";
import { feries, prochaines, formatPeriode, nbJours, relatif, jourIso } from "./calendrier.js";
import { ZONES } from "./vacances.js";

const N_VACANCES = 8;
const N_FERIES = 8;

export function creerUiVacances(api, etat, cb, { vacancesDe, changerZone, rendreMois }) {
  let zoneAffichee = null; // zone consultée dans le segmenté, indépendante de la zone du foyer
  let periodes = [];
  let perime = false;

  const auj = () => jourIso(new Date());

  function htmlPeriode(p, a) {
    return `<div class="ligne-periode">
      <span class="ligne-periode-corps">
        <span class="ligne-periode-titre">${txt(p.titre)}</span>
        <span class="sous">${txt(formatPeriode(p.debut, p.fin, { annee: true }))} · ${nbJours(p.debut, p.fin)} j</span>
      </span>
      <span class="ligne-periode-quand">${txt(relatif(p, a))}</span>
    </div>`;
  }

  function rendre() {
    zoneAffichee ??= etat.zone;
    const a = auj();
    $("#zones-vacances").innerHTML = ZONES.map((z) =>
      `<button type="button" data-zone="${txt(z)}" class="${z === zoneAffichee ? "actif" : ""}">${txt(z)}</button>`).join("");
    for (const b of $("#zones-vacances").querySelectorAll("[data-zone]")) {
      b.addEventListener("click", () => { zoneAffichee = b.dataset.zone; void charger(); });
    }

    const estNotre = zoneAffichee === etat.zone;
    $("#vacances-notre").innerHTML = estNotre
      ? `<span class="sous">${txt(zoneAffichee)} est la zone du foyer${perime ? " · hors ligne, liste peut-être ancienne" : ""}.</span>`
      : `<span class="sous">Le foyer est en ${txt(etat.zone)}.</span>
         <button type="button" class="btn-lien" id="btn-notre-zone">Passer le foyer en ${txt(zoneAffichee)}</button>`;
    $("#btn-notre-zone")?.addEventListener("click", async () => {
      try {
        await changerZone(zoneAffichee);
        toast(`Zone du foyer : ${zoneAffichee}.`);
        rendre();
        rendreMois();
      } catch (e) { cb.echec(e); }
    });

    const proch = prochaines(periodes, a, N_VACANCES);
    $("#liste-vacances").innerHTML = proch.length
      ? proch.map((p) => htmlPeriode(p, a)).join("")
      : `<p class="vide">Aucune période connue pour ${txt(zoneAffichee)}.</p>`;

    const an = new Date().getFullYear();
    const fer = prochaines([...feries(an), ...feries(an + 1)], a, N_FERIES);
    $("#liste-feries").innerHTML = fer.map((p) => htmlPeriode(p, a)).join("");
  }

  async function charger() {
    try {
      const r = await vacancesDe(zoneAffichee);
      periodes = r.periodes;
      perime = r.perime;
    } catch (e) {
      periodes = [];
      perime = false;
      cb.echec(e);
    }
    rendre();
  }

  return {
    rendre() {
      // Zone du foyer changée ailleurs (Réglages) ou premier rendu : on repart de la zone du foyer.
      if (zoneAffichee === null || !periodes.length) { zoneAffichee = etat.zone; void charger(); return; }
      rendre();
    },
  };
}
