// Écran « Agenda · Mois » : grille du mois (lundi → dimanche) avec les vacances scolaires de
// notre zone, les voyages, les jours fériés et les événements de l'agenda Google du foyer
// (une pastille par personne présente ce jour), puis la liste groupée par jour. Chaque case du
// mois est un bouton : toucher un jour filtre la liste sur ce jour. La couleur ne porte jamais
// l'information seule : initiale dans la pastille, prénom dans la légende et la liste
// (rules/mobile-parents.md). La liste elle-même est dans ui-agenda-liste.js ; le formulaire
// d'ajout / modification / suppression d'un événement Google dans ui-agenda-form.js.

import { $, txt, MOIS, decaler } from "../socle/ui-base.js";
import {
  grilleMois, feries, evenementsDuMois, evenementsDuJour, joursDuMois, personnesDuJour, couvre, jourIso, QUI,
} from "./calendrier.js";
import { TYPES, pastilleQui, htmlListe } from "./ui-agenda-liste.js";
import { creerFormulaireEvenement } from "./ui-agenda-form.js";

const JOURS = ["L", "M", "M", "J", "V", "S", "D"];
const PASTILLES_MAX = 3;
const FORMAT_JOUR = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const depuis = (iso) => { const [a, m, j] = iso.split("-").map(Number); return new Date(a, m - 1, j); };

/** `recharger` : () => Promise<événements Google> (la fenêtre de mois chargée par mod-agenda.js). */
export function creerUiAgenda(api, etat, cb, { recharger }) {
  const auj = () => jourIso(new Date());

  function evenements() {
    const { annee, mois } = etat.agenda;
    return evenementsDuMois(annee, mois, {
      vacances: etat.vacances, voyages: etat.voyages, google: etat.google,
      feries: [...feries(annee - 1), ...feries(annee), ...feries(annee + 1)],
    });
  }

  /** Phrase lue par un lecteur d'écran : le jour, puis chaque événement avec son type ou sa personne. */
  function libelleCase(c, ici) {
    const jour = FORMAT_JOUR.format(depuis(c.iso));
    if (!ici.length) return `${jour} : rien de prévu`;
    const dits = ici.map((e) => (e.type === "foyer" ? `${e.qui} ${e.titre}` : `${TYPES[e.type]} ${e.titre}`));
    return `${jour} : ${dits.join(", ")}`;
  }

  function htmlPastilles(personnes) {
    if (!personnes.length) return "";
    const reste = personnes.length - PASTILLES_MAX;
    return `<span class="agenda-pastilles" aria-hidden="true">${personnes.slice(0, PASTILLES_MAX).map(pastilleQui).join("")}${
      reste > 0 ? `<span class="agenda-plus">+${reste}</span>` : ""}</span>`;
  }

  function htmlCase(c, evts, a) {
    if (!c.dansMois) return `<div class="agenda-case hors-mois" aria-hidden="true"><span class="agenda-jour">${c.jour}</span></div>`;
    const ici = evenementsDuJour(evts, c.iso);
    const types = [...new Set(ici.map((e) => e.type))];
    const choisi = etat.agenda.jour === c.iso;
    const classes = ["agenda-case", ...types.map((t) => `a-${t}`), c.iso === a ? "aujourdhui" : ""].filter(Boolean).join(" ");
    return `<button type="button" class="${classes}" data-jour="${c.iso}" aria-pressed="${choisi}"
        aria-label="${txt(libelleCase(c, ici))}">
      <span class="agenda-haut"><span class="agenda-jour">${c.jour}</span>${
        types.includes("ferie") ? `<span class="agenda-marque-ferie" aria-hidden="true">F</span>` : ""}</span>
      ${htmlPastilles(personnesDuJour(evts, c.iso))}
      ${types.includes("voyage") ? `<span class="agenda-marque-voyage" aria-hidden="true"></span>` : ""}
    </button>`;
  }

  const htmlLegende = () => QUI.map((q) => `<span class="agenda-legende-item">${pastilleQui(q)}${txt(q)}</span>`).join("");

  function htmlListeChoisie(evts, a) {
    const { annee, mois, jour } = etat.agenda;
    if (!jour) return evts.length ? htmlListe(joursDuMois(evts, annee, mois), a) : `<p class="vide">Rien de prévu ce mois-ci.</p>`;
    const duJour = evenementsDuJour(evts, jour);
    const corps = duJour.length ? htmlListe([{ iso: jour, evenements: duJour }], a) : `<p class="vide">Rien de prévu ce jour-là.</p>`;
    return `<button type="button" class="agenda-tout" data-tout>Tout le mois</button>${corps}`;
  }

  function rendre() {
    const { annee, mois } = etat.agenda;
    const a = auj();
    const evts = evenements();
    $("#agenda-titre").textContent = `${MOIS[mois - 1][0].toUpperCase()}${MOIS[mois - 1].slice(1)} ${annee}`;
    $("#agenda-grille").innerHTML = `
      <div class="agenda-entete">${JOURS.map((j) => `<span>${j}</span>`).join("")}</div>
      ${grilleMois(annee, mois).map((s) => `<div class="agenda-semaine">${s.map((c) => htmlCase(c, evts, a)).join("")}</div>`).join("")}`;
    $("#agenda-legende").innerHTML = htmlLegende();
    $("#agenda-evenements").innerHTML = htmlListeChoisie(evts, a);
    $("#agenda-zone").textContent = etat.vacancesPerimees
      ? `Vacances ${etat.zone} (hors ligne, liste peut-être ancienne)`
      : `Vacances ${etat.zone}`;
  }

  /** Après une écriture réussie : relit l'agenda Google puis rend l'écran. Un échec de relecture
   *  est signalé, l'écran garde ce qu'il avait. */
  async function apresEcriture() {
    try {
      etat.google = await recharger();
      rendre();
    } catch (e) { cb.echec(e); }
  }
  const formulaire = creerFormulaireEvenement(api, etat, cb, { apres: apresEcriture });

  /** Change le jour choisi (null = tout le mois) puis rend le focus au bouton touché. */
  function choisir(jour) {
    etat.agenda = { ...etat.agenda, jour };
    rendre();
    (jour ? $(`#agenda-grille [data-jour="${jour}"]`) : null)?.focus();
  }

  function bouger(n) {
    const [annee, mois] = decaler(etat.agenda.annee, etat.agenda.mois, n);
    etat.agenda = { annee, mois, jour: null };
    rendre();
  }

  $("#agenda-prec").addEventListener("click", () => bouger(-1));
  $("#agenda-suiv").addEventListener("click", () => bouger(1));
  $("#agenda-auj").addEventListener("click", () => {
    const d = new Date();
    etat.agenda = { annee: d.getFullYear(), mois: d.getMonth() + 1, jour: null };
    rendre();
  });
  $("#agenda-grille").addEventListener("click", (ev) => {
    const bouton = ev.target.closest("[data-jour]");
    if (bouton) choisir(etat.agenda.jour === bouton.dataset.jour ? null : bouton.dataset.jour);
  });
  $("#agenda-evenements").addEventListener("click", (ev) => {
    if (ev.target.closest("[data-tout]")) { choisir(null); return; }
    const ligne = ev.target.closest("[data-evt]");
    const evenement = ligne && evenements().find((e) => e.type === "foyer" && e.id === ligne.dataset.evt);
    if (evenement) formulaire.ouvrir({ jour: etat.agenda.jour ?? auj(), evenement });
  });
  $("#agenda-ajouter").addEventListener("click", () => formulaire.ouvrir({ jour: etat.agenda.jour ?? auj() }));

  return { rendre };
}
