// Écran « Mois » (budget.png, D-036 §4) : fusion de l'ancien « Ce mois » et de l'ancien
// « Charges ». Bande de mois plate + titre en en-tête (index.html), puis dans l'ordre :
// salaires Y/C + clé, trois chiffres, À faire / Fait (mouvements, comportement inchangé de
// blocs-checklist), charges par catégorie en deux colonnes (déléguées à ui-mois-charges.js),
// « Ce mois seulement » (ex-ajustements), FAB « + Ajouter » qui ouvre la feuille
// « Ligne de ce mois ».

import { euros, versCentimes, montantTheorique } from "./calc.js";
import { $, $$, txt, toast, copier, montrerEcran, ouvrirFeuille, fermerFeuille, confirmer, MOIS } from "../socle/ui-base.js";
import { ligneCoche, carteListe, enteteDetail, trajetComptes } from "../socle/blocs.js";
import { creerCheckList } from "../socle/blocs-checklist.js";
import { champ, select, membresOptions, lire } from "../socle/blocs-form.js";
import { creerUiMoisCharges } from "./ui-mois-charges.js";
import { creerUiRegularisations } from "./ui-regularisations.js";

const ASIDE = "#detail-pc";
const SUGGESTIONS_AJOUT = ["Resto", "Vacances", "Cadeaux", "Santé"];

/** Occurrences du mois : une par récurrent actif, jamais purgées (un mois passé reste lisible). */
export const STRATEGIE_MOUVEMENTS = {
  existantes: (etat) => etat.mouvements,
  perimees: () => [],
  manquantes: (etat, existantes) => {
    const dejaLa = new Set(existantes.map((m) => m.recurrent_id).filter(Boolean));
    return etat.recurrents.filter((r) => r.actif && !dejaLa.has(r.id)).map((r) => ({
      annee: etat.annee, mois: etat.mois, recurrent_id: r.id, titre: r.titre,
      compte_de: r.compte_de, compte_vers: r.compte_vers,
      montant_centimes: montantTheorique(r, etat) ?? 0, qui: r.qui,
    }));
  },
  creer: (api, lignes) => api.creerMouvements(lignes),
  supprimer: async () => {},
  poser: (etat, restantes, creees) => { etat.mouvements = [...restantes, ...creees]; },
};

