// Section « Réservations & dépenses » de la fiche voyage (D-047 §V2) : une résa EST une ligne
// de dépense — case à cocher 48 px (a_reserver ↔ reserve, cocherResa, écriture immédiate,
// rollback + toast si échec), titre, prix, payé par, un détail (date-heure sans 00:00,
// prestataire), code gros copiable, pièces en vignette. Groupées par poste ; annulées repliées
// en bas. « + Dépense » (formulaire résa + poste + type repas), « + Billet / QR ».

import { $, txt, ouvrirFeuille, fermerFeuille, toast, copier, confirmer } from "../socle/ui-base.js";
import { titreSection, caseACocher } from "../socle/blocs.js";
import { champ, select, zone, membresOptions, lire, enEuros } from "../socle/blocs-form.js";
import { euros, versCentimes } from "../budget/calc.js";
import { TYPES_RESA, POSTES, posteDe, COMPTE_COMMUN } from "./carnet.js";
import { ouvrirPieceEnPlein } from "./ui-piece-plein-ecran.js";

export function creerFicheResas(api, etat, cb, { voyage, resas, pieces, lieux, rafraichir, revenirALaFiche }) {
  let annuleesDepliees = false;

  function piecesDe(resaId) {
    return pieces().filter((p) => p.resa_id === resaId);
  }

  /** Lieux non écartés triés par nom, pour le select « Lieu » du formulaire dépense. */
  function lieuxOptions() {
    return [...lieux()].filter((l) => l.statut !== "ecarte").sort((a, b) => a.nom.localeCompare(b.nom, "fr")).map((l) => [l.id, l.nom]);
  }

  function ligne(r) {
    const type = TYPES_RESA.find((t) => t.valeur === r.type) ?? TYPES_RESA.at(-1);
    const avecHeure = r.debut && !/T00:00(:00)?$/.test(r.debut);
    const quand = r.debut ? new Date(r.debut).toLocaleString("fr-FR", { day: "2-digit", month: "short", ...(avecHeure && { hour: "2-digit", minute: "2-digit" }) }) : "";
    const detail = [quand, r.prestataire].filter(Boolean).join(" · ");
    const prix = r.prix_centimes != null ? euros(r.prix_centimes) : "";
    const annulee = r.statut === "annule";
    return `<div class="ligne-resa${annulee ? " annulee" : ""}" data-resa="${r.id}">
      ${annulee ? "" : caseACocher({ id: r.id, cochee: r.statut === "reserve", titre: r.titre, attr: "cocher-resa" })}
      <div class="lr-corps">
        <div class="lr-tete">
          <span class="lr-type">${type.emoji} ${txt(type.libelle)}</span>
          <span class="lr-titre">${txt(r.titre)}</span>
          <button type="button" class="btn-lien lr-modifier" data-modifier-resa="${r.id}">Modifier</button>
        </div>
        ${detail ? `<span class="lr-detail">${txt(detail)}</span>` : ""}
        <div class="lr-bas">
          ${r.code ? `<button type="button" class="lr-code" data-copier-code="${txt(r.code)}">${txt(r.code)}</button>` : ""}
          <span class="lr-droite">
            ${prix ? `<span class="mono lr-prix">${txt(prix)}</span>` : ""}
            ${libellePayeur(r, annulee)}
          </span>
        </div>
        ${annulee ? `<span class="lr-annulee-badge">Annulée</span>` : ""}
        ${piecesDe(r.id).length ? `<div class="lr-pieces">${piecesDe(r.id).map(vignette).join("")}</div>` : ""}
      </div>
    </div>`;
  }

  /** État du paiement (relecture point 6) : « payé par X » si on sait qui ; coché SANS payeur
   *  (contradictoire de dire « non payé » alors que la case dit « fait ») → « payé par ? » en
   *  ambre, une vraie question à trancher ; non coché avec un prix → « à régler », jamais « non
   *  payé » qui laissait croire qu'on l'avait déjà réglé sans le noter. Rien si pas de prix ou
   *  résa annulée. */
  function libellePayeur(r, annulee) {
    if (r.paye_par) return `<span class="lr-payeur">payé par ${txt(r.paye_par)}</span>`;
    if (!r.prix_centimes || annulee) return "";
    if (r.statut === "reserve") return `<span class="lr-payeur alerte">payé par ?</span>`;
    return `<span class="lr-payeur alerte">à régler</span>`;
  }

  function vignette(p) {
    const estImage = (p.type_mime ?? "").startsWith("image/");
    return `<button type="button" class="piece-vignette" data-ouvrir-piece="${p.id}" aria-label="Ouvrir ${txt(p.nom)}">
      ${estImage ? `<span class="piece-icone" aria-hidden="true">🖼️</span>` : `<span class="piece-icone" aria-hidden="true">📄</span>`}
      <span class="piece-nom">${txt(p.nom)}</span>
    </button>`;
  }

  function groupePoste(poste, lignesGroupe) {
    if (!lignesGroupe.length) return "";
    const p = POSTES.find((x) => x.valeur === poste) ?? POSTES.at(-1);
    return `<div class="resas-groupe">
      <h4 class="resas-groupe-titre">${p.emoji} ${txt(p.libelle)}</h4>
      ${lignesGroupe.map(ligne).join("")}
    </div>`;
  }

  function html() {
    const actives = resas().filter((r) => r.statut !== "annule").sort((a, b) => (a.debut ?? "").localeCompare(b.debut ?? ""));
    const annulees = resas().filter((r) => r.statut === "annule");
    const parPoste = POSTES.map((p) => groupePoste(p.valeur, actives.filter((r) => posteDe(r) === p.valeur))).filter(Boolean);
    return `<div class="fiche-resas">
      ${titreSection("Réservations & dépenses")}
      ${parPoste.length ? parPoste.join("") : `<p class="vide">Aucune dépense pour l'instant.</p>`}
      ${annulees.length ? `<div class="resas-annulees">
        <button type="button" class="ct-entete" data-plier-annulees aria-expanded="${annuleesDepliees}">
          <span>Annulées (${annulees.length})</span><span class="ct-voir">${annuleesDepliees ? "Replier" : "Voir"}</span>
        </button>
        <div${annuleesDepliees ? "" : " hidden"}>${annulees.map(ligne).join("")}</div>
      </div>` : ""}
      <div class="lr-actions">
        <button type="button" class="btn btn-tirets" data-nouvelle-resa>+ Dépense</button>
        <button type="button" class="btn btn-tirets" data-nouvelle-piece>+ Billet / QR</button>
      </div>
    </div>`;
  }

  function rendre() {
    $("#fiche-resas-corps").innerHTML = html();
    brancher();
  }

  function brancher() {
    const racine = $("#fiche-resas-corps");
    for (const b of racine.querySelectorAll("[data-copier-code]")) {
      b.addEventListener("click", () => copier(b.dataset.copierCode));
    }
    for (const b of racine.querySelectorAll("[data-ouvrir-piece]")) {
      b.addEventListener("click", () => ouvrirPiece(Number(b.dataset.ouvrirPiece)));
    }
    for (const b of racine.querySelectorAll("[data-modifier-resa]")) {
      b.addEventListener("click", () => formulaireResa(resas().find((r) => r.id === Number(b.dataset.modifierResa))));
    }
    for (const el of racine.querySelectorAll("[data-cocher-resa]")) {
      const agir = () => basculerCoche(Number(el.dataset.cocherResa));
      el.addEventListener("click", agir);
      el.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); agir(); } });
    }
    racine.querySelector("[data-nouvelle-resa]").addEventListener("click", () => formulaireResa(null));
    racine.querySelector("[data-nouvelle-piece]").addEventListener("click", () => formulairePiece(null));
    racine.querySelector("[data-plier-annulees]")?.addEventListener("click", () => { annuleesDepliees = !annuleesDepliees; rendre(); });
  }

  /** Case = statut a_reserver ↔ reserve (D-047), un tap, écriture immédiate. Optimiste avec
   *  rollback + toast si l'écriture échoue (brief lot F point 4). */
  async function basculerCoche(id) {
    const r = resas().find((x) => x.id === id);
    if (!r) return;
    const avant = r.statut;
    r.statut = avant === "reserve" ? "a_reserver" : "reserve";
    rendre();
    try {
      await api.cocherResa(id, r.statut === "reserve");
      toast(r.statut === "reserve" ? `${r.titre} : fait.` : `${r.titre} : à réserver.`);
    } catch (e) {
      r.statut = avant;
      rendre();
      cb.echec(e);
      return;
    }
    if (await promouvoirLieu(r.lieu_id, r.statut)) await rafraichir();
  }

  /** Un lieu dont la résa liée est faite n'est plus une idée : il passe « prévu », sinon sa fiche
   *  montrait « ✓ Réservé » et « Idée » côte à côte. Vrai si le lieu a changé. */
  async function promouvoirLieu(lieuId, statutResa) {
    const lieu = lieuId != null && statutResa === "reserve" ? lieux().find((l) => l.id === lieuId) : null;
    if (lieu?.statut !== "idee") return false;
    try {
      await api.majLieu(lieu.id, { statut: "prevu" });
      return true;
    } catch (e) {
      cb.echec(e);
      return false;
    }
  }

  async function ouvrirPiece(pieceId) {
    const piece = pieces().find((p) => p.id === pieceId);
    if (!piece) return;
    try { await ouvrirPieceEnPlein(api, piece); } catch (e) { cb.echec(e); }
  }

  // ---------- formulaire réservation / dépense ----------
  function formulaireResa(r) {
    ouvrirFeuille(`<form class="pile" data-form-resa>
      <h2>${r ? "Modifier la dépense" : "Nouvelle dépense"}</h2>
      ${select("type", "Type", TYPES_RESA.map((t) => [t.valeur, `${t.emoji} ${t.libelle}`]), r?.type ?? "vol")}
      ${select("poste", "Poste", POSTES.map((p) => [p.valeur, `${p.emoji} ${p.libelle}`]), r?.poste ?? "", { vide: "Déduit du type" })}
      ${champ("titre", "Titre", { valeur: r?.titre, requis: true, placeholder: "ex. Vol aller Paris → Malaga" })}
      ${champ("debut", "Début (optionnel)", { type: "datetime-local", valeur: r?.debut?.slice(0, 16) })}
      ${champ("fin", "Fin (optionnel)", { type: "datetime-local", valeur: r?.fin?.slice(0, 16) })}
      ${champ("prestataire", "Prestataire", { valeur: r?.prestataire, placeholder: "ex. Vueling" })}
      ${champ("code", "Code de réservation", { valeur: r?.code, placeholder: "ex. AB12CD" })}
      ${champ("prix", "Prix (€)", { valeur: r?.prix_centimes != null ? enEuros(r.prix_centimes) : "", placeholder: "0,00" })}
      ${select("paye_par", "Payé par", [...membresOptions(etat), [COMPTE_COMMUN, COMPTE_COMMUN]], r?.paye_par, { vide: "Pas encore payé" })}
      ${select("lieu_id", "Lieu", lieuxOptions(), r?.lieu_id, { vide: "Aucun lieu" })}
      ${zone("note", "Note", r?.note, { lignes: 2 })}
      <div class="detail-actions">
        ${r ? `<button type="button" class="btn-lien" data-retirer-resa>Retirer</button>` : ""}
        ${r && r.statut !== "annule" ? `<button type="button" class="btn-lien" data-annuler-resa>Annuler la dépense</button>` : ""}
        <button type="submit" class="btn btn-bleu grandir">${r ? "Enregistrer" : "Ajouter"}</button>
      </div>
    </form>`, { onFermer: revenirALaFiche });
    const form = $("#feuille-corps [data-form-resa]");
    form.querySelector("[data-retirer-resa]")?.addEventListener("click", () => retirerResa(r));
    form.querySelector("[data-annuler-resa]")?.addEventListener("click", () => annulerResa(r));
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const v = lire(form, { nombres: ["lieu_id"] });
      if (!v.titre) { toast("Le titre est obligatoire."); return; }
      let prix_centimes = null;
      if (v.prix) {
        try { prix_centimes = Math.abs(versCentimes(v.prix)); }
        catch { toast(`Prix illisible : « ${v.prix} ».`); return; }
      }
      const champs = {
        type: v.type, poste: v.poste || null, titre: v.titre, debut: v.debut || null, fin: v.fin || null,
        prestataire: v.prestataire, code: v.code, prix_centimes, paye_par: v.paye_par, lieu_id: v.lieu_id, note: v.note,
      };
      try {
        if (r) await api.majResa(r.id, champs);
        else await api.creerResa({ ...champs, voyage_id: voyage().id, statut: "a_reserver", cree_par: etat.prenom });
        await promouvoirLieu(champs.lieu_id, r?.statut);
        fermerFeuille(); // déclenche onFermer -> revenirALaFiche (rafraîchit + scroll Réservations)
        toast(r ? "Dépense enregistrée." : "Dépense ajoutée.");
      } catch (e) { cb.echec(e); }
    });
  }

  async function retirerResa(r) {
    if (!(await confirmer(`Retirer « ${r.titre} » ?`, { ok: "Retirer" }))) return;
    try {
      await api.supprimerResa(r.id);
      fermerFeuille(); // déclenche onFermer -> revenirALaFiche
      toast("Dépense retirée.");
    } catch (e) { cb.echec(e); }
  }

  async function annulerResa(r) {
    if (!(await confirmer(`Annuler « ${r.titre} » ? Elle reste visible, repliée avec les autres annulées.`, { ok: "Annuler la dépense" }))) return;
    try {
      await api.majResa(r.id, { statut: "annule" });
      fermerFeuille(); // déclenche onFermer -> revenirALaFiche
      toast("Dépense annulée.");
    } catch (e) { cb.echec(e); }
  }

  // ---------- formulaire billet / QR ----------
  function formulairePiece(resaId = null) {
    const optionsResas = resas().filter((r) => r.statut !== "annule").map((r) => [r.id, r.titre]);
    ouvrirFeuille(`<form class="pile" data-form-piece>
      <h2>Billet / QR</h2>
      <label>Fichier <input class="champ" type="file" name="fichier" accept="image/*,application/pdf" required></label>
      ${select("resa_id", "Rattaché à", optionsResas, resaId ?? "", { vide: "Le voyage entier" })}
      <button type="submit" class="btn btn-bleu grandir">Ajouter</button>
    </form>`, { onFermer: revenirALaFiche });
    const form = $("#feuille-corps [data-form-piece]");
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fichier = form.elements.fichier.files[0];
      if (!fichier) { toast("Choisis un fichier."); return; }
      const resaId = form.elements.resa_id.value ? Number(form.elements.resa_id.value) : null;
      try {
        await api.deposerPiece(voyage().id, fichier, resaId);
        fermerFeuille(); // déclenche onFermer -> revenirALaFiche
        toast("Pièce ajoutée.");
      } catch (e) { cb.echec(e); }
    });
  }

  return { rendre };
}
