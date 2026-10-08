// Écran « Mouvements récurrents » : le modèle défini une fois, régénéré chaque mois.
// Le cycle CRUD vient de blocs-reglages ; ici, le HTML de la liste et du formulaire.

import { euros, versCentimes } from "./calc.js";
import { txt } from "../socle/ui-base.js";
import { carteListe, ligneReglage, trajetComptes } from "../socle/blocs.js";
import { creerReglages } from "../socle/blocs-reglages.js";
import { champ, montant, zone, select, caseACocher, comptesOptions, membresOptions, lire } from "../socle/blocs-form.js";
import { aReserve } from "./reserve.js";

const MODES = [["fixe", "Montant fixe"], ["charge", "Suit une charge"], ["part", "Part d’une personne"]];
const RYTHMES_RELAIS = [[1, "Chaque mois"], [2, "Tous les 2 mois"], [3, "Tous les 3 mois"],
  [6, "Tous les 6 mois"], [12, "Une fois par an"]];
const MOIS_OPTIONS = [["1", "Janvier"], ["2", "Février"], ["3", "Mars"], ["4", "Avril"], ["5", "Mai"],
  ["6", "Juin"], ["7", "Juillet"], ["8", "Août"], ["9", "Septembre"], ["10", "Octobre"],
  ["11", "Novembre"], ["12", "Décembre"]];

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
      sous: `${txt(trajet(r))}${r.jour ? ` · le ${r.jour}` : ""}${r.automatique ? " · automatique" : ""}`,
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
      ${zone("consigne", "Consigne", r?.consigne, { lignes: 3 })}
      ${caseACocher("automatique", "Virement automatique (rien à cocher)", r?.automatique === true)}
      <div data-si="charge" class="bloc-relais">
        <label class="case-a-cocher"><input type="checkbox" name="relais_actif"${aReserve(r) ? " checked" : ""}>
          Passe par une réserve (mis de côté ici, payé plus tard ailleurs)</label>
        <div data-si-relais hidden>
          ${select("relais_vers", "Compte final", comptesOptions(etat), r?.relais_vers, { vide: "—" })}
          ${select("relais_tous_les", "Rythme de paiement", RYTHMES_RELAIS, r?.relais_tous_les ?? 1)}
          ${select("relais_depart", "Mois de paiement", MOIS_OPTIONS, r?.relais_depart, { vide: "—" })}
        </div>
      </div>`,
    apresOuverture: (form) => {
      const majVisibilite = () => {
        for (const l of form.querySelectorAll("[data-si]")) l.hidden = l.dataset.si !== form.mode.value;
      };
      const majRelais = () => { form.querySelector("[data-si-relais]").hidden = !form.relais_actif.checked; };
      form.mode.addEventListener("change", majVisibilite);
      form.relais_actif.addEventListener("change", majRelais);
      majVisibilite();
      majRelais();
    },
    champs: (form) => {
      const v = lire(form, {
        nombres: ["compte_de", "compte_vers", "charge_id", "jour", "relais_vers", "relais_tous_les", "relais_depart"],
        booleens: ["relais_actif", "automatique"],
      });
      const relais = v.mode === "charge" && v.relais_actif;
      return {
        titre: v.titre, compte_de: v.compte_de, compte_vers: v.compte_vers, mode: v.mode,
        montant_centimes: v.mode === "fixe" && v.montant ? versCentimes(v.montant) : null,
        charge_id: v.mode === "charge" ? v.charge_id : null,
        prenom_part: v.mode === "part" ? v.prenom_part : null,
        qui: v.qui, jour: v.jour, consigne: v.consigne, automatique: v.automatique,
        relais_vers: relais ? v.relais_vers : null,
        relais_tous_les: relais ? (v.relais_tous_les ?? 1) : 1,
        relais_depart: relais ? v.relais_depart : null,
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
