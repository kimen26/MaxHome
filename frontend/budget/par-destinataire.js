// Regroupement des charges du mois par COMPTE DE DESTINATION (Yann : « regroupe ce qu'il y a à
// faire par compte vers où on déplace, de CB on a besoin de X »). Deuxième vue de l'écran Mois,
// à côté du regroupement par catégorie (ui-mois-charges.js) — même source de données (charges,
// lignes, recurrents), juste une autre clé de tri. Pur, sans DOM, testé en node comme calc.js.
//
// Un groupe par compte de destination : `compteDeCharge` (compte-charge.js) donne l'id du
// compte, ou null pour une charge qui reste sur le commun principal (prélèvements). Les charges
// « Ce mois seulement » (ponctuelles) rejoignent toujours le groupe « reste sur le commun »,
// sauf si elles portent elles-mêmes une destination (rare, mais pas interdit par le modèle).
//
// Différence avec groupes-virements.js : celui-ci regroupe par TRAJET (de → vers) les éléments
// qui restent à VIRER (mouvements + lignes envoyées ailleurs), pour la case à cocher en tête
// d'écran. Ici on regroupe TOUTES les charges du mois (faites ou pas, prélevées ou virées) pour
// les CARTES de charges elles-mêmes — même rôle que `categoriesPresentes`/`parCat` côté
// Catégories. Les deux coexistent sans dupliquer de règle : les deux lisent `compteDeCharge`.

import { compteDeCharge, compteSource, compteCommun, nomDuCompte } from "./compte-charge.js";

/** Clé de regroupement du groupe « reste sur le commun » (prélèvements, D-048 §1) — jamais un
 *  id de compte réel, pour ne jamais entrer en collision avec un vrai `compteId`. */
export const CLE_COMMUN = "__commun__";

/**
 * Construit les groupes de charges par destinataire.
 * @param charges   etat.charges (AFFICHÉES : actives + terminées avec une ligne ce mois, même
 *                  filtre que `affichees()` de ui-mois-charges.js — l'appelant le fait en amont,
 *                  cette fonction ne connaît pas la notion de charge terminée).
 * @param recurrents etat.recurrents
 * @param comptes    etat.comptes
 * @returns [{ cle, compteId, compteSourceId, libelleDe, libelleVers, charges, total }]
 *   `compteId` : null pour le groupe « reste sur le commun ». `charges` : les charges de ce
 *   groupe, dans l'ordre reçu (le tri par montant/ordre reste au rendu, pas ici).
 */
export function construireGroupesDestinataires(charges, recurrents, comptes) {
  const groupes = new Map();
  const principal = compteCommun(comptes);

  const groupe = (compteId) => {
    const cle = compteId == null ? CLE_COMMUN : String(compteId);
    if (!groupes.has(cle)) {
      groupes.set(cle, {
        cle, compteId,
        libelleVers: compteId == null
          ? `Reste sur ${principal ? principal.nom : "le commun"} (prélèvements)`
          : nomDuCompte(comptes, compteId),
        charges: [],
      });
    }
    return groupes.get(cle);
  };

  for (const c of charges) {
    const compteId = compteDeCharge(c, recurrents);
    groupe(compteId).charges.push(c);
  }

  return [...groupes.values()].map((g) => ({
    ...g,
    // Compte source : celui de la PREMIÈRE charge du groupe — toutes les charges d'un même
    // trajet partagent la même source en pratique (le commun principal, sauf « Un seul paie »
    // qui part du compte du payeur) ; en-tête affiché seulement s'il diffère de la destination.
    compteSourceId: g.charges.length ? compteSource(g.charges[0], comptes) : (principal?.id ?? null),
    libelleDe: g.charges.length ? nomDuCompte(comptes, compteSource(g.charges[0], comptes)) : "Commun",
  })).filter((g) => g.charges.length > 0);
}

/** Total d'un groupe, en centimes — lit `montantDe(id)` fourni par l'appelant (même fonction
 *  que `ui-mois-charges.js`, pas de recalcul ici : une ligne absente vaut 0). */
export const totalGroupe = (g, montantDe) => g.charges.reduce((s, c) => s + montantDe(c.id), 0);

/** Lignes validées / total d'un groupe, pour l'en-tête « x/y validées » — même notion que
 *  `remplies`/`complet` de `categoriesPresentes` côté Catégories. `faitDe(id)` : `fait_le` de
 *  la ligne (ou null). */
export const comptageValidation = (g, faitDe) => {
  const total = g.charges.length;
  const faites = g.charges.filter((c) => faitDe(c.id)).length;
  return { faites, total, complet: faites === total };
};

/**
 * Ordre d'affichage des groupes (règle 2 du brief) : les trajets d'abord, par TOTAL décroissant
 * (en valeur absolue — les charges sont négatives), la carte « reste sur le commun » toujours en
 * dernier. `totalParGroupe` : Map(cle -> total centimes), calculée par l'appelant (totalGroupe).
 */
export function trierGroupesDestinataires(groupes, totalParGroupe) {
  const [commun, trajets] = groupes.reduce(([c, t], g) =>
    (g.compteId == null ? [[...c, g], t] : [c, [...t, g]]), [[], []]);
  trajets.sort((a, b) => Math.abs(totalParGroupe.get(b.cle)) - Math.abs(totalParGroupe.get(a.cle)));
  return [...trajets, ...commun];
}

/**
 * Pied « Total qui part de <compte> : X € » par compte SOURCE (règle 2 du brief, « de CB on a
 * besoin de X ») — seulement quand plusieurs cartes partagent la même source : une seule carte
 * depuis ce compte redirait juste son propre total. Le groupe « reste sur le commun » n'est
 * jamais compté (son total n'est pas un virement à prévoir depuis une source unique à part).
 * @returns [{ compteId, libelle, total }], triés par total décroissant.
 */
export function totauxParSource(groupes, totalParGroupe, comptes) {
  const parSource = new Map();
  for (const g of groupes) {
    if (g.compteId == null) continue;
    const total = totalParGroupe.get(g.cle);
    const cle = g.compteSourceId ?? "__sans_source__";
    parSource.set(cle, (parSource.get(cle) ?? { compteId: g.compteSourceId, total: 0 }));
    parSource.get(cle).total += total;
  }
  return [...parSource.values()]
    .filter((s) => groupes.filter((g) => g.compteId != null && (g.compteSourceId ?? "__sans_source__") === (s.compteId ?? "__sans_source__")).length > 1)
    .map((s) => ({ ...s, libelle: nomDuCompte(comptes, s.compteId) }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}