export function creerUiMouvements(api, etat, cb) {
  const recurrentDe = (m) => etat.recurrents.find((r) => r.id === m.recurrent_id);
  const compte = (id) => etat.comptes.find((c) => c.id === id);
  const nomCompte = (id) => compte(id)?.nom ?? null;
  const trajet = (m) => trajetComptes(etat.comptes, m.compte_de, m.compte_vers);
  const detailCompte = (id) => {
    const c = compte(id);
    return c?.iban_masque ? `····${c.iban_masque}` : (c?.titulaire ?? "");
  };
  const aFaire = () => etat.mouvements.filter((m) => !m.fait_le);
  const faits = () => etat.mouvements.filter((m) => m.fait_le);

  const cbCharges = { ...cb, rendreMois: () => rendre() };
  const charges = creerUiMoisCharges(api, etat, cbCharges);

  /** Montant affiché : figé quand le mouvement est fait, recalculé sinon. */
  const montantAffiche = (m) => {
    if (m.fait_le) return m.montant_centimes;
    const t = montantTheorique(recurrentDe(m), etat);
    return t === null ? m.montant_centimes : t;
  };

  /** Un mouvement est en alerte si son montant vient d'une charge sans montant saisi. */
  const enAlerte = (m) => {
    const r = recurrentDe(m);
    return !!r && r.mode === "charge" && !etat.lignes[r.charge_id]?.montant_centimes;
  };

  const explication = (m) => {
    const r = recurrentDe(m);
    if (!r) return "Mouvement ponctuel, montant saisi à la main.";
    if (r.mode === "fixe") return "Montant fixe défini sur le mouvement récurrent.";
    if (r.mode === "charge") {
      const c = etat.charges.find((x) => x.id === r.charge_id);
      return `Suit la charge « ${c?.libelle ?? "?"} » du mois.`;
    }
    const pct = Math.round((etat.resultat.ratio[r.prenom_part] ?? 0) * 100);
    return `Calculé : part de ${r.prenom_part} (50/50 + prorata ${pct} %) après ajustements.`;
  };

  /** Virement permanent noté sur le compte cible : « 3000 le 2 », « 3 000,00 € ». */
  function permanent(m) {
    const note = compte(m.compte_vers)?.note;
    if (!note) return 0;
    const n = String(note).replace(/\s| | /g, "").match(/(\d+(?:[.,]\d{1,2})?)/);
    if (!n) return 0;
    return Math.round(Number(n[1].replace(",", ".")) * 100);
  }

  // ---------- lignes de mouvement (À faire / Fait) ----------
  function ligneAFaire(m) {
    const r = recurrentDe(m);
    const consigne = m.consigne ?? r?.consigne ?? "";
    return ligneCoche({
      id: m.id, titre: m.titre, sous: trajet(m), prioritaire: aFaire()[0]?.id === m.id,
      alerte: enAlerte(m), // pas de pastille : le trajet dit déjà de qui part le virement (maquette)
      notes: [consigne, enAlerte(m) ? "Montant en attente : la charge liée n’a pas de montant ce mois." : null],
      droite: `<span class="mono mvt-montant">${euros(montantAffiche(m))}</span>`,
    });
  }

  function ligneFaite(m) {
    const date = new Date(m.fait_le);
    const quand = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
    return ligneCoche({
      id: m.id, titre: m.titre, cochee: true, sous: quand,
      droite: `<span class="mono mvt-montant pale">${euros(m.montant_centimes)}</span>`,
    });
  }

  // ---------- détail ----------
  function htmlDetail(m) {
    const r = recurrentDe(m);
    const somme = montantAffiche(m);
    const perm = permanent(m);
    const aCopier = perm ? somme + perm : somme; // montant négatif, permanent positif
    const consigne = m.consigne ?? r?.consigne ?? "";
    const sousTitre = r
      ? `Récurrent · chaque mois${r.qui ? ` · ${r.qui}` : ""}`
      : `Ponctuel${m.qui ? ` · ${m.qui}` : ""}`;
    return `<div class="detail" data-id="${m.id}">
      ${enteteDetail(m.titre, sousTitre)}
      <div class="detail-montant">
        <span class="mono grand">${euros(somme)}</span>
        <span class="sous">${txt(explication(m))}</span>
      </div>
      <div class="detail-trajet">
        <div class="case-compte"><span class="etiquette">De</span>
          <span class="nom">${txt(nomCompte(m.compte_de) ?? "à définir")}</span>
          <span class="sous">${txt(detailCompte(m.compte_de))}</span></div>
        <span class="fleche">→</span>
        <div class="case-compte"><span class="etiquette">Vers</span>
          <span class="nom">${txt(nomCompte(m.compte_vers) ?? "à définir")}</span>
          <span class="sous">${txt(detailCompte(m.compte_vers))}</span></div>
      </div>
      <div class="detail-consigne">
        <span class="etiquette">Consigne</span>
        <textarea class="champ" rows="3" data-consigne placeholder="Où faire le virement, quelle appli, quel libellé…">${txt(consigne)}</textarea>
      </div>
      ${perm ? `<div class="detail-permanent">
        <span>Montant déjà couvert par le permanent</span>
        <span class="mono">${euros(-perm)}</span></div>` : ""}
      <div class="detail-actions">
        <button class="btn" data-copier="${Math.abs(aCopier / 100).toFixed(2).replace(".", ",")}"
                title="Copier ${euros(aCopier)}">⧉</button>
        <button class="btn ${m.fait_le ? "" : "btn-vert"} grandir" data-basculer>
          ${m.fait_le ? "Annuler la coche" : "✓ Fait aujourd’hui"}</button>
      </div>
      ${r ? '<button class="btn-lien centre" data-vers-recurrents>Modifier le mouvement récurrent</button>' : ""}
    </div>`;
  }

  const liste = creerCheckList({
    ecran: "#ecran-mois", aside: ASIDE,
    trouver: (id) => etat.mouvements.find((m) => m.id === id),
    premier: () => aFaire()[0] ?? faits()[0],
    htmlDetail, rendre, echec: cb.echec,
    brancherDetail: (m, racine, { fermer }) => {
      racine.querySelector("[data-copier]")?.addEventListener("click", (e) => copier(e.currentTarget.dataset.copier));
      racine.querySelector("[data-vers-recurrents]")?.addEventListener("click", () => { fermer(); montrerEcran("comptes"); });
      racine.querySelector("[data-consigne]")?.addEventListener("change", async (e) => {
        const valeur = e.target.value.trim() || null;
        try {
          await api.majMouvement(m.id, { consigne: valeur });
          m.consigne = valeur;
          toast("Enregistré.");
        } catch (err) { cb.echec(err); }
      });
    },
    basculer: {
      // Le montant se fige au moment de la coche : il est lu AVANT de poser la date,
      // sinon montantAffiche() renvoie déjà la valeur figée de la ligne (L-008).
      figer: (m) => montantAffiche(m),
      appliquer: (m, fige) => {
        m.fait_le = m.fait_le ? null : new Date().toISOString();
        if (m.fait_le) m.montant_centimes = fige;
        return { fait_le: m.fait_le, montant_centimes: m.montant_centimes };
      },
      ecrire: (id, champs) => api.majMouvement(id, champs),
      message: (_m, avant) => (avant.fait_le ? "Coche annulée." : "Mouvement fait."),
    },
  });

  // ---------- revenus (salaires Y/C + clé) ----------
  function rendreSalaires() {
    const r = etat.resultat;
    const cle = etat.membres.map((m) => Math.round((r.ratio[m.prenom] ?? 0) * 100)).join(" / ");
    $("#salaires").innerHTML = `${etat.membres.map((m) => `
      <span class="salaire-champ"><span class="salaire-lettre">${txt(m.prenom[0])}</span>
        <input class="champ champ-montant pos cible44" inputmode="decimal" data-revenu="${txt(m.prenom)}"
               value="${etat.revenus[m.prenom] ? (etat.revenus[m.prenom] / 100).toFixed(2).replace(".", ",") : ""}"
               placeholder="0,00"></span>`).join("")}
      <span class="mono salaire-cle">${cle}</span>`;
    for (const el of $$("#salaires [data-revenu]")) {
      el.addEventListener("change", async () => {
        const prenom = el.dataset.revenu;
        try {
          const v = el.value.trim() ? versCentimes(el.value) : 0;
          await api.majRevenu(etat.annee, etat.mois, prenom, v);
          etat.revenus[prenom] = v;
          cb.recalculer();
          rendre();
          toast("Enregistré.");
        } catch (e) { cb.echec(e); }
      });
    }
  }

  // ---------- « Ce mois seulement » : charges ponctuelles (charges.ponctuel = true) ----------
  // Une ligne de ce mois EST une charge comme les autres pour le calcul (elle entre dans
  // totalCommun, réduit le reste de chacun) : `ponctuel` ne sert qu'à la afficher ici plutôt
  // que dans les catégories, et à ne pas lui proposer de référence d'un mois sur l'autre.
  const ponctuelles = () => etat.charges.filter((c) => c.ponctuel && c.actif !== false);

  const ligneExtra = (c) => {
    const regle = c.regle === "egales" ? "50/50" : "prorata";
    const m = etat.lignes[c.id]?.montant_centimes ?? 0;
    return `<div class="ligne" data-charge="${c.id}">
      <button type="button" class="titre" data-suppr-extra="${c.id}" title="Retirer">${txt(c.libelle)}</button>
      <span class="repere">${regle}</span>
      <span class="mono valeur">${euros(m)}</span>
    </div>`;
  };

  const regularisations = creerUiRegularisations(api, etat, cb);

  function rendreExtras() {
    const extras = ponctuelles();
    const total = extras.reduce((s, c) => s + (etat.lignes[c.id]?.montant_centimes ?? 0), 0);
    $("#ce-mois-tete-total").textContent = euros(total);
    // Charges ponctuelles puis régularisations entre nous : les deux ne valent que ce mois-ci.
    $("#ajustements").innerHTML = extras.map(ligneExtra).join("") + regularisations.html();
    regularisations.brancher($("#ajustements"), rendre);
    for (const b of $$("#ajustements [data-suppr-extra]")) {
      b.addEventListener("click", async () => {
        const id = Number(b.dataset.supprExtra);
        if (!(await confirmer("Retirer cette ligne ?", { ok: "Retirer" }))) return;
        try {
          await api.majCharge(id, { actif: false });
          etat.charges.find((c) => c.id === id).actif = false;
          delete etat.lignes[id];
          cb.recalculer();
          rendre();
          toast("Ligne retirée.");
        } catch (e) { cb.echec(e); }
      });
    }
  }

  // ---------- feuille « Ligne de ce mois » (FAB) ----------
  function formulaireLigneDuMois() {
    const mois = `${MOIS[etat.mois - 1][0].toUpperCase()}${MOIS[etat.mois - 1].slice(1)} ${etat.annee}`;
    ouvrirFeuille(`<form id="form-ligne-mois" class="pile">
      <div class="detail-tete"><h2>Ligne de ce mois</h2><span class="sous">${txt(mois)}</span></div>
      ${champ("titre", "", { requis: true, placeholder: "ex. Resto anniversaire" })}
      <div class="puces-suggestions">
        ${SUGGESTIONS_AJOUT.map((s) => `<button type="button" class="puce-suggestion cible44" data-suggestion="${txt(s)}">${txt(s)}</button>`).join("")}
      </div>
      <div class="ligne-mois-repartition">
        <label class="champ-label"><span class="etiquette">Montant</span>
          <input class="champ champ-montant" name="montant" inputmode="decimal" placeholder="0,00" required></label>
        <div><span class="etiquette">Répartition</span>
          <span class="segment large" data-regle-ajout>
            <button type="button" data-regle="proport" class="actif">Prorata</button>
            <button type="button" data-regle="egales">50/50</button>
          </span></div>
      </div>
      <button type="submit" class="btn btn-vert grandir">Ajouter au mois</button>
    </form>`);
    const form = $("#form-ligne-mois");
    for (const p of form.querySelectorAll("[data-suggestion]")) {
      p.addEventListener("click", () => { form.titre.value = p.dataset.suggestion; form.titre.focus(); });
    }
    let regleChoisie = "proport";
    for (const b of form.querySelectorAll("[data-regle-ajout] button")) {
      b.addEventListener("click", () => {
        regleChoisie = b.dataset.regle;
        for (const x of form.querySelectorAll("[data-regle-ajout] button")) x.classList.toggle("actif", x === b);
      });
    }
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const v = lire(ev.target);
        const montant = Math.abs(versCentimes(v.montant));
        // Une charge ponctuelle, active seulement, sans référence (montant_defaut) — elle ne
        // doit pas se répéter ni se préafficher un autre mois (D-036 §4).
        const charge = await api.creerCharge({
          libelle: v.titre, categorie: "Autre", regle: regleChoisie,
          ponctuel: true, actif: true, montant_defaut: null, defaut_dernier: false,
        });
        etat.charges.push(charge);
        await api.majLigne(etat.annee, etat.mois, charge.id, { montant_centimes: -montant, regle: null });
        etat.lignes[charge.id] = { montant_centimes: -montant, regle: null };
        fermerFeuille();
        cb.recalculer();
        rendre();
        toast("Ligne ajoutée au mois.");
      } catch (e) { cb.echec(e); }
    });
  }

  // ---------- mouvement ponctuel (lien discret sous « À faire ») ----------
  function formulairePonctuel() {
    ouvrirFeuille(`<form id="form-ponctuel" class="pile">
      <h2>Mouvement ce mois seulement</h2>
      ${champ("titre", "Titre", { requis: true, placeholder: "ex. Régularisation eau" })}
      ${select("qui", "Qui", membresOptions(etat), null, { vide: "—" })}
      <button type="submit" class="btn btn-bleu grandir">Ajouter</button>
    </form>`);
    $("#form-ponctuel").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const v = lire(ev.target);
        const [cree] = await api.creerMouvements([{
          annee: etat.annee, mois: etat.mois, recurrent_id: null,
          titre: v.titre, compte_de: null, compte_vers: null,
          montant_centimes: 0, qui: v.qui, consigne: null,
        }]);
        etat.mouvements.push(cree);
        fermerFeuille();
        rendre();
        toast("Mouvement ajouté.");
      } catch (e) { cb.echec(e); }
    });
  }

  // ---------- rendu ----------
  function rendre() {
    const restants = aFaire();
    const termines = faits();
    const total = etat.mouvements.length;
    const r = etat.resultat;

    const commun = etat.comptes.find((c) => c.commun);
    $("#commun-mois").textContent = commun ? `Commun · ${commun.nom}` : "";

    const nomMois = `${MOIS[etat.mois - 1][0].toUpperCase()}${MOIS[etat.mois - 1].slice(1)} ${etat.annee}`;
    $("#titre-mois").textContent = nomMois;
    $("#sous-mois").textContent = total
      ? `${termines.length}/${total} virements faits · clé ${etat.membres.map((m) => Math.round((r.ratio[m.prenom] ?? 0) * 100)).join(" / ")}`
      : "Aucun mouvement ce mois.";
    $("#total-charges-mois").textContent = euros(r.total);

    rendreSalaires();

    $("#chiffres-mois").innerHTML = `
      <div class="carte chiffre-carte"><span class="chiffre-etiquette">Total commun</span>
        <span class="mono chiffre-valeur">${euros(r.totalCommun)}</span></div>
      ${etat.membres.map((m) => `<div class="carte chiffre-carte"><span class="chiffre-etiquette">Reste ${txt(m.prenom)}</span>
        <span class="mono chiffre-valeur accent-vert">${euros(r.reste[m.prenom] ?? 0)}</span></div>`).join("")}`;

    $("#afaire-tete-total").textContent = String(restants.length);
    $("#fait-tete-total").textContent = String(termines.length);
    $("#mvts-a-faire").innerHTML = carteListe(restants.map(ligneAFaire), "Tout est fait pour ce mois.");
    $("#mvts-faits").innerHTML = carteListe(termines.map(ligneFaite), "Rien de coché pour l’instant.");
    liste.apresRendu();

    charges.rendre();
    rendreExtras();
  }

  $("#btn-mvt-ponctuel").addEventListener("click", formulairePonctuel);
  $("#fab-ajouter-mois").addEventListener("click", formulaireLigneDuMois);

  return { rendre, fermerDetail: liste.fermerDetail, fermerReglagesCharges: charges.fermerReglages,
    ouvrirReglagesCharge: charges.ouvrirReglages };
}
