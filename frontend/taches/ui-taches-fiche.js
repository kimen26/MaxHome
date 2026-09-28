// Fiche d'une tâche récurrente (Réglages · Tâches, D-041) : ce qu'on saisit, dans l'ordre où
// on y pense — titre, thème, rythme (et ses créneaux), temps, obligatoire, répétable. Le temps
// fait les parts (1 part = 5 minutes) : la fiche ne parle jamais de parts. Les réglages rares
// (chacun son temps, plusieurs façons de faire) tiennent en petit sous le temps, repliés.
// Ce fichier rend et lit le formulaire ; le cycle d'écriture reste dans blocs-reglages.js (D-024).

import { txt } from "../socle/ui-base.js";
import { champ, zone, select, caseACocher, listeChoix, membresOptions, lire } from "../socle/blocs-form.js";
import { MOMENTS, TEMPS, texteTemps, quartsDesMinutes } from "./rythme.js";

const RYTHMES = [["quotidien", "Chaque jour"], ["hebdo", "Chaque semaine"], ["mensuel", "Chaque mois"], ["au_besoin", "Au besoin"]];
// Un créneau se tape pour passer à l'état suivant : éteint → tous les jours → semaine → week-end.
const ETATS_CRENEAU = [null, "tous", "semaine", "we"];
const SUFFIXE_JOURS = { tous: "", semaine: " · sem.", we: " · w-e" };
const NB_VARIANTES = 3;
const optionsTemps = TEMPS.map((m) => [m, texteTemps(m)]);

/** Temps qu'on retrouve depuis des parts (quarts) : l'inverse de quartsDesMinutes. */
const minutesDesQuarts = (q) => (q <= 2 ? 2 : Math.round((q * 5) / 4));

function boutonCreneau(moment, libelle, jours) {
  return `<button type="button" class="puce-creneau cible44${jours ? " actif" : ""}" data-creneau="${moment}"
    data-jours="${jours ?? ""}" aria-pressed="${!!jours}">${txt(libelle)}${jours ? SUFFIXE_JOURS[jours] : ""}</button>`;
}

/**
 * HTML de la fiche. `r` : la tâche (null = nouvelle) ; `parent` : non null pour une étape
 * (elle suit le rythme et le thème de son parent, la fiche ne les montre pas).
 */
export function htmlFiche(r, { etat, parent = null, etapes = [], categories = [] }) {
  const membres = etat.membres.map((m) => m.prenom);
  const etape = !!parent;
  const creneaux = Object.fromEntries((r?.creneaux ?? []).map((c) => [c.moment, c.jours]));
  const spe = r?.parts_spe;
  const variantes = r?.variantes ?? [];
  const temps = r?.minutes ?? 10;
  const rythme = etape ? "" : `
    ${champ("categorie", "Thème", { valeur: r?.categorie ?? "Maison", attrs: 'list="cats-rec"' })}
    ${listeChoix("cats-rec", categories)}
    ${select("frequence", "Rythme", RYTHMES, r?.frequence ?? "quotidien")}
    <div class="fiche-creneaux" data-si="quotidien">
      <span class="etiquette-champ">Quand dans la journée</span>
      <div class="puces-creneaux">${MOMENTS.map(([m, lib]) => boutonCreneau(m, lib, creneaux[m])).join("")}</div>
      <span class="aide-champ">Tap : tous les jours, puis en semaine, puis le week-end. Aucun : dans la journée.</span>
    </div>
    ${champ("fois", "Combien de fois, au moins", { type: "number", valeur: r?.fois ?? 1, attrs: 'min="1" max="10" data-si="fois"' })}`;
  return `
    ${champ("titre", "Titre", { valeur: r?.titre, requis: true })}
    ${rythme}
    ${select("minutes", "Temps", optionsTemps, TEMPS.includes(temps) ? temps : 10, { attrs: "data-si-temps" })}
    <div class="fiche-mini">
      <label class="case-a-cocher petite"><input type="checkbox" name="chacun"${spe ? " checked" : ""}> Chacun son temps</label>
      <div class="fiche-mini-corps" data-si-chacun>
        ${membres.map((p) => select(`spe_${p}`, p, optionsTemps, spe?.[p] ? minutesDesQuarts(spe[p]) : temps)).join("")}
      </div>
      ${etape ? "" : `<label class="case-a-cocher petite"><input type="checkbox" name="plusieurs"${variantes.length ? " checked" : ""}> Plusieurs façons de faire</label>
      <div class="fiche-mini-corps fiche-variantes" data-si-plusieurs>
        ${Array.from({ length: NB_VARIANTES }, (_, i) => `<div class="ligne-variante">
          ${champ(`var_nom_${i}`, `Façon ${i + 1}`, { valeur: variantes[i]?.nom ?? "", placeholder: ["Réchauffer", "Commandé", "Cuisiner"][i] })}
          ${select(`var_min_${i}`, "Temps", optionsTemps, variantes[i]?.minutes ?? 5)}
        </div>`).join("")}
      </div>`}
    </div>
    ${etape ? caseACocher("facultatif", "Seulement quand il y en a (on l'ajoute après coup)", r?.facultatif)
      : `${caseACocher("obligatoire", "Obligatoire", r?.obligatoire)}
         ${caseACocher("repetable", "Répétable : peut se refaire dans la période", r?.repetable)}`}
    ${etape || !r ? "" : `<div class="fiche-etapes">
      <span class="etiquette-champ">Étapes${etapes.length ? "" : " (aucune)"}</span>
      ${etapes.map((e) => `<button type="button" class="ligne-etape cible44" data-etape="${e.id}">
        <span>${txt(e.titre)}${e.facultatif ? " <em>si besoin</em>" : ""}</span><span class="mono">${txt(texteTemps(e.minutes))} ›</span></button>`).join("")}
      <button type="button" class="btn-tirets" data-nouvelle-etape>+ Ajouter une étape</button>
    </div>`}
    ${select("attribue_a", "D'habitude", membresOptions(etat), r?.attribue_a, { vide: "Personne en particulier" })}
    ${zone("consigne", "Consigne", r?.consigne)}`;
}

