// Écran « Comptes » : cartes par compte, le commun mis en avant. La note porte le virement permanent.

import { txt, copier } from "../socle/ui-base.js";
import { creerReglages } from "../socle/blocs-reglages.js";
import { champ, zone, caseACocher, lire } from "../socle/blocs-form.js";
import { nettoyerIban, erreurIban, formaterIban, derniersCaracteres } from "./iban.js";

export function creerUiComptes(api, etat, cb) {
  const carte = (c) => `<div class="carte compte${c.commun ? " commun" : ""}">
    <div class="compte-tete">
      <div><span class="compte-nom">${txt(c.nom)}</span>
        ${c.titulaire ? `<span class="sous">${txt(c.titulaire)}</span>` : ""}</div>
      ${c.commun ? '<span class="pastille bleue">Compte commun</span>' : ""}
    </div>
    ${c.iban ? `<p class="mono compte-iban">${formaterIban(c.iban).split(" ").map((g) => `<span>${txt(g)}</span>`).join(" ")}</p>
      <button class="btn-lien compte-copier-iban" data-copier-iban="${c.id}">Copier l'IBAN</button>` : ""}
    ${c.note ? `<p class="compte-note">${txt(c.note)}</p>` : ""}
    ${c.libelle_virement ? `<p class="compte-libelle">Libellé virement : <span class="mono">${txt(c.libelle_virement)}</span>${c.libelle_variable ? " (modèle, change chaque mois)" : ""}</p>
      <button class="btn-lien compte-copier-libelle" data-copier-libelle="${c.id}">Copier le libellé</button>` : ""}
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
      ${champ("iban", "IBAN", { valeur: c?.iban, placeholder: "ex. FR76 3000 ...", attrs: 'autocomplete="off" spellcheck="false"' })}
      ${champ("bic", "BIC (facultatif)", { valeur: c?.bic, placeholder: "ex. BNPAFRPP" })}
      ${zone("note", "Note — virement permanent (montant et jour)", c?.note, { placeholder: "ex. permanent de 3 000 € le 2" })}
      ${champ("libelle_virement", "Libellé à mettre sur le virement", { valeur: c?.libelle_virement, placeholder: "ex. CL-4821, ou Prénom Nom Facture n°" })}
      ${caseACocher("libelle_variable", "Change chaque mois (ex. numéro de facture)", c?.libelle_variable)}
      ${caseACocher("commun", "Compte commun", c?.commun)}`,
    champs: (form, c) => {
      const valeurs = lire(form, { booleens: ["commun", "libelle_variable"] });
      const messageErreur = erreurIban(valeurs.iban);
      if (messageErreur) throw new Error(messageErreur);
      const iban = valeurs.iban ? nettoyerIban(valeurs.iban) : null;
      const bic = valeurs.bic ? valeurs.bic.toUpperCase().replace(/\s/g, "") : null;
      // iban_masque reste à jour pour ui-mouvements.js (detailCompte), qui n'affiche que les
      // 4 derniers caractères dans le détail d'un mouvement.
      return { ...valeurs, iban, bic, iban_masque: derniersCaracteres(iban) ?? c?.iban_masque ?? null };
    },
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

  const rendre = () => {
    reglages.rendre();
    document.querySelectorAll("[data-copier-iban]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = etat.comptes.find((x) => x.id === Number(btn.dataset.copierIban));
        if (c?.iban) copier(c.iban);
      });
    });
    document.querySelectorAll("[data-copier-libelle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = etat.comptes.find((x) => x.id === Number(btn.dataset.copierLibelle));
        if (c?.libelle_virement) copier(c.libelle_virement);
      });
    });
  };

  return { rendre };
}
