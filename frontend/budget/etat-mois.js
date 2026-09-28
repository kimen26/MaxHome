// État du mois en une phrase (D-042). Les virements au commun se calculent à partir des
// salaires et des charges du mois : « Tout est viré » ne vaut donc que si les deux sont notés.
// Avant, la seule question posée était « reste-t-il un virement non coché ? » — deux virements
// cochés avant la saisie des salaires faisaient dire « tout est fait » à un mois où seuls les
// salaires étaient notés (retour de Yann, septembre 2026). Une seule fonction pour l'accueil,
// le sous-titre de l'écran Mois et la carte À faire : les trois disent la même chose.

import { MOIS } from "../socle/ui-base.js";

const pluriel = (n) => (n > 1 ? "s" : "");

/**
 * Ce qui manque au mois, par priorité : un salaire, puis une charge sans montant, puis un
 * virement à faire. `statut` vaut "salaires" | "charges" | "virements" | "fait" | "aucun".
 * Une charge « manque » quand elle n'a pas de ligne ce mois (même règle que le bandeau
 * « à compléter » de ui-mois-charges.js) ; une charge ponctuelle n'existe que par sa ligne.
 */
export function etatDuMois({ mois, membres, revenus, charges, lignes, mouvements }) {
  const salaires = membres.filter((m) => !revenus[m.prenom]).map((m) => m.prenom);
  const chargesVides = charges.filter((c) => c.actif !== false && !c.ponctuel && lignes[c.id] === undefined).length;
  const aFaire = mouvements.filter((m) => !m.fait_le).length;
  const total = mouvements.length;
  const statut = salaires.length ? "salaires"
    : chargesVides ? "charges"
      : aFaire ? "virements"
        : total ? "fait" : "aucun";
  const nomMois = MOIS[mois - 1];
  const phrase = {
    salaires: salaires.length === 1 ? `Salaire de ${salaires[0]} à noter` : "Salaires à noter",
    charges: `${chargesVides} charge${pluriel(chargesVides)} à remplir`,
    virements: `${aFaire} virement${pluriel(aFaire)} à faire en ${nomMois}`,
    fait: `Tout est viré pour ${nomMois}`,
    aucun: "Aucun virement prévu",
  }[statut];
  return { statut, salaires, charges: chargesVides, aFaire, total, phrase };
}

/** Texte de la carte « À faire » quand plus rien n'y est à cocher. Jamais « Tout est fait »
 *  tant qu'un salaire ou une charge manque : les virements cochés peuvent alors être faux. */
export function texteAFaireVide(e) {
  if (!e.total) return "Aucun virement prévu. Ajoute les virements dans Réglages · Comptes.";
  if (e.statut === "salaires" || e.statut === "charges") return `${e.phrase} avant de faire les virements.`;
  return "Tout est fait pour ce mois.";
}
