// Regroupement des virements à faire par trajet (compte de départ → compte de destination),
// D-048 §3 : « de CB j'envoie à Caisse d'Épargne, de CB j'envoie à Commun épargne, etc. » — un
// seul geste pour tout un trajet plutôt que de cocher charge par charge. Pur, sans DOM, testé
// en node (tests/test_calc.mjs) comme calc.js.
//
// Deux sources fondent un groupe (une ligne ne compte jamais deux fois, etat-mois.js §D-048) :
//  - une LIGNE DE CHARGE dont `compteDeCharge` n'est pas null (compte-charge.js) : elle part du
//    compte source de la charge (compteSource) vers ce compte — les charges qui restent sur le
//    commun (prélèvements, compteDeCharge === null) n'ont rien à virer, jamais de groupe ;
//  - un MOUVEMENT « part » ou « fixe » (jamais « charge », déjà représenté par sa ligne) avec un
//    compte de destination connu : le virement au commun de chacun, ou un mouvement récurrent.
//
// Chaque élément du groupe garde son type (`ligne` | `mouvement`) et son id métier : le socle
// applique ensuite EXACTEMENT le même cycle de validation que la ligne ou le mouvement pris un
// par un (coche-ligne.js / basculer de ui-mouvements.js), jamais une écriture parallèle qui
// pourrait diverger.

import { montantLigne, montantTheorique } from "./calc.js";
import { compteDeCharge, compteSource, nomDuCompte } from "./compte-charge.js";
import { valeurCourante, SANS_PRENOM, prochaineValeur } from "./coche-ligne.js";
import { chargeAutomatique, mouvementAutomatique, valeurClassement, estAutomatique } from "./automatique.js";

/** Trajet d'un mouvement (hors mode "charge", jamais groupé ici) : compte à compte s'il est
 *  connu des deux côtés, ou « compte perso de X » quand la source est le compte personnel non
 *  tenu en base (D-042, même règle que `trajet()` de ui-mouvements.js). `null` si aucun des deux
 *  comptes n'est connu (rien de sûr à grouper). */
function trajetMouvement(m) {
  if (m.compte_vers == null) return null;
  const de = m.compte_de ?? (m.qui ? `perso:${m.qui}` : null);
  if (de == null) return null;
  return { de, vers: m.compte_vers };
}

/** Libellé du départ d'un trajet : le nom du compte si connu, sinon « Compte de X ». */
const libelleDepart = (de, comptes) =>
  typeof de === "string" && de.startsWith("perso:") ? `Compte de ${de.slice(6)}` : nomDuCompte(comptes, de);

/**
 * Construit les groupes de virements à faire (et déjà faits) pour le mois, à partir de l'état
 * complet. Un groupe existe même sans ligne À FAIRE (toutes ses lignes peuvent être déjà
 * validées) : c'est `fait` qui distingue, l'appelant choisit où l'afficher.
 * @returns [{ cle, de, vers, libelleDe, libelleVers, lignes, total, totalManuel, fait, prenom, automatique }]
 *   `automatique` : tous les éléments viennent d'un récurrent automatique (D-057, rien à cocher) ;
 *   `totalManuel` : total des seuls éléments à cocher (l'automatique n'est pas « à faire »).
 *   `lignes` : [{ type: "ligne"|"mouvement", id, libelle, montant_centimes, valeur }]
 *   `valeur` : prénom qui a validé (cycle coche-ligne.js), ou null.
 */
