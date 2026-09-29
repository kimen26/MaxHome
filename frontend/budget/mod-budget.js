// Module Budget : salaires et charges du mois, qui verse quoi au commun, ce qui reste.

import { calculer } from "./calc.js";
import { creerUiMouvements, STRATEGIE_MOUVEMENTS } from "./ui-mouvements.js";
import { creerUiChargesRef } from "./ui-charges-ref.js";
import { creerUiRecurrents } from "./ui-recurrents.js";
import { creerUiComptes } from "./ui-comptes.js";
import { creerUiStats } from "./ui-stats.js";
import { etatDuMois } from "./etat-mois.js";
import { decaler } from "../socle/ui-base.js";
import { synchroniserOccurrences } from "../socle/occurrences.js";

export default {
  cle: "budget", nom: "Budget", defaut: "mois", avecMois: true,
  onglets: [["mois", "Mois"], ["stats", "Stats"], ["annuel", "Année"]],
  reglages: [["charges-ref", "Charges"], ["comptes", "Comptes"]],
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
    const cbChargesRef = { ...cbBudget, ouvrirReglagesCharge: mouvements.ouvrirReglagesCharge };
    const chargesRef = creerUiChargesRef(api, etat, cbChargesRef);
    const recurrents = creerUiRecurrents(api, etat, cbBudget);
    const comptes = creerUiComptes(api, etat, cbBudget);
    const stats = creerUiStats(api, etat, cbBudget);

    // Réglages · Comptes (D-036 §4) : deux cartes sur un écran — comptes puis récurrents.
    const rendreComptesEtRecurrents = () => { comptes.rendre(); recurrents.rendre(); };

    return {
      ecrans: {
        mois: mouvements.rendre, stats: stats.rendre,
        comptes: rendreComptesEtRecurrents, annuel: stats.rendreAnnuel,
        "charges-ref": chargesRef.rendre,
      },
      avantChargement() { mouvements.fermerDetail(); mouvements.fermerReglagesCharges(); },
      async charger() {
        const [aPrec, mPrec] = decaler(etat.annee, etat.mois, -1);
        const [courant, precedent, derniers] = await Promise.all([
          api.mois(etat.annee, etat.mois), api.mois(aPrec, mPrec), api.derniersMontants(),
        ]);
        etat.lignes = Object.fromEntries(courant.lignes.map((l) =>
          [l.charge_id, { montant_centimes: l.montant_centimes, regle: l.regle, fait_le: l.fait_le, fait_par: l.fait_par }]));
        etat.revenus = Object.fromEntries(etat.membres.map((m) => [m.prenom, 0]));
        for (const r of courant.revenus) etat.revenus[r.prenom] = r.montant_centimes;
        etat.ajustements = courant.ajustements;
        etat.mouvements = courant.mouvements;
        etat.moisPrecedent = Object.fromEntries(precedent.lignes.map((l) => [l.charge_id, l.montant_centimes]));
        etat.derniers = derniers;
        recalculer();
        await synchroniserOccurrences(api, etat, STRATEGIE_MOUVEMENTS);
      },
      // Même phrase que le sous-titre de l'écran Mois : salaire, charge, puis virement (D-042).
      resume() {
        if (!etat.resultat) return "Chargement…";
        return etatDuMois(etat).phrase;
      },
    };
  },
};
