// Partie « charges » de l'écran Mois : le bandeau « à compléter » (tant qu'il manque des
// montants, propose de les remplir d'un geste avec les montants habituels, D-040, habituel.js)
// et la feuille de réglage d'une charge (ui-charge-feuille.js, ouverte au tap d'une ligne dans
// la liste unifiée de ui-mois-liste.js). Depuis la refonte D-052 (chaque virement/charge une
// seule fois), ce fichier ne dessine plus sa propre grille de cartes par catégorie/destinataire
// — c'est ui-mois-liste.js qui affiche les lignes, cette source de données et cette feuille
// restent ici (exportées : `proposees`/`affichees`) pour ne pas dupliquer la règle D-043.

import { $, txt } from "../socle/ui-base.js";
import { montantHabituel } from "./habituel.js";
import { creerFeuilleCharge } from "./ui-charge-feuille.js";

export const CATEGORIES = ["Logement", "Max", "Épargne", "Alimentation", "Impôts", "Banque", "Autre"];

/** Catégories à afficher, dans l'ordre de CATEGORIES puis les autres par ordre alphabétique :
 *  une charge dont la catégorie n'est pas dans la liste ne disparaît pas de l'écran. */
export const categoriesPresentes = (parCat) => [
  ...CATEGORIES.filter((k) => parCat[k]),
  ...Object.keys(parCat).filter((k) => !CATEGORIES.includes(k)).sort((a, b) => a.localeCompare(b, "fr")),
];

export function creerUiMoisCharges(api, etat, cb) {
  const saisie = (id) => etat.lignes[id] !== undefined;
  const habituel = (c) => montantHabituel(c, etat.derniers);

  // Les charges ponctuelles (« Ligne de ce mois ») vivent dans la carte « Ce mois seulement »
  // de ui-mouvements.js, pas dans la liste unifiée.
  // Deux notions (D-043) : PROPOSÉES = actives, celles qu'on peut encore saisir ce mois-ci ou
  // remplir d'un geste. AFFICHÉES = actives + une charge terminée qui a déjà une ligne ce mois —
  // un mois passé garde ce qui a été payé, sinon son montant compterait dans le total sans être
  // visible nulle part. Une terminée SANS ligne ce mois n'apparaît plus du tout ici.
  const proposees = () => etat.charges.filter((c) => c.actif !== false && !c.ponctuel);
  const affichees = () => etat.charges.filter((c) => !c.ponctuel
    && (c.actif !== false || saisie(c.id)));

  /** Bandeau de tête : ce qui manque ce mois-ci, et le geste qui le remplit. Vide si complet.
   *  D-053 : seul endroit qui porte cette info (l'en-tête ne la répète plus) — NOMME la ou les
   *  charges manquantes (jusqu'à 3, « Montant à saisir : Impôts » ou « Impôts, Copro » ; au-delà,
   *  revient au compte pour ne pas déborder à 360 px). */
  function rendreACompleter() {
    const liste = proposees();
    const manquantes = liste.filter((c) => !saisie(c.id) && c.montant_defaut !== 0);
    const remplissables = manquantes.filter((c) => habituel(c) != null);
    const zone = $("#mois-a-completer");
    if (!manquantes.length) { zone.innerHTML = ""; return; }
    const n = manquantes.length;
    const aTaper = n - remplissables.length;
    const titre = n <= 3
      ? `Montant à saisir : ${manquantes.map((c) => c.libelle).join(", ")}`
      : `${n} charges sans montant ce mois-ci`;
    zone.innerHTML = `<div class="carte a-completer">
      <p><strong>${txt(titre)}.</strong>
      Les virements ne sont justes qu'une fois toutes les charges remplies.</p>
      ${remplissables.length ? `<button type="button" class="btn btn-bleu" data-remplir>
        Remplir avec les montants habituels (${remplissables.length})</button>` : ""}
      ${aTaper ? `<p class="sous">${aTaper} à taper à la main : la liste dessous le dit.</p>` : ""}
    </div>`;
    zone.querySelector("[data-remplir]")?.addEventListener("click", () => remplir(remplissables));
  }

  async function remplir(charges) {
    const lignes = charges.map((c) => ({ charge_id: c.id, montant_centimes: habituel(c) }));
    try {
      await api.majLignes(etat.annee, etat.mois, lignes);
      for (const l of lignes) etat.lignes[l.charge_id] = { montant_centimes: l.montant_centimes, regle: null };
      cb.recalculer();
      cb.rendreMois();
    } catch (e) { cb.echec(e); }
  }

  function rendre() {
    rendreACompleter();
  }

  // ---------- réglages d'une charge : feuille dédiée (ui-charge-feuille.js) ----------
  const feuille = creerFeuilleCharge(api, etat, cb, CATEGORIES);
  const ouvrirReglages = (id, options) => feuille.ouvrir(id, options);
  const fermerReglages = () => feuille.fermer();

  return { rendre, fermerReglages, ouvrirReglages, proposees, affichees };
}
