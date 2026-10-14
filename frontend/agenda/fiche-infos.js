// Infos de la fiche voyage V3 en lecture : résumé, réservations, blocs Info/Astuce/Attention.
// Rendu PUR depuis (voyage, resas, blocs) ; `lectureSeule` retire codes, prix et payeurs (le lot
// « partage » le rappelle tel quel). La fiche connectée garde ses sous-écrans éditables
// (ui-fiche-resas / budget / blocs) pour l'onglet Infos ; ce rendu sert aux pages sans compte.
import { txt } from "../socle/ui-base.js";
import { euros } from "../budget/calc.js";
import { TYPES_BLOC, TYPES_RESA } from "./carnet.js";
import { rendreTopo } from "./topo.js";
import { jourCourt, heureDe } from "./fiche-statuts.js";

function carteBloc(b) {
  const type = TYPES_BLOC.find((t) => t.valeur === b.type) ?? TYPES_BLOC[1];
  const rendu = rendreTopo(b.texte);
  return `<div class="carte-bloc" style="background:${type.fond};border-color:${type.bord}">
    <span class="cb-pastille" style="color:${type.bord}">${type.emoji} ${txt(type.libelle)}</span>
    ${b.titre ? `<h3 class="cb-titre">${txt(b.titre)}</h3>` : ""}
    ${rendu ? `<div class="cb-texte topo-rendu">${rendu}</div>` : ""}
  </div>`;
}

function ligneResa(r, lectureSeule) {
  const type = TYPES_RESA.find((t) => t.valeur === r.type) ?? TYPES_RESA.at(-1);
  const quand = r.debut ? [jourCourt(r.debut.slice(0, 10)), heureDe(r.debut)].filter(Boolean).join(" · ") : "";
  const prive = lectureSeule ? "" : [
    r.prix_centimes != null ? euros(r.prix_centimes) : "", r.paye_par ? `payé par ${r.paye_par}` : "", r.code ?? "",
  ].filter(Boolean).join(" · ");
  return `<li class="fv-info-resa"><span class="fv-ico" aria-hidden="true">${type.emoji}</span>
    <div class="fv-item-c"><span class="fv-item-n">${txt(r.titre)}</span>
    <span class="fv-item-d">${txt([type.libelle, quand, r.statut === "reserve" ? "Réservé" : "À réserver"].filter(Boolean).join(" · "))}</span>
    ${prive ? `<span class="fv-item-d">${txt(prive)}</span>` : ""}</div></li>`;
}

export function rendreInfos(voyage, resas, blocs, { lectureSeule = false } = {}) {
  const resume = blocs.find((b) => b.type === "resume");
  const autres = blocs.filter((b) => b.type !== "resume").sort((a, c) => a.ordre - c.ordre);
  const actives = resas.filter((r) => r.statut !== "annule").sort((a, b) => (a.debut ?? "").localeCompare(b.debut ?? ""));
  return `<div class="fv-infos">
    ${resume ? carteBloc(resume) : ""}
    ${actives.length ? `<h3 class="fv-groupe-t">Réservations</h3><ul class="fv-items">${actives.map((r) => ligneResa(r, lectureSeule)).join("")}</ul>` : ""}
    ${autres.map(carteBloc).join("")}
  </div>`;
}
