// Module Proches : deux écrans, hors de la barre basse (on y entre par sa carte sur l'accueil,
// champ horsBarre du contrat de module).
//  - « Proposer une date » : partager nos jours libres avec des copains ou la famille (façon Doodle),
//    docs/briefs/proposer-date.md. Les jours libres se calculent depuis l'état chargé par l'Agenda
//    (google, voyages, vacances), sans requête ici.
//  - « Garder le lien » : un rythme par proche, ses échanges, son anniversaire (docs/briefs/garder-le-lien.md).

import { jourIso } from "../agenda/calendrier.js";
import { creerUiProches } from "./ui-proches.js";
import { creerUiLien } from "./ui-lien.js";
import { aRelancer } from "./relances.js";

export default {
  cle: "proches", nom: "Proches", defaut: "proches", avecMois: false, horsBarre: true,
  onglets: [["proches", "Proposer une date"], ["proches-lien", "Garder le lien"]],
  reglages: [],
  // `sondages` : lignes de la table sondages, chacune avec ses `votes` [{ prenom, jours }].
  // `proches` / `echanges` : lignes des tables proches et proche_echanges.
  etatInitial: { sondages: [], proches: [], echanges: [] },
  referentiels: () => ({}),

  creer(api, etat, cb) {
    const ui = creerUiProches(api, etat, cb);
    const lien = creerUiLien(api, etat, cb);
    return {
      ecrans: { proches: ui.rendre, "proches-lien": lien.rendre },
      async charger() {
        const [sondages, { proches, echanges }] = await Promise.all([api.sondages(), api.proches()]);
        Object.assign(etat, { sondages, proches, echanges });
      },
      resume() {
        const n = etat.sondages.length;
        const reponses = etat.sondages.reduce((somme, s) => somme + s.votes.length, 0);
        const k = aRelancer(etat.proches, etat.echanges, jourIso(new Date())).length;
        const parts = [
          n ? `${n} sondage${n > 1 ? "s" : ""} en cours · ${reponses} réponse${reponses > 1 ? "s" : ""}` : "",
          k ? `${k} proche${k > 1 ? "s" : ""} à relancer` : "",
        ].filter(Boolean);
        return parts.length ? parts.join(" · ") : "Proposer une date, garder le lien";
      },
    };
  },
};
