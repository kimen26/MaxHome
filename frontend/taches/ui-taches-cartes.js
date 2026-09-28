// Rendu des cartes de l'écran Jour (Matin/Soir/Sans moment, Cette semaine/Ce mois) : extrait de
// ui-taches.js pour rester sous 400 lignes (D-036 : fichiers courts). Pur DOM (HTML en chaînes),
// aucune écriture ni état propre — tout vient en paramètre, comme les autres blocs (D-024).

import { txt } from "../socle/ui-base.js";
import { boutonCycle } from "../socle/blocs-cycle.js";
import { partsDe, partsTexte, echeance, jourIso, dernierPassage, avancementPeriode } from "./taches.js";
import { porteurRythme } from "./rythme.js";

// Marqueur du cran « fait à deux » dans le cycle de coche (identique à ui-taches.js : ni un
// prénom, ni null, jamais écrit tel quel en base).
const A_DEUX = "_deux";

/** Carte (en-tête + lignes), gabarit commun à toutes les cartes de l'écran Jour. `compteClasse`
 *  "vert" bascule l'en-tête sur le fond `--vert-clair` (bug 4 : toujours n/N, jamais le mot
 *  « fait »). */
export const carte = (nom, lignesHtml, compte, compteClasse) => `<div class="carte-taches">
  <div class="carte-taches-tete${compteClasse === "vert" ? " tete-complete" : ""}">
    <span>${txt(nom)}</span><span class="mono compte-${compteClasse || "ambre"}">${txt(compte)}</span>
  </div>
  ${lignesHtml || '<p class="vide-carte">Rien.</p>'}
</div>`;

/** Regroupe les occurrences d'un même récurrent, d'une même échéance et d'un même moment :
 *  une ligne par tâche et par carte (le biberon du matin et celui du soir restent deux lignes). */
export function regrouper(liste) {
  const groupes = new Map();
  for (const t of liste) {
    const cle = t.recurrent_id ? `${t.recurrent_id}|${t.echeance}|${t.moment ?? ""}` : `ponctuelle-${t.id}`;
    if (!groupes.has(cle)) groupes.set(cle, t);
  }
  return [...groupes.values()];
}

/** Rendu d'une ligne de tâche : case-cycle, point d'obligation, titre, valeur de droite.
 *  `deps` regroupe ce que la ligne doit lire sans le recalculer (recDe, credit, membres). */
export function ligneTache(t, deps, { metaDroite = null, metaClasse = "" } = {}) {
  const { recDe, credit, membres, valeursCycle, valeurCourante, renduCase } = deps;
  const r = recDe(t);
  const fait = !!t.fait_le;
  const partsLigne = () => {
    if (fait) {
      const c = credit(t);
      return t.qui2 ? `${partsTexte(c[t.qui] ?? 0)}+${partsTexte(c[t.qui2] ?? 0)}` : partsTexte(c[t.qui] ?? 0);
    }
    return partsTexte(partsDe(r, r?.attribue_a ?? null));
  };
  const droite = metaDroite ?? partsLigne();
  // Répétable (D-041) : « +1 » compte une fois de plus dans la période, sans rien ressaisir.
  // Seulement sur une ligne déjà faite : avant, c'est la case qui compte la fois prévue.
  const plusUn = fait && r?.repetable && deps.plusUn
    ? `<button type="button" class="btn-plus-un cible44" data-plus-un="${t.id}" aria-label="${txt(`${t.titre} : une fois de plus`)}">+1</button>` : "";
  const retard = !fait && t.echeance && t.echeance < jourIso(new Date());
  const caseTache = boutonCycle({
    cle: String(t.id), valeurs: valeursCycle(r), valeur: valeurCourante(t),
    rendu: renduCase, classe: "case-tache", taille: "compacte",
  });
  return `<div class="ligne-tache${fait ? " ligne-faite" : retard ? " ligne-retard" : ""}" data-id="${t.id}">
    ${caseTache}
    <span class="point-oblig ${r?.obligatoire ? (fait ? "oblig-faite" : "oblig-due") : "oblig-non"}" aria-hidden="true"></span>
    <span class="titre-tache${fait ? " fait" : ""}">${txt(t.titre)}</span>
    ${plusUn}
    <span class="mono parts-ligne ${metaClasse}">${txt(droite)}</span>
  </div>`;
}

/** Une tâche à étapes sur UNE ligne (D-041) : le titre du parent, « 1/3 », une case qui coche
 *  toutes les étapes restantes d'un coup ; le détail (tap) les coche une par une. */
export function ligneGroupe(parent, occs, deps) {
  const { membres, renduCase, credit } = deps;
  const faites = occs.filter((t) => t.fait_le);
  const complet = faites.length === occs.length;
  const valeur = complet ? (faites[0].qui2 ? "_deux" : faites[0].qui) : null;
  const cle = `g|${occs.map((t) => t.id).join(",")}`;
  const parts = faites.reduce((s, t) => s + Object.values(credit(t)).reduce((a, b) => a + b, 0), 0);
  const caseTache = boutonCycle({ cle, valeurs: [null, ...membres(), A_DEUX], valeur, rendu: renduCase,
    classe: "case-tache", taille: "compacte" });
  return `<div class="ligne-tache${complet ? " ligne-faite" : ""}" data-id="${occs[0].id}">
    ${caseTache}
    <span class="point-oblig ${parent.obligatoire ? (complet ? "oblig-faite" : "oblig-due") : "oblig-non"}" aria-hidden="true"></span>
    <span class="titre-tache${complet ? " fait" : ""}">${txt(parent.titre)}</span>
    <span class="mono parts-ligne${complet ? "" : " ambre"}">${complet ? txt(partsTexte(parts)) : `${faites.length}/${occs.length}`}</span>
  </div>`;
}

