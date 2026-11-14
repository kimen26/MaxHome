// Formulaire « Proposer une date » (feuille ouverte par le bloc blocs-reglages) : titre, mot,
// période avec raccourcis, aperçu des jours (toucher = inverse libre/pris), visibilité des
// réponses. Le calcul des jours est PUR (jours-libres.js) : ici on lit l'état déjà chargé par
// l'Agenda (etat.google, etat.voyages, etat.vacances), on ne refait aucune requête.

import { txt } from "../socle/ui-base.js";
import { champ, zone, caseACocher, lire } from "../socle/blocs-form.js";
import { formatPeriode, jourIso } from "../agenda/calendrier.js";
import { erreurPeriode, feriesDePeriode, joursLibres, periodeCeMois, periodeCeWeekEnd, periodeQuatreWeekEnds } from "./jours-libres.js";
import { champsSondage, MESSAGE_MAX, TITRE_MAX } from "./suivi.js";

const RACCOURCIS = [
  ["weekend", "Ce week-end", periodeCeWeekEnd],
  ["quatre", "Les 4 prochains week-ends", periodeQuatreWeekEnds],
  ["mois", "Ce mois-ci", periodeCeMois],
];

/** Une ligne de l'aperçu : date, état en toutes lettres (jamais la couleur seule), férié/vacances. */
function ligneJour(j, i) {
  const marques = [j.ferie ? `Férié : ${j.ferie}` : "", j.vacances ? `Vacances : ${j.vacances}` : ""].filter(Boolean);
  return `<button type="button" class="pr-jour ${j.libre ? "libre" : "pris"}" data-jour="${i}" aria-pressed="${j.libre}">
    <span class="pr-jour-date">${txt(formatPeriode(j.jour, j.jour))}${marques.length ? `<small>${txt(marques.join(" · "))}</small>` : ""}</span>
    <span class="pr-jour-etat">${j.libre ? "✓ Libre" : "Pris"}</span></button>`;
}

export function creerFormulaireSondage(etat) {
  let jours = [];      // aperçu courant, modifiable au toucher
  let erreur = null;   // dernière erreur de période, montrée sous les dates

  const html = () => `
    ${champ("titre", "Titre", { requis: true, placeholder: "Raclette", attrs: `maxlength="${TITRE_MAX}"` })}
    ${zone("message", "Un mot pour les invités (facultatif)", "", { lignes: 2, attrs: `maxlength="${MESSAGE_MAX}"` })}
    <div class="pr-raccourcis">${RACCOURCIS.map(([k, l]) => `<button type="button" class="btn" data-raccourci="${k}">${txt(l)}</button>`).join("")}</div>
    <div class="pr-deux">${champ("debut", "Du", { type: "date", requis: true })}${champ("fin", "Au", { type: "date", requis: true })}</div>
    ${caseACocher("weekends", "Week-ends seulement", true)}
    <div class="pr-apercu" data-apercu aria-live="polite"></div>
    ${caseACocher("reponses_visibles", "Les invités voient les réponses des autres", false)}`;

  function dessiner(form) {
    const zoneApercu = form.querySelector("[data-apercu]");
    if (erreur) { zoneApercu.innerHTML = `<p class="pr-erreur" role="alert">${txt(erreur)}</p>`; return; }
    const libres = jours.filter((j) => j.libre).length;
    zoneApercu.innerHTML = `<p class="pr-compte">${libres} jour${libres > 1 ? "s" : ""} libre${libres > 1 ? "s" : ""} sur ${jours.length}. Touchez un jour pour le changer.</p>
      <div class="pr-jours">${jours.map(ligneJour).join("")}</div>`;
  }

  function recalculer(form) {
    const [debut, fin, weekends] = [form.elements.debut.value, form.elements.fin.value, form.elements.weekends.checked];
    erreur = erreurPeriode(debut, fin, jourIso(new Date()));
    jours = erreur ? [] : joursLibres(debut, fin, {
      google: etat.google, voyages: etat.voyages, vacances: etat.vacances,
      feries: feriesDePeriode(debut, fin), weekendsSeuls: weekends,
    });
    dessiner(form);
  }

  function appliquer(form, periode) {
    form.elements.debut.value = periode.debut;
    form.elements.fin.value = periode.fin;
    form.elements.weekends.checked = periode.weekendsSeuls;
    recalculer(form);
  }

  function apresOuverture(form) {
    form.classList.add("pr-form");
    form.querySelector('[type="submit"]').textContent = "Créer le lien";
    for (const b of form.querySelectorAll("[data-raccourci]")) {
      const [, , calcul] = RACCOURCIS.find(([k]) => k === b.dataset.raccourci);
      b.addEventListener("click", () => appliquer(form, calcul(jourIso(new Date()))));
    }
    for (const n of ["debut", "fin", "weekends"]) form.elements[n].addEventListener("change", () => recalculer(form));
    form.querySelector("[data-apercu]").addEventListener("click", (e) => {
      const b = e.target.closest("[data-jour]");
      if (!b) return;
      const i = Number(b.dataset.jour);
      jours = jours.map((j, k) => (k === i ? { ...j, libre: !j.libre } : j));
      dessiner(form);
    });
    appliquer(form, periodeQuatreWeekEnds(jourIso(new Date())));
  }

  /** Colonnes à écrire ; lève une erreur lisible (affichée par le bloc) si le formulaire est invalide. */
  function champs(form) {
    if (erreur) throw new Error(erreur);
    const lu = lire(form, { booleens: ["weekends", "reponses_visibles"] });
    return champsSondage({ titre: lu.titre, message: lu.message, jours, reponsesVisibles: lu.reponses_visibles }, etat.prenom);
  }

  return { html, apresOuverture, champs };
}