/** Visibilité conditionnelle et puces de créneaux. Rien n'est écrit ici. */
export function brancherFiche(form, { surEtape, surNouvelleEtape } = {}) {
  const montrer = (sel, oui) => { for (const el of form.querySelectorAll(sel)) el.hidden = !oui; };
  const aCreneau = () => [...form.querySelectorAll("[data-creneau]")].some((b) => b.dataset.jours);
  function maj() {
    const freq = form.frequence?.value;
    if (freq) {
      montrer("[data-si='quotidien']", freq === "quotidien");
      const fois = form.querySelector("[data-si='fois']")?.closest("label");
      if (fois) fois.hidden = freq === "au_besoin" || (freq === "quotidien" && aCreneau());
    }
    montrer("[data-si-chacun]", form.chacun.checked);
    // Plusieurs façons de faire : le temps vient de chaque façon, le champ Temps se cache.
    const plusieurs = form.plusieurs?.checked ?? false;
    montrer("[data-si-plusieurs]", plusieurs);
    const temps = form.querySelector("[data-si-temps]");
    if (temps) temps.hidden = plusieurs;
  }
  for (const b of form.querySelectorAll("[data-creneau]")) {
    b.addEventListener("click", () => {
      const i = ETATS_CRENEAU.indexOf(b.dataset.jours || null);
      const jours = ETATS_CRENEAU[(i + 1) % ETATS_CRENEAU.length];
      const libelle = MOMENTS.find(([m]) => m === b.dataset.creneau)[1];
      b.dataset.jours = jours ?? "";
      b.classList.toggle("actif", !!jours);
      b.setAttribute("aria-pressed", String(!!jours));
      b.textContent = libelle + (jours ? SUFFIXE_JOURS[jours] : "");
      maj();
    });
  }
  for (const el of form.querySelectorAll("select[name=frequence], input[name=chacun], input[name=plusieurs]")) {
    el.addEventListener("change", maj);
  }
  for (const b of form.querySelectorAll("[data-etape]")) b.addEventListener("click", () => surEtape?.(Number(b.dataset.etape)));
  form.querySelector("[data-nouvelle-etape]")?.addEventListener("click", () => surNouvelleEtape?.());
  maj();
}

/** Colonnes à écrire. Les parts se calculent ici, depuis le temps (D-041). */
export function lireFiche(form, { etat, etape = false }) {
  const membres = etat.membres.map((m) => m.prenom);
  const v = lire(form, { nombres: ["fois", "minutes", ...membres.map((p) => `spe_${p}`),
    ...Array.from({ length: NB_VARIANTES }, (_, i) => `var_min_${i}`)],
  booleens: ["obligatoire", "repetable", "facultatif", "chacun", "plusieurs"] });
  if (!v.titre) throw new Error("Le titre est obligatoire.");
  const variantes = v.plusieurs
    ? Array.from({ length: NB_VARIANTES }, (_, i) => ({ nom: v[`var_nom_${i}`], minutes: v[`var_min_${i}`] })).filter((x) => x.nom)
    : [];
  if (v.plusieurs && !variantes.length) throw new Error("Donne un nom à au moins une façon de faire.");
  const minutes = variantes.length ? variantes[0].minutes : v.minutes;
  const commun = {
    titre: v.titre, minutes, parts_quart: quartsDesMinutes(minutes),
    parts_spe: v.chacun ? Object.fromEntries(membres.map((p) => [p, quartsDesMinutes(v[`spe_${p}`])])) : null,
    attribue_a: v.attribue_a, consigne: v.consigne,
  };
  if (etape) return { ...commun, facultatif: v.facultatif };
  const creneaux = v.frequence === "quotidien"
    ? [...form.querySelectorAll("[data-creneau]")].filter((b) => b.dataset.jours)
      .map((b) => ({ moment: b.dataset.creneau, jours: b.dataset.jours }))
    : [];
  return {
    ...commun, categorie: v.categorie ?? "Maison", frequence: v.frequence,
    creneaux: creneaux.length ? creneaux : null, moment: null,
    fois: v.frequence === "au_besoin" ? 1 : creneaux.length || Math.max(1, v.fois || 1),
    variantes: variantes.length ? variantes : null,
    obligatoire: v.obligatoire, repetable: v.repetable,
  };
}