/** Carte « Matin » / « Soir » (ou « Sans moment ») : les occurrences quotidiennes du jour dont
 *  la tâche récurrente porte ce moment (handoff §1), plus les ponctuelles sans récurrent quand
 *  `moment` est null. En-tête `faites/total` (bug 4). */
export function carteMoment(nom, moment, jour, ctx) {
  const { duJour, faitesLe, recDe, ponctuelle, etat } = ctx;
  const quotidienne = (t) => recDe(t)?.frequence === "quotidien";
  const momentDe = (t) => t.moment ?? recDe(t)?.moment ?? null;
  const appartient = (t) => (moment === null && ponctuelle(t)) || (quotidienne(t) && momentDe(t) === moment);
  const etape = (t) => !!recDe(t)?.parent_id;
  const restantes = regrouper(duJour(jour).filter((t) => appartient(t) && !etape(t)));
  const faites = faitesLe(jour).filter((t) => appartient(t) && !etape(t));
  // Étapes : une ligne par tâche parente (et par échéance), faites et à faire ensemble.
  const groupes = new Map();
  for (const t of [...duJour(jour), ...faitesLe(jour)].filter((x) => appartient(x) && etape(x))) {
    const cle = `${recDe(t).parent_id}|${t.echeance}`;
    groupes.set(cle, [...(groupes.get(cle) ?? []), t]);
  }
  const lignesGroupes = [...groupes.values()].map((occs) => ({ occs,
    parent: etat.tachesRec.find((r) => r.id === recDe(occs[0]).parent_id),
    complet: occs.every((t) => t.fait_le) })).filter((g) => g.parent);
  const total = restantes.length + faites.length + lignesGroupes.length;
  const nFaites = faites.length + lignesGroupes.filter((g) => g.complet).length;
  const complet = total > 0 && nFaites === total;
  const compte = total ? `${nFaites}/${total}` : "—";
  const lignes = [
    ...restantes.map((t) => ligneTache(t, ctx)),
    ...lignesGroupes.filter((g) => !g.complet).map((g) => ligneGroupe(g.parent, g.occs, ctx)),
    ...faites.map((t) => ligneTache(t, ctx)),
    ...lignesGroupes.filter((g) => g.complet).map((g) => ligneGroupe(g.parent, g.occs, ctx)),
  ].join("");
  return carte(nom, lignes, compte, complet ? "vert" : "ambre");
}

/** Carte Semaine/Mois : avancement sur la période entière, la tâche se coche sur `jour` choisi
 *  (bug 2). Les récurrents d'abord (une ligne par tâche, avancement via `avancementPeriode` et
 *  `dernierPassage`, taches.js), puis les occurrences ponctuelles sans récurrent échues en fin
 *  de période. En-tête = `faits/prévus` de la période entière. */
export function cartePeriode(nom, frequence, jour, ctx) {
  const { etat, ponctuelle } = ctx;
  const recs = etat.tachesRec.filter((r) => r.actif && r.frequence === frequence);
  const finPeriode = echeance(frequence, jour);
  let faitesTotal = 0, prevuesTotal = 0;
  const lignesRec = recs.map((r) => {
    const occs = etat.taches.filter((t) => t.recurrent_id === r.id && t.echeance === finPeriode);
    const faitesN = occs.filter((t) => t.fait_le).length;
    // Occurrence à cocher : la première non faite, sinon la dernière faite (annulation possible).
    const t = occs.find((x) => !x.fait_le) ?? occs.find((x) => x.fait_le) ?? occs[0];
    if (!t) return "";
    const fois = porteurRythme(r, etat.tachesRec).fois ?? 1;
    prevuesTotal += fois;
    faitesTotal += Math.min(faitesN, fois);
    const derniereCoche = [...occs].filter((x) => x.fait_le).sort((a, b) => b.fait_le.localeCompare(a.fait_le))[0];
    const passe = frequence === "mensuel" && faitesN === 0 ? dernierPassage(etat.taches, r.id) : null;
    const av = avancementPeriode({
      faites: faitesN, prevues: fois,
      jourDerniereCoche: derniereCoche ? jourIso(new Date(derniereCoche.fait_le)) : null,
      jourSel: jour, frequence, passe,
    });
    return ligneTache(t, ctx, { metaDroite: av.texte, metaClasse: av.classe });
  }).filter(Boolean);
  const lignesPonctuelles = etat.taches.filter((t) => ponctuelle(t) && t.echeance === finPeriode).map((t) => {
    prevuesTotal += 1;
    if (t.fait_le) faitesTotal += 1;
    return ligneTache(t, ctx);
  });
  const compte = prevuesTotal ? `${faitesTotal}/${prevuesTotal}` : "—";
  const complet = prevuesTotal > 0 && faitesTotal >= prevuesTotal;
  return carte(nom, [...lignesRec, ...lignesPonctuelles].join(""), compte, complet ? "vert" : "ambre");
}

export { A_DEUX };
