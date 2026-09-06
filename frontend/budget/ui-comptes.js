// Écran « Comptes » : cartes par compte, le commun mis en avant. La note porte le virement permanent.

import { txt } from "../socle/ui-base.js";
import { creerReglages } from "../socle/blocs-reglages.js";
import { champ, zone, caseACocher, lire } from "../socle/blocs-form.js";

export function creerUiComptes(api, etat, cb) {
  const carte = (c) => `<div class="carte compte${c.commun ? " commun" : ""}">
    <div class="compte-tete">
      <div><span class="compte-nom">${txt(c.nom)}</span>
        ${c.titulaire ? `<span class="sous">${txt(c.titulaire)}</span>` : ""}</div>
      ${c.commun ? '<span class="pastille bleue">Compte commun</span>' : ""}
    </div>
    ${c.iban_masque ? `<p class="mono compte-iban">····${txt(c.iban_masque)}</p>` : ""}
    ${c.note ? `<p class="compte-note">${txt(c.note)}</p>` : ""}
    <div class="rec-actions">
      <button class="btn-lien" data-modifier="${c.id}">Modifier</button>
      <button class="btn-lien" data-retirer="${c.id}">Supprimer</button>
    </div>
  </div>`;

  const reglages = creerReglages({
    liste: "#liste-comptes", bouton: "#form-compte", libelleNouveau: "+ Nouveau compte",
    elements: () => etat.comptes,
    htmlListe: (liste) => (liste.length ? liste.map(carte).join("") : '<p class="vide">Aucun compte enregistré.</p>'),
    titreForm: (c) => (c ? "Modifier le compte" : "Nouveau compte"),
    htmlForm: (c) => `
      ${champ("nom", "Nom", { valeur: c?.nom, requis: true, placeholder: "ex. Boursorama commun" })}
      ${champ("titulaire", "Titulaire", { valeur: c?.titulaire })}
      ${champ("iban_masque", "4 derniers chiffres", { valeur: c?.iban_masque, attrs: 'maxlength="4" inputmode="numeric"' })}
      ${zone("note", "Note — virement permanent (montant et jour)", c?.note, { placeholder: "ex. permanent de 3 000 € le 2" })}
      ${caseACocher("commun", "Compte commun", c?.commun)}`,
    champs: (form) => lire(form, { booleens: ["commun"] }),
    api: {
      creer: async (valeurs) => { etat.comptes.push(await api.creerCompte(valeurs)); },
      maj: (id, valeurs) => api.majCompte(id, valeurs),
      retirer: async (c) => { await api.supprimerCompte(c.id); etat.comptes = etat.comptes.filter((x) => x.id !== c.id); },
    },
    apresEcriture: () => cb.rafraichir("budget"),
    confirmerRetrait: (c) => `Supprimer « ${c.nom} » ?`,
    messageRetrait: "Compte supprimé.",
    echec: cb.echec,
  });

  return { rendre: reglages.rendre };
}
