// Écran « Mouvements récurrents » : le modèle défini une fois, régénéré chaque mois.
// Le cycle CRUD vient de blocs-reglages ; ici, le HTML de la liste et du formulaire.

import { euros, versCentimes } from "./calc.js";
import { txt } from "../socle/ui-base.js";
import { carteListe, ligneReglage, trajetComptes } from "../socle/blocs.js";
import { creerReglages } from "../socle/blocs-reglages.js";
import { champ, montant, zone, select, comptesOptions, membresOptions, lire } from "../socle/blocs-form.js";

const MODES = [["fixe", "Montant fixe"], ["charge", "Suit une charge"], ["part", "Part d’une personne"]];

export function creerUiRecurrents(api, etat, cb) {
  const trajet = (r) => trajetComptes(etat.comptes, r.compte_de, r.compte_vers);

  /** Montant : chiffre en mono pour un fixe, formule en texte courant sinon. */
  const decrireMontant = (r) => {
    if (r.mode === "fixe") return `<span class="mono">${euros(r.montant_centimes ?? 0)}</span>`;
    if (r.mode === "charge") return `charge « ${txt(etat.charges.find((c) => c.id === r.charge_id)?.libelle ?? "?")} »`;
    return `part de ${txt(r.prenom_part ?? "?")}`;
  };

  const reglages = creerReglages({
    liste: "#liste-recurrents", bouton: "#form-recurrent",
    libelleNouveau: "+ Nouveau mouvement récurrent",
    elements: () => etat.recurrents,
    htmlListe: (liste) => carteListe(liste.map((r) => ligneReglage({
      id: r.id, titre: r.titre,
      sous: `${txt(trajet(r))}${r.jour ? ` · le ${r.jour}` : ""}`,
      consigne: r.consigne, droite: `<span>${decrireMontant(r)}</span>`,
      pastille: r.qui, inactif: !r.actif,
    })), "Aucun mouvement récurrent."),
    titreForm: (r) => (r ? "Modifier le mouvement" : "Nouveau mouvement récurrent"),
    htmlForm: (r) => `
      ${champ("titre", "Titre", { valeur: r?.titre, requis: true })}
      ${select("compte_de", "De", comptesOptions(etat), r?.compte_de, { vide: "—" })}
      ${select("compte_vers", "Vers", comptesOptions(etat), r?.compte_vers, { vide: "—" })}
      ${select("mode", "Montant", MODES, r?.mode ?? "fixe")}
      ${montant("montant", "Montant fixe", r?.montant_centimes).replace("<label>", '<label data-si="fixe">')}
      ${select("charge_id", "Charge liée",
    etat.charges.filter((c) => c.actif !== false).map((c) => [c.id, c.libelle]), r?.charge_id, { vide: "—", attrs: 'data-si="charge"' })}
      ${select("prenom_part", "Part de", membresOptions(etat), r?.prenom_part, { attrs: 'data-si="part"' })}
      ${select("qui", "Qui s’en occupe", membresOptions(etat), r?.qui, { vide: "—" })}
      ${champ("jour", "Jour habituel", { type: "number", valeur: r?.jour, attrs: 'min="1" max="31"' })}
      ${zone("consigne", "Consigne", r?.consigne, { lignes: 3 })}`,
    apresOuverture: (form) => {
      const majVisibilite = () => {
        for (const l of form.querySelectorAll("[data-si]")) l.hidden = l.dataset.si !== form.mode.value;
      };
      form.mode.addEventListener("change", majVisibilite);
      majVisibilite();
    },
    champs: (form) => {
      const v = lire(form, { nombres: ["compte_de", "compte_vers", "charge_id", "jour"] });
      return {
        titre: v.titre, compte_de: v.compte_de, compte_vers: v.compte_vers, mode: v.mode,
        montant_centimes: v.mode === "fixe" && v.montant ? versCentimes(v.montant) : null,
        charge_id: v.mode === "charge" ? v.charge_id : null,
        prenom_part: v.mode === "part" ? v.prenom_part : null,
        qui: v.qui, jour: v.jour, consigne: v.consigne,
      };
    },
    api: {
      creer: async (valeurs) => { etat.recurrents.push(await api.creerRecurrent({ ...valeurs, actif: true })); },
      maj: (id, valeurs) => api.majRecurrent(id, valeurs),
      // Désactivation plutôt que suppression : l'historique des mois passés reste lisible.
      retirer: async (r) => { await api.majRecurrent(r.id, { actif: false }); r.actif = false; },
    },
    apresEcriture: () => cb.rafraichir("budget"),
    confirmerRetrait: (r) => `Retirer « ${r.titre} » ? Les mouvements déjà générés restent en place.`,
    messageRetrait: "Mouvement retiré.",
    echec: cb.echec,
  });

  return { rendre: reglages.rendre };
}
