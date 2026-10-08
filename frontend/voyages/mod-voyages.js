// Module Voyages : ce qu'on prépare et ce qu'on guette. Trois écrans : Nos voyages (liste +
// fiche carnet, ex-onglet de l'Agenda), Pépites (veille vols de MaxVoyage,
// docs/briefs/veille-vols.md) et Alertes (ce que MaxVoyage surveille, D-056). Le carnet vit
// encore dans frontend/agenda/ : le calendrier et Réglages · Voyages (création, dates) restent
// à l'Agenda, qui charge aussi `etat.voyages`.

import { creerUiVoyagesListe } from "../agenda/ui-voyages-liste.js";
import { creerFicheVoyage } from "../agenda/ui-fiche-voyage.js";
import { budgetParPoste } from "../agenda/carnet.js";
import { jourIso, prochaines, relatif } from "../agenda/calendrier.js";
import { creerUiPepites } from "./ui-pepites.js";
import { creerUiAlertes } from "./ui-alertes.js";
import { nbBonsPlans } from "./pepites.js";

export default {
  cle: "voyages", nom: "Voyages", defaut: "voyages-liste", avecMois: false,
  onglets: [["voyages-liste", "Nos voyages"], ["pepites", "Pépites"], ["alertes", "Alertes"]],
  reglages: [],
  // `voyageCompte` = { lieux, resas, budget, resume } par voyage_id, pour les cartes de la liste.
  // `veille` = dernier instantané MaxVoyage ({ genere_le, contenu }) ou null.
  // `alertes` = lignes de veille_alertes. Les périodes de vacances du formulaire viennent de
  // `etat.vacances`, chargé par l'Agenda.
  etatInitial: { voyageCompte: {}, veille: null, alertes: [] },
  referentiels: () => ({}),

  creer(api, etat, cb) {
    const fiche = creerFicheVoyage(api, etat, cb);
    const liste = creerUiVoyagesListe(api, etat, cb, { ouvrirFiche: fiche.ouvrir });
    const pepites = creerUiPepites(api, etat);
    const alertes = creerUiAlertes(api, etat, cb);

    return {
      ecrans: { "voyages-liste": liste.rendre, pepites: pepites.rendre, alertes: alertes.rendre },
      async charger() {
        // La veille vols est un bonus : son absence ne doit pas priver la liste des voyages.
        const [voyages, compteurs, veille, alertes] = await Promise.all([
          api.voyages(),
          api.voyageCompteurs(),
          api.veilleVols().catch((e) => { cb.echec(e); return null; }),
          api.veilleAlertes().catch((e) => { cb.echec(e); return []; }),
        ]);
        etat.voyages = voyages;
        etat.veille = veille;
        etat.alertes = alertes;
        etat.voyageCompte = Object.fromEntries(voyages.map((v) => {
          const resas = compteurs.resas.filter((r) => r.voyage_id === v.id);
          return [v.id, {
            lieux: compteurs.lieux.filter((l) => l.voyage_id === v.id).length,
            resas: resas.length,
            budget: budgetParPoste(resas, compteurs.enveloppes.filter((e) => e.voyage_id === v.id)),
            resume: compteurs.resumes.find((r) => r.voyage_id === v.id)?.texte ?? null,
          }];
        }));
      },
      resume() {
        const [voyage] = prochaines(etat.voyages, jourIso(new Date()), 1);
        const parts = [voyage ? `${voyage.titre} ${relatif(voyage, jourIso(new Date()))}` : "Aucun voyage prévu"];
        const n = nbBonsPlans(etat.veille?.contenu);
        if (n) parts.push(`${n} bon${n > 1 ? "s" : ""} plan${n > 1 ? "s" : ""} vols`);
        return parts.join(" · ");
      },
    };
  },
};
