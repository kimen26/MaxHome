// Note d'une charge : POURQUOI elle a ce montant (D-065). Logique pure (sans DOM) : la feuille
// de réglage (ui-charge-feuille.js) et la liste du mois (ui-mois-liste.js) n'écrivent pas leur
// propre HTML ni leur propre règle de la note.

import { txt } from "../socle/ui-base.js";
import { zone } from "../socle/blocs-form.js";

export const NOTE_MAX = 500; // = contrainte check charges_note_longueur (035_charges_note.sql)
export const AIDE_NOTE = "Pourquoi ce montant, ce qui a changé";
const MOIS_ABREGES = ["janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « 8 nov. » depuis une date ISO ; chaîne vide si absente ou illisible. */
export function dateNote(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MOIS_ABREGES[d.getMonth()]}`;
}

export const aUneNote = (c) => Boolean(c?.note && c.note.trim());

/** Champs à écrire pour la saisie : vide → note et date effacées ; sinon texte rogné + `maintenant`.
 *  Texte inchangé → null (la date de la note ne bouge pas). Trop long → message (string). */
export function champsNote(saisie, charge, maintenant = new Date().toISOString()) {
  const texte = String(saisie ?? "").trim();
  if (texte.length > NOTE_MAX) return `La note fait ${texte.length} caractères, ${NOTE_MAX} au plus.`;
  if (texte === (charge?.note ?? "").trim()) return null;
  return texte ? { note: texte, note_le: maintenant } : { note: null, note_le: null };
}

/** Champ « Note » de la feuille de réglage (blocs-form.js) + sa date si elle existe. */
export function htmlChampNote(c) {
  const date = aUneNote(c) ? dateNote(c.note_le) : "";
  return `<fieldset class="bloc-reglage"><legend class="etiquette">Note</legend>
    ${zone("note", "Écrire la note", c.note ?? "", { lignes: 4, attrs: `maxlength="${NOTE_MAX}" aria-describedby="aide-note"` })}
    <p class="aide-note" id="aide-note">${txt(AIDE_NOTE)}${date ? ` · notée le ${txt(date)}` : ""}</p>
  </fieldset>`;
}

/** Repère dans la liste du mois : icône + mot, jamais la couleur seule. Vide sans note. */
export const htmlRepereNote = (c) => aUneNote(c)
  ? `<span class="mc-note"><span aria-hidden="true">📝</span> Note</span>` : "";
