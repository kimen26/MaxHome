// Rendu des cartes de l'écran Jour (Matin/Soir/Sans moment, Cette semaine/Ce mois) : extrait de
// ui-taches.js pour rester sous 400 lignes (D-036 : fichiers courts). Pur DOM (HTML en chaînes),
// aucune écriture ni état propre — tout vient en paramètre, comme les autres blocs (D-024).

import { txt } from "../socle/ui-base.js";
import { boutonCycle } from "../socle/blocs-cycle.js";
import { partsDe, partsTexte, echeance, jourIso, dernierPassage, avancementPeriode } from "./taches.js";

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

/** Regroupe les occurrences d'un même récurrent et d'une même échéance : une ligne par tâche. */
export function regrouper(liste) {
  const groupes = new Map();
  for (const t of liste) {
    const cle = t.recurrent_id ? `${t.recurrent_id}|${t.echeance}` : `ponctuelle-${t.id}`;
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
  const retard = !fait && t.echeance && t.echeance < jourIso(new Date());
  const caseTache = boutonCycle({
    cle: String(t.id), valeurs: valeursCycle(r), valeur: valeurCourante(t),
    rendu: renduCase, classe: "case-tache", taille: "compacte",
  });
  return `<div class="ligne-tache${fait ? " ligne-faite" : retard ? " ligne-retard" : ""}" data-id="${t.id}">
    ${caseTache}
    <span class="point-oblig ${r?.obligatoire ? (fait ? "oblig-faite" : "oblig-due") : "oblig-non"}" aria-hidden="true"></span>
    <span class="titre-tache${fait ? " fait" : ""}">${txt(t.titre)}</span>
    <span class="mono parts-ligne ${metaClasse}">${txt(droite)}</span>
  </div>`;
}

/** Carte « Matin » / « Soir » (ou « Sans moment ») : les occurrences quotidiennes du jour dont
 *  la tâche récurrente porte ce moment (handoff §1), plus les ponctuelles sans récurrent quand
 *  `moment` est null. En-tête `faites/total` (bug 4). */
export function carteMoment(nom, moment, jour, ctx) {
  const { duJour, faitesLe, recDe, ponctuelle } = ctx;
  const quotidienne = (t) => recDe(t)?.frequence === "quotidien";
  const appartient = (t) => moment === null && ponctuelle(t) ? true
    : quotidienne(t) && (recDe(t)?.moment ?? null) === moment;
  const restantes = regrouper(duJour(jour)).filter(appartient);
  const faites = faitesLe(jour).filter(appartient);
  const total = restantes.length + faites.length;
  const complet = total > 0 && restantes.length === 0;
  const compte = total ? `${faites.length}/${total}` : "—";
  const lignes = [...restantes, ...faites].map((t) => ligneTache(t, ctx)).join("");
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
    prevuesTotal += r.fois;
    faitesTotal += Math.min(faitesN, r.fois);
    const derniereCoche = [...occs].filter((x) => x.fait_le).sort((a, b) => b.fait_le.localeCompare(a.fait_le))[0];
    const passe = frequence === "mensuel" && faitesN === 0 ? dernierPassage(etat.taches, r.id) : null;
    const av = avancementPeriode({
      faites: faitesN, prevues: r.fois,
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
