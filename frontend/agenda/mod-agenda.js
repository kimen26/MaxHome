// Module Agenda : le calendrier du foyer — voyages, vacances scolaires de notre zone, jours
// fériés. Quatre écrans : Mois (grille), Vacances (par zone), Voyages (liste + fiche carnet),
// Réglages · Voyages (CRUD titre/dates).

import { creerUiAgenda } from "./ui-agenda.js";
import { creerUiVacances } from "./ui-vacances.js";
import { creerUiVoyages } from "./ui-voyages.js";
import { creerUiVoyagesListe } from "./ui-voyages-liste.js";
import { creerFicheVoyage } from "./ui-fiche-voyage.js";
import { chargerVacances, ZONE_DEFAUT } from "./vacances.js";
import { jourIso, prochaines, relatif } from "./calendrier.js";
import { budgetParPoste } from "./carnet.js";

const auj = () => jourIso(new Date());

export default {
  cle: "agenda", nom: "Agenda", defaut: "agenda-mois", avecMois: false,
  onglets: [["agenda-mois", "Mois"], ["vacances", "Vacances"], ["voyages-liste", "Voyages"]],
  reglages: [["voyages", "Voyages"]],
  // `agenda` = mois affiché par la grille (indépendant du sélecteur de mois du Budget : on
  // regarde souvent l'agenda à plusieurs mois, le budget au mois courant).
  // `vacances` = périodes de la zone du foyer ; `vacancesParZone` = cache mémoire par zone
  // pour l'écran Vacances, qui compare les zones sans recharger. `voyageCompte` = { lieux,
  // resas } par voyage_id, pour la carte de l'écran Voyages (« n résas · n lieux »).
  etatInitial: {
    voyages: [], parametres: [], zone: ZONE_DEFAUT, vacances: [], vacancesPerimees: false,
    vacancesParZone: {}, voyageCompte: {},
    agenda: { annee: new Date().getFullYear(), mois: new Date().getMonth() + 1 },
  },
  referentiels: (api) => ({ parametres: api.parametres() }),

  creer(api, etat, cb) {
    const lireZone = () => etat.parametres.find((p) => p.cle === "zone")?.valeur ?? ZONE_DEFAUT;

    /** Charge (ou relit du cache) les vacances d'une zone, mémorisées dans l'état. */
    async function vacancesDe(zone) {
      if (etat.vacancesParZone[zone]) return etat.vacancesParZone[zone];
      const r = await chargerVacances(zone);
      etat.vacancesParZone[zone] = r;
      return r;
    }

    async function changerZone(zone) {
      const ligne = await api.majParametre("zone", zone);
      const i = etat.parametres.findIndex((p) => p.cle === "zone");
      if (i === -1) etat.parametres.push(ligne); else etat.parametres[i] = ligne;
      etat.zone = zone;
      const r = await vacancesDe(zone);
      etat.vacances = r.periodes;
      etat.vacancesPerimees = r.perime;
    }

    const mois = creerUiAgenda(api, etat, cb);
    const vac = creerUiVacances(api, etat, cb, { vacancesDe, changerZone, rendreMois: mois.rendre });
    const voyages = creerUiVoyages(api, etat, cb, { rendreMois: mois.rendre });
    const fiche = creerFicheVoyage(api, etat, cb);
    const listeVoyages = creerUiVoyagesListe(api, etat, cb, { ouvrirFiche: fiche.ouvrir });

    return {
      ecrans: { "agenda-mois": mois.rendre, vacances: vac.rendre, voyages: voyages.rendre, "voyages-liste": listeVoyages.rendre },
      async charger() {
        etat.zone = lireZone();
        // Les voyages viennent de la base ; les vacances d'une API publique. Si celle-ci
        // manque et qu'aucun cache n'existe, l'écran Mois montre quand même voyages et fériés :
        // l'erreur est signalée (bandeau) sans vider tout l'écran.
        const [voyages, vacances, compteurs] = await Promise.all([
          api.voyages(),
          vacancesDe(etat.zone).catch((e) => { cb.echec(e); return { periodes: [], perime: false }; }),
          api.voyageCompteurs().catch((e) => { cb.echec(e); return { lieux: [], resas: [], enveloppes: [], resumes: [] }; }),
        ]);
        etat.voyages = voyages;
        etat.vacances = vacances.periodes;
        etat.vacancesPerimees = vacances.perime;
        etat.voyageCompte = {};
        for (const v of voyages) {
          etat.voyageCompte[v.id] = {
            lieux: compteurs.lieux.filter((l) => l.voyage_id === v.id).length,
            resas: compteurs.resas.filter((r) => r.voyage_id === v.id).length,
            budget: budgetParPoste(compteurs.resas.filter((r) => r.voyage_id === v.id), compteurs.enveloppes.filter((e) => e.voyage_id === v.id)),
            resume: compteurs.resumes.find((r) => r.voyage_id === v.id)?.texte ?? null,
          };
        }
      },
      resume() {
        const a = auj();
        const [voyage] = prochaines(etat.voyages, a, 1);
        const [vacances] = prochaines(etat.vacances, a, 1);
        const parts = [];
        if (voyage) parts.push(`${voyage.titre} ${relatif(voyage, a)}`);
        if (vacances) parts.push(`${vacances.titre} ${relatif(vacances, a)}`);
        return parts.length ? parts.join(" · ") : "Aucun voyage prévu";
      },
    };
  },
};
