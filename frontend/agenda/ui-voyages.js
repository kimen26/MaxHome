// Écran « Réglages · Voyages » : la liste des voyages du foyer, à ajouter, modifier, retirer.
// Le cycle CRUD vient de blocs-reglages ; ici le HTML de la liste et du formulaire.

import { txt } from "../socle/ui-base.js";
import { carteListe, ligneReglage } from "../socle/blocs.js";
import { creerReglages } from "../socle/blocs-reglages.js";
import { champ, zone, lire } from "../socle/blocs-form.js";
import { formatPeriode, nbJours, jourIso } from "./calendrier.js";

export function creerUiVoyages(api, etat, cb, { rendreMois }) {
  const tries = () => [...etat.voyages].sort((a, b) => a.debut.localeCompare(b.debut));

  const reglages = creerReglages({
    liste: "#liste-voyages", bouton: "#form-voyage",
    libelleNouveau: "+ Nouveau voyage",
    elements: tries,
    htmlListe: (liste) => carteListe(liste.map((v) => ligneReglage({
      id: v.id, titre: v.titre,
      sous: `${txt(formatPeriode(v.debut, v.fin, { annee: true }))} · ${nbJours(v.debut, v.fin)} j${v.lieu ? ` · ${txt(v.lieu)}` : ""}`,
      consigne: v.note, inactif: v.fin < jourIso(new Date()),
    })), "Aucun voyage pour l’instant."),
    titreForm: (v) => (v ? "Modifier le voyage" : "Nouveau voyage"),
    htmlForm: (v) => `
      ${champ("titre", "Titre", { valeur: v?.titre, requis: true, placeholder: "Ski en famille" })}
      ${champ("lieu", "Lieu", { valeur: v?.lieu, placeholder: "Le Lioran" })}
      ${champ("debut", "Du", { type: "date", valeur: v?.debut, requis: true })}
      ${champ("fin", "Au", { type: "date", valeur: v?.fin, requis: true })}
      ${zone("note", "Note", v?.note, { lignes: 3, placeholder: "Hébergement, train, à ne pas oublier…" })}`,
    champs: (form) => {
      const v = lire(form);
      if (!v.debut || !v.fin) throw new Error("Les deux dates sont obligatoires.");
      if (v.fin < v.debut) throw new Error("La date de fin est avant le début.");
      return { titre: v.titre, lieu: v.lieu, debut: v.debut, fin: v.fin, note: v.note };
    },
    api: {
      creer: async (valeurs) => { etat.voyages.push(await api.creerVoyage({ ...valeurs, cree_par: etat.prenom })); },
      maj: (id, valeurs) => api.majVoyage(id, valeurs),
      retirer: async (v) => {
        await api.supprimerVoyage(v.id);
        etat.voyages = etat.voyages.filter((x) => x.id !== v.id);
      },
    },
    apresEcriture: async () => { rendreMois(); },
    confirmerRetrait: (v) => `Retirer « ${v.titre} » du calendrier ?`,
    messageRetrait: "Voyage retiré.",
    echec: cb.echec,
  });

  return { rendre: reglages.rendre };
}
