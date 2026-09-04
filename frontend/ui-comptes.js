// Panneau CRUD comptes.
const $ = (s) => document.querySelector(s);

export function creerUiComptes(api, etat, { statut, echec, surChangement }) {

  function rendre() {
    const tb = $("#liste-comptes tbody");
    tb.innerHTML = "";
    for (const c of etat.comptes) {
      const tr = tb.insertRow();
      tr.insertCell().textContent = c.nom;
      tr.insertCell().textContent = c.titulaire ?? "";
      tr.insertCell().textContent = c.iban_masque ? `…${c.iban_masque}` : "";
      tr.insertCell().textContent = c.note ?? "";
      tr.insertCell().textContent = c.commun ? "commun" : "";
      const td = tr.insertCell();
      const btn = document.createElement("button");
      btn.textContent = "supprimer";
      btn.addEventListener("click", async () => {
        try {
          await api.supprimerCompte(c.id);
          etat.comptes = etat.comptes.filter((x) => x.id !== c.id);
          rendre();
          surChangement();
          statut("Compte supprimé.");
        } catch (e) { echec(e); }
      });
      td.append(btn);
    }
  }

  $("#form-compte").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    try {
      const c = await api.creerCompte({
        nom: f.get("nom").trim(),
        titulaire: f.get("titulaire")?.trim() || null,
        iban_masque: f.get("iban_masque")?.trim() || null,
        note: f.get("note")?.trim() || null,
        commun: f.get("commun") === "on",
      });
      etat.comptes.push(c);
      ev.target.reset();
      rendre();
      surChangement();
      statut("Compte créé.");
    } catch (e) { echec(e); }
  });

  $("#ouvrir-comptes").addEventListener("click", () => { $("#panneau-comptes").hidden = false; rendre(); });

  return { rendre };
}
