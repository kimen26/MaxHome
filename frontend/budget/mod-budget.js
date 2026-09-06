// Module Budget : salaires et charges du mois, qui verse quoi au commun, ce qui reste.

import { calculer } from "./calc.js";
import { creerUiMouvements, STRATEGIE_MOUVEMENTS } from "./ui-mouvements.js";
import { creerUiCharges } from "./ui-charges.js";
import { creerUiRecurrents } from "./ui-recurrents.js";
import { creerUiComptes } from "./ui-comptes.js";
import { creerUiStats } from "./ui-stats.js";
import { decaler, MOIS } from "../socle/ui-base.js";
import { synchroniserOccurrences } from "../socle/occurrences.js";

export default {
  cle: "budget", nom: "Budget", defaut: "mois", avecMois: true,
  onglets: [["mois", "Ce mois"], ["charges", "Charges"], ["stats", "Stats"]],
  plus: [["recurrents", "Mouvements récurrents"], ["comptes", "Comptes"], ["annuel", "Vue annuelle"]],
  etatInitial: {
    charges: [], comptes: [], recurrents: [],
    lignes: {}, revenus: {}, ajustements: [], mouvements: [],
    moisPrecedent: {}, derniers: {}, resultat: null,
  },
  referentiels: (api) => ({ charges: api.charges(), comptes: api.comptes(), recurrents: api.recurrents() }),

  creer(api, etat, cb) {
    const recalculer = () => {
      const revenus = Object.fromEntries(etat.membres.map((m) => [m.prenom, etat.revenus[m.prenom] ?? 0]));
      etat.resultat = calculer(etat.charges, etat.lignes, revenus, etat.ajustements);
    };
    const cbBudget = { ...cb, recalculer };
    const mouvements = creerUiMouvements(api, etat, cbBudget);
    const charges = creerUiCharges(api, etat, cbBudget);
    const recurrents = creerUiRecurrents(api, etat, cbBudget);
    const comptes = creerUiComptes(api, etat, cbBudget);
    const stats = creerUiStats(api, etat, cbBudget);

    return {
      ecrans: {
        mois: mouvements.rendre, charges: charges.rendre, stats: stats.rendre,
        recurrents: recurrents.rendre, comptes: comptes.rendre, annuel: stats.rendreAnnuel,
      },
      avantChargement() { mouvements.fermerDetail(); charges.fermerReglages(); },
      async charger() {
        const [aPrec, mPrec] = decaler(etat.annee, etat.mois, -1);
        const [courant, precedent, derniers] = await Promise.all([
          api.mois(etat.annee, etat.mois), api.mois(aPrec, mPrec), api.derniersMontants(),
        ]);
        etat.lignes = Object.fromEntries(courant.lignes.map((l) =>
          [l.charge_id, { montant_centimes: l.montant_centimes, regle: l.regle }]));
        etat.revenus = Object.fromEntries(etat.membres.map((m) => [m.prenom, 0]));
        for (const r of courant.revenus) etat.revenus[r.prenom] = r.montant_centimes;
        etat.ajustements = courant.ajustements;
        etat.mouvements = courant.mouvements;
        etat.moisPrecedent = Object.fromEntries(precedent.lignes.map((l) => [l.charge_id, l.montant_centimes]));
        etat.derniers = derniers;
        recalculer();
        await synchroniserOccurrences(api, etat, STRATEGIE_MOUVEMENTS);
      },
      resume() {
        if (!etat.resultat) return "Chargement…";
        const restants = etat.mouvements.filter((m) => !m.fait_le).length;
        const mois = MOIS[etat.mois - 1];
        return restants
          ? `${restants} mouvement${restants > 1 ? "s" : ""} à faire en ${mois}`
          : `Tout est viré pour ${mois}`;
      },
    };
  },
};
