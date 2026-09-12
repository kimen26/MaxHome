// Module Tâches : qui fait quoi à la maison, en parts (échelle 0,5·1·2·3·5·8).

import { creerUiTaches, STRATEGIE_TACHES } from "./ui-taches.js";
import { creerUiTachesSemaine } from "./ui-taches-semaine.js";
import { creerUiTachesRec } from "./ui-taches-rec.js";
import { jourIso, decalerJours, balance, groupe } from "./taches.js";
import { synchroniserOccurrences } from "../socle/occurrences.js";

const JOURS_HISTORIQUE = 35; // couvre la balance sur 30 jours

export default {
  cle: "taches", nom: "Tâches", defaut: "jour", avecMois: false,
  onglets: [["jour", "Jour"], ["semaine", "Semaine"], ["taches-rec", "Réglages"]],
  plus: [],
  etatInitial: { tachesRec: [], taches: [] },
  referentiels: (api) => ({ tachesRec: api.tachesRec() }),

  creer(api, etat, cb) {
    const jour = creerUiTaches(api, etat, cb);
    const semaine = creerUiTachesSemaine(api, etat, cb, jour);
    const rec = creerUiTachesRec(api, etat, cb);
    return {
      ecrans: { jour: jour.rendre, semaine: semaine.rendre, "taches-rec": rec.rendre },
      avantChargement() { jour.fermerDetail(); },
      async charger() {
        etat.taches = await api.taches(decalerJours(jourIso(new Date()), -JOURS_HISTORIQUE));
        await synchroniserOccurrences(api, etat, STRATEGIE_TACHES);
      },
      resume() {
        const auj = jourIso(new Date());
        const aFaire = etat.taches.filter((t) => !t.fait_le && ["retard", "aujourdhui"].includes(groupe(t, auj))).length;
        const b = balance(etat.taches, etat.tachesRec, etat.membres.map((m) => m.prenom), decalerJours(auj, -6), auj);
        const parts = etat.membres.map((m) => `${m.prenom} ${Math.round((b.ratio[m.prenom] ?? 0) * 100)} %`).join(" / ");
        return `${aFaire ? `${aFaire} tâche${aFaire > 1 ? "s" : ""} aujourd’hui` : "Rien à faire aujourd’hui"} · 7 j : ${parts}`;
      },
    };
  },
};
