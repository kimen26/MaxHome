// Où va l'argent d'une charge (D-042). Par défaut « Commun » : les virements de chacun au
// compte commun couvrent déjà les charges, il n'y a rien à ajouter. Une charge peut aussi
// partir ailleurs (un livret pour l'épargne, le compte perso du payeur) : un virement de son
// montant s'ajoute alors chaque mois. Pas de colonne nouvelle : c'est un mouvement récurrent en
// mode « charge » (005_refonte.sql), que le calcul (montantTheorique), le bot Telegram et le
// rappel des virements savent déjà traiter. Règle tenue ici : AU PLUS UN récurrent actif en
// mode charge par charge, sinon le mois afficherait deux virements pour une seule charge.
// Pur, sans DOM : testé en node (tests/test_calc.mjs).

/** Phrase d'aide tant qu'il n'existe aucun compte où envoyer une charge. */
export const AIDE_SANS_COMPTE =
  "Pour envoyer une charge vers un livret ou un autre compte, crée d'abord le compte dans Réglages · Comptes.";

const estDe = (charge) => (r) => r.mode === "charge" && r.charge_id === charge.id;

/** Id du compte où va l'argent de la charge, ou null (« Commun »). */
export const compteDeCharge = (charge, recurrents) =>
  recurrents.find((r) => r.actif && estDe(charge)(r))?.compte_vers ?? null;

/** Existe-t-il un compte autre que le commun, où envoyer une charge ? */
export const aAutreCompte = (comptes) => comptes.some((c) => !c.commun);

/** Options du choix « va sur » : « Commun » (valeur vide) puis chaque compte hors commun. */
export const optionsCompte = (comptes) =>
  [["", "Commun"], ...comptes.filter((c) => !c.commun).map((c) => [c.id, c.nom])];

export const nomDuCompte = (comptes, id) =>
  (id == null ? "Commun" : comptes.find((c) => c.id === id)?.nom ?? "compte inconnu");

/** Compte d'où part le virement : le commun ; pour « Un seul paie », celui du payeur. */
export function compteSource(charge, comptes) {
  const source = charge.regle === "perso"
    ? comptes.find((c) => c.titulaire === charge.payeur)
    : comptes.find((c) => c.commun);
  return source?.id ?? null;
}

const remplacer = (liste, ligne) => liste.map((x) => (x.id === ligne.id ? ligne : x));
const virementOuvert = (etat, recurrentId) =>
  etat.mouvements.find((m) => m.recurrent_id === recurrentId && !m.fait_le);

/** Retire le virement NON coché du mois affiché ; un virement coché est un fait passé, il reste. */
async function retirerVirement(api, etat, recurrentId) {
  const m = virementOuvert(etat, recurrentId);
  if (!m) return;
  await api.supprimerMouvement(m.id);
  etat.mouvements = etat.mouvements.filter((x) => x.id !== m.id);
}

/**
 * Envoie l'argent de `charge` vers `compteId` (null = Commun). Écrit le récurrent, puis le
 * virement non coché du mois affiché (mis à jour, ou retiré au retour à Commun). Tient
 * `etat.recurrents` et `etat.mouvements` à jour. Renvoie true si quelque chose a été écrit :
 * l'appelant recharge alors le module, qui crée le virement du mois s'il manque
 * (STRATEGIE_MOUVEMENTS de ui-mouvements.js).
 */
export async function choisirCompte(api, etat, charge, compteId) {
  const siens = etat.recurrents.filter(estDe(charge));
  const actifs = siens.filter((r) => r.actif);
  // Un récurrent déjà là, même éteint, est repris plutôt que multiplié à chaque aller-retour.
  const garde = compteId == null ? null : (actifs[0] ?? siens.at(-1) ?? null);
  let ecrit = false;
  for (const r of actifs.filter((x) => x !== garde)) {
    await api.majRecurrent(r.id, { actif: false });
    etat.recurrents = remplacer(etat.recurrents, { ...r, actif: false });
    await retirerVirement(api, etat, r.id);
    ecrit = true;
  }
  if (compteId == null) return ecrit;

  const compte = etat.comptes.find((c) => c.id === compteId);
  if (!compte) throw new Error(`compte introuvable : ${compteId}`);
  // Le titre nomme la destination : gardé à jour, sinon l'écran Mois annoncerait l'ancien compte.
  const champs = {
    titre: `${charge.libelle} → ${compte.nom}`, compte_de: compteSource(charge, etat.comptes),
    compte_vers: compteId, actif: true,
  };
  if (!garde) {
    const cree = await api.creerRecurrent({ ...champs, mode: "charge", charge_id: charge.id,
      montant_centimes: null, prenom_part: null, qui: null, jour: 5, consigne: null, ordre: 100 });
    etat.recurrents = [...etat.recurrents, cree];
    return true;
  }
  if (Object.entries(champs).every(([k, v]) => garde[k] === v)) return ecrit;
  await api.majRecurrent(garde.id, champs);
  etat.recurrents = remplacer(etat.recurrents, { ...garde, ...champs });
  const m = virementOuvert(etat, garde.id);
  if (m) {
    const { titre, compte_de, compte_vers } = champs;
    await api.majMouvement(m.id, { titre, compte_de, compte_vers });
    etat.mouvements = remplacer(etat.mouvements, { ...m, titre, compte_de, compte_vers });
  }
  return true;
}
