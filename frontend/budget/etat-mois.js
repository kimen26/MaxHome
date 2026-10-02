// État du mois en une phrase (D-042). Les virements au commun se calculent à partir des
// salaires et des charges du mois : « Tout est viré » ne vaut donc que si les deux sont notés.
// Avant, la seule question posée était « reste-t-il un virement non coché ? » — deux virements
// cochés avant la saisie des salaires faisaient dire « tout est fait » à un mois où seuls les
// salaires étaient notés (retour de Yann, septembre 2026). Une seule fonction pour l'accueil,
// le sous-titre de l'écran Mois et la carte À faire : les trois disent la même chose.

import { MOIS } from "../socle/ui-base.js";

const pluriel = (n) => (n > 1 ? "s" : "");

/**
 * Ce qui manque au mois, par priorité : un salaire, puis une charge sans montant, puis une
 * validation (virement ou ligne de charge). `statut` vaut
 * "salaires" | "charges" | "virements" | "fait" | "aucun". Une charge « manque » quand elle
 * n'a pas de ligne ce mois (même règle que le bandeau « à compléter » de ui-mois-charges.js) ;
 * une charge ponctuelle n'existe que par sa ligne.
 * Depuis D-046 (Yann 2026-09-29, validation ligne à ligne), « à faire » compte deux choses :
 * les mouvements non faits dont le récurrent n'est PAS en mode "charge" (un mouvement en mode
 * "charge" n'a plus sa propre case, ui-mouvements.js ne l'affiche plus), et les lignes de
 * charges affichées avec un montant, non validées (fait_le null) — la validation de la ligne
 * couvre alors le mouvement lié aussi (coche-ligne.js). `recurrents` : optionnel, `[]` par
 * défaut — un appelant qui ne le passe pas compte simplement tous les mouvements non faits
 * (compatibilité arrière, aucun appelant actuel n'omet `etat` en entier).
 */
export function etatDuMois({ mois, membres, revenus, charges, lignes, mouvements, recurrents = [] }) {
  const salaires = membres.filter((m) => !revenus[m.prenom]).map((m) => m.prenom);
  const actives = charges.filter((c) => c.actif !== false && !c.ponctuel);
  const videsListe = actives.filter((c) => lignes[c.id] === undefined);
  const chargesVides = videsListe.length;

  const modeCharge = (m) => recurrents.find((r) => r.id === m.recurrent_id)?.mode === "charge";
  const mouvementsAFaire = mouvements.filter((m) => !m.fait_le && !modeCharge(m)).length;
  // Charges AFFICHÉES (actives + une terminée qui garde sa ligne ce mois, D-043) : une charge
  // sans ligne ne compte ni ici ni dans chargesVides deux fois — elle est déjà dans chargesVides.
  const affichees = charges.filter((c) => !c.ponctuel && (c.actif !== false || lignes[c.id] !== undefined));
  const lignesAValider = affichees.filter((c) => lignes[c.id] !== undefined && lignes[c.id].montant_centimes
    && !lignes[c.id].fait_le).length;
  const aFaire = mouvementsAFaire + lignesAValider;
  const total = mouvements.filter((m) => !modeCharge(m)).length + affichees.filter((c) => lignes[c.id]?.montant_centimes).length;

  const statut = salaires.length ? "salaires"
    : chargesVides ? "charges"
      : aFaire ? "virements"
        : total ? "fait" : "aucun";
  const nomMois = MOIS[mois - 1];
  // Une seule charge manquante : la nommer plutôt que dire juste « 1 charge à remplir » — la
  // phrase d'en-tête doit dire QUOI faire, pas juste QUE quelque chose reste à faire (plainte
  // Yann : « on ne sait pas laquelle »). Plusieurs manquantes : rester au compte, sinon la
  // phrase déborde à 360 px.
  const chargeManquante = chargesVides === 1 ? videsListe[0] : null;
  const phrase = {
    salaires: salaires.length === 1 ? `Salaire de ${salaires[0]} à noter` : "Salaires à noter",
    charges: chargeManquante ? `Montant à saisir : ${chargeManquante.libelle}` : `${chargesVides} charges à remplir`,
    virements: `${aFaire} à valider en ${nomMois}`,
    fait: `Tout est validé pour ${nomMois}`,
    aucun: "Aucun virement prévu",
  }[statut];
  return { statut, salaires, charges: chargesVides, chargeManquante, aFaire, total, phrase };
}

/** Texte de la carte « À faire » quand plus rien n'y est à cocher côté mouvements. Jamais
 *  « Tout est fait » tant qu'un salaire, une charge, ou une ligne à valider manque : la carte
 *  À faire ne montre que les mouvements, les lignes de charge se valident dans leur catégorie. */
export function texteAFaireVide(e) {
  if (!e.total) return "Aucun virement prévu. Ajoute les virements dans Réglages · Comptes.";
  if (e.statut === "salaires" || e.statut === "charges") return `${e.phrase} avant de faire les virements.`;
  if (e.statut === "virements") return `Reste ${e.aFaire} à valider dans les catégories.`;
  return "Tout est fait pour ce mois.";
}
