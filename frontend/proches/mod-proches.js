// Module Proches : partager nos jours libres avec des copains ou la famille (façon Doodle),
// docs/briefs/proposer-date.md. Un seul écran, « Proposer une date ». Hors de la barre basse :
// on y entre par sa carte sur l'accueil (champ horsBarre du contrat de module). Les jours libres
// se calculent depuis l'état chargé par l'Agenda (google, voyages, vacances), sans requête ici.

import { creerUiProches } from "./ui-proches.js";

export default {
  cle: "proches", nom: "Proches", defaut: "proches", avecMois: false, horsBarre: true,
  onglets: [],
  reglages: [],
  // `sondages` : lignes de la table sondages, chacune avec ses `votes` [{ prenom, jours }].
  etatInitial: { sondages: [] },
  referentiels: () => ({}),

  creer(api, etat, cb) {
    const ui = creerUiProches(api, etat, cb);
    return {
      ecrans: { proches: ui.rendre },
      async charger() { etat.sondages = await api.sondages(); },
      resume() {
        const n = etat.sondages.length;
        const reponses = etat.sondages.reduce((somme, s) => somme + s.votes.length, 0);
        if (!n) return "Proposer une date à des proches";
        return `${n} sondage${n > 1 ? "s" : ""} en cours · ${reponses} réponse${reponses > 1 ? "s" : ""}`;
      },
    };
  },
};