export function construireGroupes(etat) {
  const groupes = new Map();

  const groupe = (de, vers) => {
    const cle = `${de ?? "?"}→${vers}`;
    if (!groupes.has(cle)) {
      groupes.set(cle, {
        cle, de, vers,
        libelleDe: libelleDepart(de, etat.comptes), libelleVers: nomDuCompte(etat.comptes, vers),
        lignes: [],
      });
    }
    return groupes.get(cle);
  };

  // ---------- lignes de charge envoyées ailleurs que le commun ----------
  for (const c of etat.charges) {
    if (c.ponctuel || c.actif === false) continue;
    const compteVers = compteDeCharge(c, etat.recurrents);
    if (compteVers == null) continue; // reste sur le commun : rien à virer, pas de groupe.
    const l = etat.lignes[c.id];
    if (!l || !l.montant_centimes) continue; // pas de montant saisi : rien à valider encore.
    const de = compteSource(c, etat.comptes);
    groupe(de, compteVers).lignes.push({
      type: "ligne", id: c.id, libelle: c.libelle,
      montant_centimes: montantLigne(l),
      valeur: valeurClassement(chargeAutomatique(etat.recurrents, c.id), valeurCourante(l)),
      fait_le: l.fait_le ?? null, fait_par: l.fait_par ?? null,
    });
  }

  // ---------- mouvements (virements au commun, récurrents "part"/"fixe") ----------
  const recurrentDe = (m) => etat.recurrents.find((r) => r.id === m.recurrent_id);
  for (const m of etat.mouvements) {
    const r = recurrentDe(m);
    if (r?.mode === "charge") continue; // déjà représenté par sa ligne de charge, ci-dessus.
    const t = trajetMouvement(m);
    if (!t) continue;
    const montant = m.fait_le ? m.montant_centimes : (montantTheorique(r, etat) ?? m.montant_centimes);
    groupe(t.de, t.vers).lignes.push({
      type: "mouvement", id: m.id, libelle: m.titre,
      montant_centimes: montant,
      valeur: valeurClassement(mouvementAutomatique(etat.recurrents, m), valeurCourante(m)),
      fait_le: m.fait_le ?? null, fait_par: m.fait_par ?? null,
    });
  }

  return [...groupes.values()].map((g) => {
    const total = g.lignes.reduce((s, l) => s + l.montant_centimes, 0);
    // D-057 : les éléments automatiques sont déjà « faits » et ne comptent pas dans ce qui reste
    // à cocher. Un groupe entièrement automatique est fait sans prénom ; un groupe mixte reste à
    // faire tant que ses éléments MANUELS ne le sont pas.
    const manuelles = g.lignes.filter((l) => !estAutomatique(l.valeur));
    const totalManuel = manuelles.reduce((s, l) => s + l.montant_centimes, 0);
    const automatique = manuelles.length === 0;
    const fait = g.lignes.length > 0 && manuelles.every((l) => l.valeur !== null);
    // Prénom COMMUN à toutes les lignes du groupe (règle 3 du brief), seulement si fait ET si
    // toutes les lignes partagent EXACTEMENT la même valeur (D-048 : un groupe entièrement
    // validé mais par des prénoms différents, ou sans prénom connu sur au moins une ligne,
    // n'a pas de prénom commun — affiché « ✓ » seul, jamais un prénom au hasard).
    const memePrenom = fait && !automatique && manuelles.every((l) => l.valeur === manuelles[0].valeur);
    const prenom = fait && !automatique ? (memePrenom ? manuelles[0].valeur : SANS_PRENOM) : null;
    return { ...g, total, totalManuel, fait, prenom, automatique };
  }).filter((g) => g.lignes.length > 0);
}

/** Lignes non faites d'un groupe (celles qu'un tap sur sa case doit encore valider). */
export const lignesAFaire = (g) => g.lignes.filter((l) => l.valeur === null);

/** Lignes faites d'un groupe (celles qu'un tap sur sa case déjà cochée doit annuler). */
export const lignesFaites = (g) => g.lignes.filter((l) => l.valeur !== null && !estAutomatique(l.valeur));

/**
 * Prépare la bascule de la case d'un GROUPE (D-048 §3, même cycle rien → moi → l'autre → rien
 * que celui d'une ligne, coche-ligne.js) : quand le groupe n'est pas encore entièrement fait,
 * un tap valide toutes ses lignes NON FAITES pour la valeur suivante, en laissant les lignes
 * déjà validées par quelqu'un d'autre telles quelles (on ne vole pas la validation d'autrui) ;
 * quand il est entièrement fait, un tap fait avancer TOUT le groupe (toutes ses lignes
 * partagent alors la même valeur, par construction de `fait`).
 * @param membres  etat.membres (liste {prenom}), pour les valeurs du cycle.
 * @returns { valeurCible, cibles: [{ type, id }] } — les lignes à basculer, jamais mutées ici.
 */
export function preparerBasculeGroupe(g, membres) {
  const valeurs = [null, ...membres.map((m) => m.prenom)];
  const courant = g.fait ? g.prenom : null;
  // prochaineValeur (pas suivante) : depuis SANS_PRENOM (D-048, groupe fait sans prénom
  // commun), avance vers le PREMIER membre — comme depuis null, jamais un indexOf(Symbol).
  const valeurCible = prochaineValeur(valeurs, courant);
  const cibles = g.fait ? lignesFaites(g) : lignesAFaire(g); // l'automatique n'est jamais une cible (D-057)
  return { valeurCible, cibles: cibles.map((l) => ({ type: l.type, id: l.id })) };
}
