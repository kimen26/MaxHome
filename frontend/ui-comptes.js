// Écran « Comptes » : cartes par compte, le commun mis en avant. La note porte le virement permanent.

import { $, txt, ouvrirFeuille, fermerFeuille, toast } from "./ui-base.js";

export function creerUiComptes(api, etat, cb) {
  function rendre() {
    $("#liste-comptes").innerHTML = etat.comptes.length
      ? etat.comptes.map((c) => `<div class="carte compte${c.commun ? " commun" : ""}">
          <div class="compte-tete">
            <div><span class="compte-nom">${txt(c.nom)}</span>
              ${c.titulaire ? `<span class="sous">${txt(c.titulaire)}</span>` : ""}</div>
            ${c.commun ? '<span class="pastille bleue">Compte commun</span>' : ""}
          </div>
          ${c.iban_masque ? `<p class="mono compte-iban">····${txt(c.iban_masque)}</p>` : ""}
          ${c.note ? `<p class="compte-note">${txt(c.note)}</p>` : ""}
          <div class="rec-actions">
            <button class="btn-lien" data-modifier="${c.id}">Modifier</button>
            <button class="btn-lien" data-supprimer="${c.id}">Supprimer</button>
          </div>
        </div>`).join("")
      : '<p class="vide">Aucun compte enregistré.</p>';

    $("#form-compte").innerHTML = '<button class="btn btn-tirets" id="btn-nouveau-compte">+ Nouveau compte</button>';
    $("#btn-nouveau-compte").addEventListener("click", () => formulaire(null));
    for (const b of document.querySelectorAll("#liste-comptes [data-modifier]")) {
      b.addEventListener("click", () => formulaire(etat.comptes.find((c) => c.id === Number(b.dataset.modifier))));
    }
    for (const b of document.querySelectorAll("#liste-comptes [data-supprimer]")) {
      b.addEventListener("click", () => supprimer(Number(b.dataset.supprimer)));
    }
  }

  function formulaire(c) {
    ouvrirFeuille(`<form id="form-cpt" class="pile">
      <h2>${c ? "Modifier le compte" : "Nouveau compte"}</h2>
      <label>Nom <input class="champ" name="nom" required value="${txt(c?.nom ?? "")}" placeholder="ex. Boursorama commun"></label>
      <label>Titulaire <input class="champ" name="titulaire" value="${txt(c?.titulaire ?? "")}"></label>
      <label>4 derniers chiffres <input class="champ" name="iban_masque" maxlength="4" inputmode="numeric"
        value="${txt(c?.iban_masque ?? "")}"></label>
      <label>Note — virement permanent (montant et jour)
        <textarea class="champ" name="note" rows="2" placeholder="ex. permanent de 3 000 € le 2">${txt(c?.note ?? "")}</textarea></label>
      <label class="case-a-cocher"><input type="checkbox" name="commun" ${c?.commun ? "checked" : ""}> Compte commun</label>
      <button type="submit" class="btn btn-bleu grandir">${c ? "Enregistrer" : "Ajouter"}</button>
    </form>`);

    $("#form-cpt").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const champs = {
        nom: f.get("nom").trim(),
        titulaire: f.get("titulaire").trim() || null,
        iban_masque: f.get("iban_masque").trim() || null,
        note: f.get("note").trim() || null,
        commun: f.get("commun") === "on",
      };
      try {
        if (c) { await api.majCompte(c.id, champs); Object.assign(c, champs); }
        else { etat.comptes.push(await api.creerCompte(champs)); }
        fermerFeuille();
        rendre();
        toast("Enregistré.");
        await cb.rafraichirMois();
      } catch (e) { cb.echec(e); }
    });
  }

  async function supprimer(id) {
    const c = etat.comptes.find((x) => x.id === id);
    if (!c || !confirm(`Supprimer « ${c.nom} » ?`)) return;
    try {
      await api.supprimerCompte(id);
      etat.comptes = etat.comptes.filter((x) => x.id !== id);
      rendre();
      toast("Compte supprimé.");
    } catch (e) { cb.echec(e); }
  }

  return { rendre };
}
