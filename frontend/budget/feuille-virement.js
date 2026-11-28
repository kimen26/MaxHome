// Section « Virement » de la feuille de réglage d'une charge (ui-charge-feuille.js) : à quel
// compte la charge est payée et quel libellé mettre sur le virement (D-050, D-054). Lecture +
// copie : le libellé vit sur le compte destinataire (réglé dans Réglages · Comptes), jamais ici.
// Le bloc libellé est celui de la liste du mois (bloc-libelle-virement.js, D-024) ; la sélection
// « quel compte, quel mouvement » est pure (virement-charge.js, testée en node).
// Rien n'est affiché si la charge n'a pas de virement actif, ou si le compte qui reçoit n'a ni
// libellé ni libellé variable.

import { txt, MOIS } from "../socle/ui-base.js";
import { htmlBlocLibelle, brancherBlocLibelle } from "./bloc-libelle-virement.js";
import { modeleLibelle } from "./libelle-virement.js";
import { virementDeCharge } from "./virement-charge.js";

/** Phrase de réserve : où c'est mis de côté et quand c'est payé. */
function phraseReserve(v) {
  const tampon = v.tampon?.nom ?? "le tampon";
  const quand = v.aPayerCeMois ? "à payer ce mois-ci"
    : v.moisPaiement ? `payé en ${MOIS[v.moisPaiement - 1]}` : "mois de paiement à choisir";
  return `Mis de côté sur ${txt(tampon)} · ${quand}`;
}

/** Libellé lu seul quand le bloc n'a rien à rendre : compte à libellé variable, mois pas encore
 *  saisi et pas de mouvement du mois (réserve hors mois de paiement, ou paiement pas encore posé). */
function htmlModeleSeul(compte) {
  const modele = modeleLibelle(compte);
  if (!modele) return `<p class="fv-aide">Libellé à compléter au moment du paiement.</p>`;
  return `<div class="gv-libelle">
    <span class="etiquette">Libellé</span> <span class="mono">${txt(modele)}</span>
    <button type="button" class="btn-lien" data-copier-libelle-mvt="${txt(modele)}">Copier</button>
    <p class="fv-aide">À compléter au moment du paiement.</p>
  </div>`;
}

/** HTML de la section, ou "" s'il n'y a rien à montrer. `etat` : recurrents, comptes, mouvements, mois. */
export function htmlVirement(charge, etat) {
  const v = virementDeCharge(charge, etat);
  if (!v) return "";
  const bloc = htmlBlocLibelle(v.mouvement, v.compte) || htmlModeleSeul(v.compte);
  return `<fieldset class="bloc-reglage fv-virement" data-virement>
    <legend class="etiquette">Virement</legend>
    <p class="fv-ligne">Payé à <strong>${txt(v.compte.nom)}</strong></p>
    ${v.tampon ? `<p class="fv-reserve">${phraseReserve(v)}</p>` : ""}
    ${bloc}
  </fieldset>`;
}

/** Branche Copier et l'enregistrement du libellé du mois ; `apres` redessine la feuille.
 *  Entrée dans le champ ne doit PAS valider tout le formulaire de la charge : elle valide le libellé. */
export function brancherVirement(racine, api, etat, cb, apres) {
  const zone = racine.querySelector("[data-virement]");
  if (!zone) return;
  brancherBlocLibelle(zone, api, etat, cb, apres);
  zone.querySelector("[data-libelle-mois]")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    zone.querySelector("[data-valider-libelle]")?.click();
  });
}
