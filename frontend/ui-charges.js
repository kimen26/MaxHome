// Panneau gestion des charges : renommer, catégorie, ordre, archiver.
const $ = (s) => document.querySelector(s);
const CATEGORIES = ["Logement", "Max", "Épargne", "Alimentation", "Impôts", "Banque", "Autre"];

export function creerUiCharges(api, etat, { statut, echec, surChangement }) {

  function rendre() {
    const tb = $("#liste-charges tbody");
    tb.innerHTML = "";
    const triees = [...etat.charges].filter((c) => !c.ponctuel).sort((a, b) => a.ordre - b.ordre);
    for (const c of triees) {
      const tr = tb.insertRow();
      if (!c.actif) tr.className = "inactif";

      const tdLib = tr.insertCell();
      const inpLib = document.createElement("input");
      inpLib.value = c.libelle;
      inpLib.addEventListener("change", async () => {
        try {
          await api.majCharge(c.id, { libelle: inpLib.value.trim() });
          c.libelle = inpLib.value.trim();
          statut("Renommé.");
          surChangement();
        } catch (e) { echec(e); }
      });
      tdLib.append(inpLib);

      const tdCat = tr.insertCell();
      const selCat = document.createElement("select");
      for (const cat of CATEGORIES) selCat.add(new Option(cat, cat, false, cat === c.categorie));
      selCat.addEventListener("change", async () => {
        try {
          await api.majCharge(c.id, { categorie: selCat.value });
          c.categorie = selCat.value;
          statut("Catégorie changée.");
          surChangement();
        } catch (e) { echec(e); }
      });
      tdCat.append(selCat);

      const tdOrdre = tr.insertCell();
      tdOrdre.className = "actions";
      const haut = document.createElement("button");
      haut.textContent = "▲";
      haut.addEventListener("click", () => echangerOrdre(c, -1));
      const bas = document.createElement("button");
      bas.textContent = "▼";
      bas.addEventListener("click", () => echangerOrdre(c, 1));
      tdOrdre.append(haut, bas);

      const tdArch = tr.insertCell();
      const btnArch = document.createElement("button");
      btnArch.textContent = c.actif ? "archiver" : "réactiver";
      btnArch.addEventListener("click", async () => {
        try {
          await api.majCharge(c.id, { actif: !c.actif });
          c.actif = !c.actif;
          rendre();
          surChangement();
          statut(c.actif ? "Réactivée." : "Archivée.");
        } catch (e) { echec(e); }
      });
      tdArch.append(btnArch);
    }
  }

  async function echangerOrdre(c, delta) {
    const meme = etat.charges.filter((x) => !x.ponctuel).sort((a, b) => a.ordre - b.ordre);
    const i = meme.findIndex((x) => x.id === c.id);
    const j = i + delta;
    if (j < 0 || j >= meme.length) return;
    const autre = meme[j];
    try {
      const [oc, oa] = [c.ordre, autre.ordre];
      await api.majCharge(c.id, { ordre: oa });
      await api.majCharge(autre.id, { ordre: oc });
      c.ordre = oa;
      autre.ordre = oc;
      rendre();
      surChangement();
    } catch (e) { echec(e); }
  }

  $("#form-charge").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    try {
      const ordre = Math.max(0, ...etat.charges.filter((c) => !c.ponctuel).map((c) => c.ordre)) + 1;
      const regle = f.get("regle");
      const c = await api.creerCharge({
        libelle: f.get("libelle").trim(), categorie: f.get("categorie"),
        regle, type: regle === "proport" ? "proport" : "egales", ordre,
      });
      etat.charges.push(c);
      ev.target.reset();
      rendre();
      surChangement();
      statut("Charge créée.");
    } catch (e) { echec(e); }
  });

  $("#ouvrir-charges").addEventListener("click", () => { $("#panneau-charges").hidden = false; rendre(); });

  return { rendre };
}
