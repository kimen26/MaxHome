// Écran mensuel : bloc à faire, revenus, charges par catégorie, ponctuels, ajustements.
import { calculer, euros, versCentimes, TYPES } from "./calc.js";

const $ = (s) => document.querySelector(s);
const CATEGORIES = ["Logement", "Max", "Épargne", "Alimentation", "Impôts", "Banque", "Autre"];
const clePliage = (cat) => `mb_pli_${cat}`;

function inputMontant(valeur, onChange, echec) {
  const inp = document.createElement("input");
  inp.className = "montant";
  inp.inputMode = "decimal";
  inp.value = valeur ? (valeur / 100).toFixed(2).replace(".", ",") : "";
  const colorer = () => {
    inp.classList.toggle("neg", valeur < 0);
    inp.classList.toggle("pos", valeur > 0);
  };
  colorer();
  inp.addEventListener("change", async () => {
    try {
      valeur = inp.value.trim() === "" ? 0 : versCentimes(inp.value);
      inp.value = valeur ? (valeur / 100).toFixed(2).replace(".", ",") : "";
      colorer();
      await onChange(valeur);
    } catch (e) { echec(e); }
  });
  return inp;
}

export function creerUiMois(api, etat, { statut, echec, rafraichirMois }) {

  function rendreBlocAFaire(r) {
    const bloc = $("#a-faire");
    bloc.innerHTML = "";
    for (const m of etat.membres) {
      const p = m.prenom;
      const montant = -r.aVerser[p]; // aVerser négatif = ce que la personne doit verser
      const compte = etat.comptes.find((c) => c.commun) ?? null;
      const virement = etat.virements[p];
      const div = document.createElement("div");
      div.className = "carte-verse";
      const ligneCompte = compte
        ? `${compte.nom}${compte.iban_masque ? ` (…${compte.iban_masque})` : ""}`
        : "aucun compte commun défini";
      const noteEcart = compte?.note ? `<p class="ecart">Virement permanent : voir « ${compte.note} », ajuster l'écart.</p>` : "";
      div.innerHTML = `
        <p class="qui">${p} verse</p>
        <p class="montant-gros">${euros(montant)}</p>
        <p class="cible">${ligneCompte}</p>
        ${noteEcart}
        <button class="copier" data-p="${p}" data-montant="${(montant / 100).toFixed(2)}">Copier le montant</button>
        <label class="fait"><input type="checkbox" data-p="${p}" ${virement?.fait_le ? "checked" : ""}> virement fait</label>
      `;
      bloc.append(div);
    }
    const carteReste = document.createElement("div");
    carteReste.className = "carte-verse reste";
    carteReste.innerHTML = `<p class="qui">Reste à vivre</p>` +
      etat.membres.map((m) => `<p>${m.prenom} : <strong>${euros(r.reste[m.prenom])}</strong></p>`).join("");
    bloc.append(carteReste);

    bloc.querySelectorAll(".copier").forEach((btn) => btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.montant.replace(".", ","));
        statut(`Montant de ${btn.dataset.p} copié.`);
      } catch { statut("Copie impossible (navigateur).", true); }
    }));
    bloc.querySelectorAll('.fait input[type=checkbox]').forEach((chk) => chk.addEventListener("change", async () => {
      try {
        const p = chk.dataset.p;
        const montant = -r.aVerser[p];
        const fait_le = chk.checked ? new Date().toISOString() : null;
        await api.majVirement(etat.annee, etat.mois, p, montant, fait_le);
        etat.virements[p] = { fait_le };
        statut("Enregistré.");
      } catch (e) { echec(e); }
    }));
  }

  function rendreRevenus() {
    const tbRev = $("#revenus tbody");
    tbRev.innerHTML = "";
    for (const m of etat.membres) {
      const tr = tbRev.insertRow();
      tr.insertCell().textContent = m.prenom;
      const td = tr.insertCell();
      td.className = "num";
      td.append(inputMontant(etat.revenus[m.prenom], async (v) => {
        etat.revenus[m.prenom] = v;
        await api.majRevenu(etat.annee, etat.mois, m.prenom, v);
        recalculer();
        statut("Enregistré.");
      }, echec));
    }
  }

  function pastilleRegle(c) {
    const span = document.createElement("span");
    span.className = "pastille";
    span.textContent = TYPES[c.regle];
    span.title = "Cliquer pour changer la règle";
    span.addEventListener("click", async () => {
      const ordre = ["egales", "proport", "cle", "perso"];
      const suivante = ordre[(ordre.indexOf(c.regle) + 1) % ordre.length];
      try {
        await api.majCharge(c.id, { regle: suivante });
        c.regle = suivante;
        rendreCategories();
        statut("Règle changée.");
      } catch (e) { echec(e); }
    });
    return span;
  }

  function ligneCharge(c, precedent) {
    const tr = document.createElement("tr");
    if (!c.actif) tr.className = "inactif";
    const montant = etat.lignes[c.id] ?? 0;
    const avantMontant = precedent[c.id] ?? 0;

    tr.insertCell().textContent = c.libelle;
    const tdReg = tr.insertCell();
    tdReg.append(pastilleRegle(c));
    const tdMontant = tr.insertCell();
    tdMontant.className = "num";
    tdMontant.append(inputMontant(montant, async (v) => {
      etat.lignes[c.id] = v;
      await api.majLigne(etat.annee, etat.mois, c.id, v);
      recalculer();
      statut("Enregistré.");
    }, echec));

    if (!montant && avantMontant) {
      tr.classList.add("alerte-oubli");
      const info = document.createElement("td");
      info.className = "info-alerte";
      info.textContent = `habituellement ${euros(avantMontant)}`;
      tr.append(info);
    } else if (montant && avantMontant && montant !== avantMontant) {
      const badge = document.createElement("td");
      badge.className = "badge-diff";
      badge.textContent = `≠ mois préc. : ${euros(avantMontant)}`;
      tr.append(badge);
    }
    return tr;
  }

  let precedentLignes = {};

  async function chargerPrecedent() {
    let [a, m] = [etat.annee, etat.mois - 1];
    if (m < 1) { m = 12; a--; }
    const lignes = await api.lignesMois(a, m);
    precedentLignes = Object.fromEntries(lignes.map((l) => [l.charge_id, l.montant_centimes]));
  }

  function rendreCategories() {
    const zone = $("#categories");
    zone.innerHTML = "";
    for (const cat of CATEGORIES) {
      const charges = etat.charges.filter((c) => c.categorie === cat && !c.ponctuel &&
        (c.actif || etat.lignes[c.id]));
      if (!charges.length) continue;
      const sousTotal = charges.reduce((s, c) => s + (etat.lignes[c.id] ?? 0), 0);
      const replie = localStorage.getItem(clePliage(cat)) === "1";

      const det = document.createElement("details");
      det.open = !replie;
      det.addEventListener("toggle", () => localStorage.setItem(clePliage(cat), det.open ? "0" : "1"));
      det.innerHTML = `<summary>${cat} <span class="num">${euros(sousTotal)}</span></summary>`;
      const table = document.createElement("table");
      const tbody = document.createElement("tbody");
      for (const c of charges) tbody.append(ligneCharge(c, precedentLignes));
      table.append(tbody);
      det.append(table);
      zone.append(det);
    }
  }

  function rendrePonctuels() {
    const zone = $("#ponctuels");
    zone.innerHTML = "";
    const charges = etat.charges.filter((c) => c.ponctuel && etat.lignes[c.id] !== undefined);
    if (!charges.length) { zone.innerHTML = "<p class='vide'>Aucun ponctuel ce mois.</p>"; return; }
    const table = document.createElement("table");
    const tbody = document.createElement("tbody");
    for (const c of charges) tbody.append(ligneCharge(c, {}));
    table.append(tbody);
    zone.append(table);
  }

  $("#btn-ajouter-ponctuel").addEventListener("click", async () => {
    const libelle = prompt("Libellé du ponctuel ?");
    if (!libelle) return;
    const montantStr = prompt("Montant (négatif si dépense) ?", "-100,00");
    if (montantStr === null) return;
    try {
      const montant = versCentimes(montantStr);
      const c = await api.creerCharge({ libelle: libelle.trim(), categorie: "Autre", regle: "egales", type: "egales", ponctuel: true, actif: false, ordre: 999 });
      etat.charges.push(c);
      await api.majLigne(etat.annee, etat.mois, c.id, montant);
      etat.lignes[c.id] = montant;
      rendrePonctuels();
      recalculer();
      statut("Ponctuel ajouté.");
    } catch (e) { echec(e); }
  });

  function rendreAjustements() {
    const zone = $("#ajustements");
    zone.innerHTML = "";
    if (!etat.ajustements.length) { zone.innerHTML = "<p class='vide'>Aucun ajustement ce mois.</p>"; return; }
    const table = document.createElement("table");
    const tbody = document.createElement("tbody");
    for (const a of etat.ajustements) {
      const tr = tbody.insertRow();
      tr.insertCell().textContent = `${a.de} → ${a.vers}`;
      tr.insertCell().textContent = euros(a.montant_centimes);
      tr.insertCell().textContent = a.motif ?? "";
      const btn = document.createElement("button");
      btn.textContent = "supprimer";
      btn.className = "lien";
      btn.addEventListener("click", async () => {
        try {
          await api.supprimerAjustement(a.id);
          etat.ajustements = etat.ajustements.filter((x) => x.id !== a.id);
          rendreAjustements();
          recalculer();
          statut("Ajustement supprimé.");
        } catch (e) { echec(e); }
      });
      tr.insertCell().append(btn);
    }
    table.append(tbody);
    zone.append(table);
  }

  $("#btn-ajouter-ajustement").addEventListener("click", async () => {
    const prenoms = etat.membres.map((m) => m.prenom);
    const de = prompt(`Qui donne plus ? (${prenoms.join(" / ")})`);
    if (!de || !prenoms.includes(de)) return;
    const vers = prenoms.find((p) => p !== de);
    const montantStr = prompt(`Montant transféré de ${de} vers ${vers} ?`, "50,00");
    if (montantStr === null) return;
    const motif = prompt("Motif ?") ?? "";
    try {
      const montant = versCentimes(montantStr);
      const a = await api.creerAjustement({ annee: etat.annee, mois: etat.mois, de, vers, montant_centimes: montant, motif });
      etat.ajustements.push(a);
      rendreAjustements();
      recalculer();
      statut("Ajustement ajouté.");
    } catch (e) { echec(e); }
  });

  function recalculer() {
    const r = calculer(etat.charges, etat.lignes, etat.revenus, etat.ajustements);
    $("#total").textContent = euros(r.totalCommun);
    $("#total-egales").textContent = euros(r.totaux.egales);
    $("#total-proport").textContent = euros(r.totaux.proport);
    $("#total-cle").textContent = euros(r.totaux.cle);
    rendreBlocAFaire(r);
    return r;
  }

  async function rendreTout() {
    await chargerPrecedent();
    rendreRevenus();
    rendreCategories();
    rendrePonctuels();
    rendreAjustements();
    recalculer();

    const moisVide = !Object.values(etat.lignes).some((v) => v) && !Object.values(etat.revenus).some((v) => v);
    const bandeau = $("#proposition-copie");
    if (moisVide && Object.keys(precedentLignes).length) {
      let [a, m] = [etat.annee, etat.mois - 1];
      if (m < 1) { m = 12; a--; }
      $("#proposition-texte").textContent = `Démarrer depuis ${m}/${a} ?`;
      bandeau.hidden = false;
    } else {
      bandeau.hidden = true;
    }
  }

  $("#btn-copier-depuis-precedent").addEventListener("click", async () => {
    let [a, m] = [etat.annee, etat.mois - 1];
    if (m < 1) { m = 12; a--; }
    try {
      const [lignesAv, revenusAv] = await Promise.all([api.lignesMois(a, m), api.revenusMois(a, m)]);
      const chargesNonPonctuelles = new Set(etat.charges.filter((c) => !c.ponctuel).map((c) => c.id));
      for (const l of lignesAv) {
        if (!chargesNonPonctuelles.has(l.charge_id)) continue;
        await api.majLigne(etat.annee, etat.mois, l.charge_id, l.montant_centimes);
      }
      for (const r of revenusAv) {
        await api.majRevenu(etat.annee, etat.mois, r.prenom, r.montant_centimes);
      }
      await rafraichirMois();
      statut(`Copié depuis ${m}/${a}.`);
    } catch (e) { echec(e); }
  });

  return { rendreTout, recalculer };
}
