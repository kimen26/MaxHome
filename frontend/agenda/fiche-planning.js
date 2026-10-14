// Planning de la fiche voyage V3 : une carte par jour (date longue, titre court, statut en mot,
// météo croisée, conseil pluie, éléments colorés par statut, nuit en dernier). Rendu PUR depuis
// (voyage, lieux, resas, meteo). Il n'affiche ni prix, ni code, ni payeur, ni action : le lot
// « partage » le rappelle tel quel, sans drapeau lecture seule à poser.
import { txt } from "../socle/ui-base.js";
import { CATEGORIES_LIEU, TYPES_RESA, resaDuLieu } from "./carnet.js";
import { planningParJour } from "./planning.js";
import { libelleMeteo } from "./meteo.js";
import { pastilleStatut, jourLong, heureDe } from "./fiche-statuts.js";

const emojiLieu = (l) => CATEGORIES_LIEU.find((c) => c.valeur === l.categorie)?.emoji ?? "📍";
const emojiResa = (r) => TYPES_RESA.find((t) => t.valeur === r.type)?.emoji ?? "📌";

const ligne = ({ emoji, nom, detail, statut, classe = "" }) => `<li class="fv-item fv-${statut}${classe}">
    <span class="fv-ico" aria-hidden="true">${emoji}</span>
    <div class="fv-item-c"><span class="fv-item-n">${txt(nom)}</span>${detail ? `<span class="fv-item-d">${txt(detail)}</span>` : ""}</div>
    ${pastilleStatut(statut)}
  </li>`;

function ligneElement(e, resas) {
  if (e.type === "resa") return ligne({ emoji: emojiResa(e.objet), nom: e.objet.titre, detail: heureDe(e.objet.debut), statut: e.statut });
  const l = e.objet;
  const detail = [heureDe(resaDuLieu(l, resas)?.debut) || l.horaires, l.statut === "fait" ? "✓ Fait" : ""].filter(Boolean).join(" · ");
  return ligne({ emoji: emojiLieu(l), nom: l.nom, detail, statut: e.statut });
}

function ligneMeteo(s) {
  if (!s) return "";
  const icone = s.verdict === "pluie" ? "" : `${s.icone} `;
  return `<p class="fv-meteo fv-meteo-${s.verdict}">${txt(icone + libelleMeteo(s))}</p>`;
}

/** `meteo` : Map jour → synthèse (chargerMeteo) ou null. */
export function rendrePlanning(voyage, lieux, resas, meteo = null) {
  const jours = planningParJour(voyage, lieux, resas).map((j) => {
    const m = meteo?.get(j.jour) ?? null;
    const lignes = [
      ...j.liberer.map((x) => ligne({ emoji: "🛏️", nom: `Libérer : ${x.resa.titre}`, statut: x.statut })),
      ...j.elements.map((e) => ligneElement(e, resas)),
      ...j.nuits.map((x) => ligne({ emoji: "🌙", nom: `Nuit : ${x.resa.titre}`, statut: x.statut })),
    ];
    return `<article class="fv-jour fv-${j.statut}" id="fv-jour-${j.jour}" data-jour="${j.jour}">
      <header class="fv-jour-tete">
        <div><h3>${txt(jourLong(j.jour))}</h3><p class="fv-jour-titre">${txt(j.titreCourt)}</p></div>
        ${pastilleStatut(j.statut)}
      </header>
      ${ligneMeteo(m)}
      ${m?.verdict === "pluie" ? `<p class="fv-conseil">☔ Prévoir la pluie</p>` : ""}
      ${lignes.length ? `<ul class="fv-items">${lignes.join("")}</ul>` : `<p class="fv-vide">Rien de prévu.</p>`}
    </article>`;
  });
  const mention = meteo?.size ? `<p class="fv-mention">Météo : Open-Meteo, plusieurs modèles, fiable à 2-3 jours.</p>` : "";
  return `<div class="fv-planning">${jours.join("")}${mention}</div>`;
}
