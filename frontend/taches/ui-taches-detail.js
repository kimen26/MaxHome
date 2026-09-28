// Morceaux du détail d'une tâche (écran Jour) apportés par D-041 : la façon de faire
// (variantes), les étapes d'une tâche regroupée, et « une fois de plus » (répétable). Extrait
// de ui-taches.js pour rester sous 400 lignes ; HTML en chaînes, aucune écriture ici sauf
// `uneFoisDePlus`, qui crée l'occurrence en base.

import { txt } from "../socle/ui-base.js";
import { boutonCycle } from "../socle/blocs-cycle.js";
import { partsDe, partsTexte, echeance, TIERS } from "./taches.js";
import { porteurRythme, etapesDe, texteTemps, varianteParDefaut } from "./rythme.js";

/** Fait à deux : chacun choisit sa part — plein, deux tiers, un tiers (D-038). Un bouton par
 *  valeur, la valeur retenue en `aria-pressed`, jamais la couleur seule. */
export function htmlPartage(t) {
  const ligne = (prenom, champ, valeur) => `<div class="ligne-partage">
    <span class="ligne-partage-nom">${txt(prenom)}</span>
    <div class="segment-partage">${TIERS.map(([n, lib]) => `<button type="button" class="cible44${valeur === n ? " actif" : ""}"
      aria-pressed="${valeur === n}" data-tiers="${champ}|${n}">${lib}</button>`).join("")}</div>
  </div>`;
  return `<div class="detail-partage">
    <span class="etiquette">Fait à deux · la part de chacun</span>
    ${ligne(t.qui, "tiers", t.tiers ?? 3)}${ligne(t.qui2, "tiers2", t.tiers2 ?? 3)}
  </div>`;
}

/** Boutons « Réchauffer · Commandé · Cuisiner » d'une tâche faite : la variante retenue en
 *  `aria-pressed`, les parts suivent. */
export function htmlVariantes(t, r) {
  if (!t.fait_le || !r?.variantes?.length) return "";
  const choisie = t.variante ?? varianteParDefaut(r);
  return `<div class="detail-partage">
    <span class="etiquette">Comment</span>
    <div class="segment-partage segment-variantes">${r.variantes.map((v) => `<button type="button" class="cible44${v.nom === choisie ? " actif" : ""}"
      aria-pressed="${v.nom === choisie}" data-variante="${txt(v.nom)}">${txt(v.nom)} <span class="mono">${txt(texteTemps(v.minutes))}</span></button>`).join("")}</div>
  </div>`;
}

/** Étapes d'une tâche regroupée : une case par étape prévue (même échéance, même moment),
 *  puis les étapes facultatives en « + » (on les ajoute quand elles ont eu lieu). */
export function htmlEtapes(t, ctx) {
  const { etat, recDe, membres, valeurCourante, renduCase } = ctx;
  const r = recDe(t);
  const parent = r?.parent_id ? etat.tachesRec.find((p) => p.id === r.parent_id) : null;
  if (!parent) return "";
  const soeurs = etat.taches.filter((x) => recDe(x)?.parent_id === parent.id && x.echeance === t.echeance
    && (x.moment ?? null) === (t.moment ?? null));
  const facultatives = etapesDe(parent, etat.tachesRec).filter((e) => e.facultatif);
  return `<div class="detail-etapes">
    <span class="etiquette">Étapes · une case par étape</span>
    ${soeurs.map((x) => `<div class="ligne-etape-detail">
      ${boutonCycle({ cle: `e|${x.id}`, valeurs: [null, ...membres(), "_deux"], valeur: valeurCourante(x), rendu: renduCase, classe: "case-tache", taille: "jour" })}
      <span class="${x.fait_le ? "fait" : ""}">${txt(x.titre)}</span>
      <span class="mono">${txt(partsTexte(partsDe(recDe(x), x.qui ?? etat.prenom)))}</span>
    </div>`).join("")}
    ${facultatives.map((e) => `<button type="button" class="btn-tirets" data-facultative="${e.id}">+ ${txt(e.titre)} · ${txt(texteTemps(e.minutes))}</button>`).join("")}
  </div>`;
}

/** Crée une occurrence déjà faite « en plus » (répétable, ou étape facultative) : même
 *  échéance que la période du jour choisi, rang suivant, moment de la carte. Parts figées pour
 *  `qui` (variante par défaut comprise). Rend l'occurrence créée. */
export async function uneFoisDePlus(api, etat, r, { jour, moment = null, qui, faitLe }) {
  const porteur = porteurRythme(r, etat.tachesRec);
  const e = echeance(porteur.frequence, jour) ?? jour;
  const rang = 1 + Math.max(0, ...etat.taches.filter((x) => x.recurrent_id === r.id && x.echeance === e).map((x) => x.rang));
  const variante = varianteParDefaut(r);
  const [t] = await api.creerTaches([{ recurrent_id: r.id, titre: r.titre, categorie: r.categorie, echeance: e, rang,
    moment, qui, fait_le: faitLe, parts_quart: partsDe(r, qui, variante), variante }]);
  etat.taches.push(t);
  return t;
}
