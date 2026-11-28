// Financement d'un extra « Ce mois seulement » : d'où vient l'argent ? (colonne lignes.financement,
// migration 038). Un extra naît « à financer » : il n'entre pas dans le compte tant que personne
// n'a dit qui le paie. Cocher l'extra ouvre d'abord ce choix ; le lien « Changer le financement »
// de la ligne le rouvre à tout moment. Le calcul vit dans calc.js (compteDansLeCommun) : ici,
// seulement les mots, les repères et la feuille de choix — aucune écriture (ui-extras.js écrit,
// par le cycle optimiste de coche-ligne.js, D-024).

import { txt, $$, ouvrirFeuille, fermerFeuille } from "../socle/ui-base.js";
import { choixDetaille } from "../socle/blocs.js";
import { libelleRegle, detailRegle } from "./repartition.js";

/** État d'un extra qu'on vient de créer, dans l'app comme dans le bot. */
export const FINANCEMENT_INITIAL = "a_financer";

/** Repère texte d'un état : couleur ET mots, jamais la couleur seule. `null` : rien à dire. */
const REPERES = {
  a_financer: { texte: "À financer", classe: "financement-a-financer" },
  joint: { texte: "Payé par le compte joint", classe: "financement-joint" },
  chacun: { texte: "Chacun ajoute", classe: "financement-chacun" },
};
export const repereFinancement = (financement) => REPERES[financement] ?? null;

/** Faut-il demander d'où vient l'argent avant de valider cette ligne ? Oui tant qu'elle est
 *  « à financer » et pas encore validée. */
export const doitChoisirAvantValidation = (ligne) => ligne?.financement === "a_financer" && !ligne.fait_le;

/** Options de la feuille. Au moment de la coche, deux choix ; pour « Changer le financement »,
 *  les trois états (on peut remettre l'extra en attente). */
export function optionsFinancement(regle, etat, { avecAFinancer }) {
  const options = [
    { valeur: "joint", titre: "Le compte joint l'absorbe", detail: "Personne ne vire de plus ce mois-ci" },
    { valeur: "chacun", titre: `Chacun ajoute ce mois-ci (${libelleRegle(regle)})`,
      detail: `Les virements au commun augmentent : ${detailRegle(regle, etat)}` },
  ];
  if (avecAFinancer) {
    options.push({ valeur: "a_financer", titre: "À financer plus tard", detail: "Rien n'est compté pour l'instant" });
  }
  return options;
}

/**
 * Ouvre la feuille de choix ; résout avec le financement choisi, ou `null` si on la ferme sans
 * choisir (voile, Échap, « Annuler »).
 * @param titre   libellé de l'extra, montré en tête
 * @param regle   règle de répartition de l'extra (dit ce que « chacun » veut dire)
 * @param courant financement actuel (pré-coché), `null` à la coche
 * @param changement vrai pour « Changer le financement » : propose aussi « À financer »
 */
export function choisirFinancement(etat, { titre, regle, courant = null, changement = false }) {
  return new Promise((resolve) => {
    let choisi = null;
    ouvrirFeuille(`<div class="pile feuille-financement">
      <div class="detail-tete"><div><h2>D'où vient l'argent ?</h2><span class="sous">${txt(titre)}</span></div></div>
      ${choixDetaille(optionsFinancement(regle, etat, { avecAFinancer: changement }), courant,
        { attr: "financement", etiquette: "Financement de la ligne", colonne: true })}
      <button type="button" class="btn-lien" data-annuler-financement>Annuler</button>
    </div>`, { onFermer: () => resolve(choisi) });
    for (const b of $$("#feuille-corps [data-financement]")) {
      b.addEventListener("click", () => { choisi = b.dataset.financement; fermerFeuille(); });
    }
    $$("#feuille-corps [data-annuler-financement]")[0]?.addEventListener("click", () => fermerFeuille());
  });
}
