// Écran « Agenda · Mois » : grille du mois (lundi → dimanche) avec les vacances scolaires de
// notre zone, les voyages et les jours fériés, puis la liste des événements du mois en texte —
// la couleur d'une case ne porte jamais l'information seule (rules/mobile-parents.md).

import { $, txt, MOIS, decaler } from "../socle/ui-base.js";
import { grilleMois, feries, evenementsDuMois, couvre, jourIso, formatPeriode, nbJours, relatif } from "./calendrier.js";

const JOURS = ["L", "M", "M", "J", "V", "S", "D"];
const TYPES = { vacances: "Vacances", voyage: "Voyage", ferie: "Férié" };

export function creerUiAgenda(api, etat, cb) {
  const auj = () => jourIso(new Date());

  function evenements() {
    const { annee, mois } = etat.agenda;
    return evenementsDuMois(annee, mois, {
      vacances: etat.vacances, voyages: etat.voyages, feries: [...feries(annee - 1), ...feries(annee), ...feries(annee + 1)],
    });
  }

  function htmlCase(c, evts, a) {
    if (!c.dansMois) return `<div class="agenda-case hors-mois" aria-hidden="true"><span class="agenda-jour">${c.jour}</span></div>`;
    const ici = evts.filter((e) => couvre(e, c.iso));
    const types = [...new Set(ici.map((e) => e.type))];
    const classes = ["agenda-case", ...types.map((t) => `a-${t}`), c.iso === a ? "aujourdhui" : ""].filter(Boolean).join(" ");
    const libelle = ici.length ? ` : ${ici.map((e) => `${TYPES[e.type]} ${e.titre}`).join(", ")}` : "";
    return `<div class="${classes}" aria-label="${txt(c.jour)}${txt(libelle)}">
      <span class="agenda-jour">${c.jour}</span>
      ${types.includes("voyage") ? `<span class="agenda-marque-voyage" aria-hidden="true"></span>` : ""}
      ${types.includes("ferie") ? `<span class="agenda-marque-ferie" aria-hidden="true">F</span>` : ""}
    </div>`;
  }

  function htmlEvenement(e, a) {
    const duree = e.type === "ferie" ? "" : ` · ${nbJours(e.debut, e.fin)} j`;
    const lieu = e.type === "voyage" && e.lieu ? ` · ${txt(e.lieu)}` : "";
    return `<div class="agenda-evt a-${e.type}">
      <span class="agenda-evt-type">${TYPES[e.type]}</span>
      <span class="agenda-evt-corps">
        <span class="agenda-evt-titre">${txt(e.titre)}${lieu}</span>
        <span class="sous">${txt(formatPeriode(e.debut, e.fin))}${duree} · ${txt(relatif(e, a))}</span>
      </span>
    </div>`;
  }

  function rendre() {
    const { annee, mois } = etat.agenda;
    const a = auj();
    const evts = evenements();
    $("#agenda-titre").textContent = `${MOIS[mois - 1][0].toUpperCase()}${MOIS[mois - 1].slice(1)} ${annee}`;
    $("#agenda-grille").innerHTML = `
      <div class="agenda-entete">${JOURS.map((j) => `<span>${j}</span>`).join("")}</div>
      ${grilleMois(annee, mois).map((s) => `<div class="agenda-semaine">${s.map((c) => htmlCase(c, evts, a)).join("")}</div>`).join("")}`;
    $("#agenda-evenements").innerHTML = evts.length
      ? evts.map((e) => htmlEvenement(e, a)).join("")
      : `<p class="vide">Rien de prévu ce mois-ci.</p>`;
    $("#agenda-zone").textContent = etat.vacancesPerimees
      ? `Vacances ${etat.zone} (hors ligne, liste peut-être ancienne)`
      : `Vacances ${etat.zone}`;
  }

  function bouger(n) {
    [etat.agenda.annee, etat.agenda.mois] = decaler(etat.agenda.annee, etat.agenda.mois, n);
    rendre();
  }

  $("#agenda-prec").addEventListener("click", () => bouger(-1));
  $("#agenda-suiv").addEventListener("click", () => bouger(1));
  $("#agenda-auj").addEventListener("click", () => {
    const d = new Date();
    etat.agenda = { annee: d.getFullYear(), mois: d.getMonth() + 1 };
    rendre();
  });

  return { rendre };
}
