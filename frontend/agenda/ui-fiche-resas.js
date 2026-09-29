// Section « Réservations » de la fiche voyage : liste chronologique, code en gros (tap =
// copié), pièces en vignette (tap = plein écran), formulaires + Réservation / + Billet-QR,
// pied avec total et part payée par chacun. Brief carnet-voyage.md §Écrans point 2.

import { $, txt, ouvrirFeuille, fermerFeuille, toast, copier, confirmer } from "../socle/ui-base.js";
import { titreSection, carteListe } from "../socle/blocs.js";
import { champ, select, zone, membresOptions, lire, enEuros } from "../socle/blocs-form.js";
import { euros, versCentimes } from "../budget/calc.js";
import { TYPES_RESA, totauxResas } from "./carnet.js";
import { ouvrirPieceEnPlein } from "./ui-piece-plein-ecran.js";

const STATUTS = [["a_reserver", "À réserver"], ["reserve", "Réservée"], ["annule", "Annulée"]];

export function creerFicheResas(api, etat, cb, { voyage, resas, pieces, rafraichir, revenirALaFiche }) {
  function piecesDe(resaId) {
    return pieces().filter((p) => p.resa_id === resaId);
  }

  function ligne(r) {
    const type = TYPES_RESA.find((t) => t.valeur === r.type) ?? TYPES_RESA.at(-1);
    // Minuit = heure inconnue (un logement saisi à la date seule) : on n'affiche pas « 00:00 ».
    const avecHeure = r.debut && !/T00:00(:00)?$/.test(r.debut);
    const quand = r.debut ? new Date(r.debut).toLocaleString("fr-FR", { day: "2-digit", month: "short", ...(avecHeure && { hour: "2-digit", minute: "2-digit" }) }) : "";
    const prix = r.prix_centimes != null ? euros(r.prix_centimes) : "";
    const annulee = r.statut === "annule";
    return `<div class="ligne-resa${annulee ? " annulee" : ""}" data-resa="${r.id}">
      <div class="lr-tete">
        <span class="lr-type">${type.emoji} ${txt(type.libelle)}</span>
        <span class="lr-titre">${txt(r.titre)}</span>
        <button type="button" class="btn-lien lr-modifier" data-modifier-resa="${r.id}">Modifier</button>
      </div>
      ${quand ? `<span class="lr-quand">${txt(quand)}</span>` : ""}
      ${r.prestataire ? `<span class="lr-prestataire">${txt(r.prestataire)}</span>` : ""}
      <div class="lr-bas">
        ${r.code ? `<button type="button" class="lr-code" data-copier-code="${txt(r.code)}">${txt(r.code)}</button>` : ""}
        <span class="lr-droite">
          ${prix ? `<span class="mono lr-prix">${txt(prix)}</span>` : ""}
          ${r.paye_par ? `<span class="lr-payeur">payé par ${txt(r.paye_par)}</span>` : r.statut !== "annule" && r.prix_centimes ? `<span class="lr-payeur alerte">non payé</span>` : ""}
        </span>
      </div>
      ${annulee ? `<span class="lr-annulee-badge">Annulée</span>` : ""}
      ${piecesDe(r.id).length ? `<div class="lr-pieces">${piecesDe(r.id).map(vignette).join("")}</div>` : ""}
    </div>`;
  }

  function vignette(p) {
    const estImage = (p.type_mime ?? "").startsWith("image/");
    return `<button type="button" class="piece-vignette" data-ouvrir-piece="${p.id}" aria-label="Ouvrir ${txt(p.nom)}">
      ${estImage ? `<span class="piece-icone" aria-hidden="true">🖼️</span>` : `<span class="piece-icone" aria-hidden="true">📄</span>`}
      <span class="piece-nom">${txt(p.nom)}</span>
    </button>`;
  }

  // Carte lisible plutôt qu'une ligne condensée « Total … / Yann … / 240,00 € non payé »
  // (relecture §G) : une ligne par personne, montant aligné à droite, « Pas encore payé » en
  // toutes lettres — jamais une variante abrégée qui ne se comprend qu'en la relisant deux fois.
  function pied() {
    const t = totauxResas(resas(), etat.membres);
    const parPersonne = Object.entries(t.parPrenom).filter(([, m]) => m > 0);
    return `<div class="lr-pied">
      <div class="lr-pied-ligne lr-pied-total"><span>Total</span><span class="mono">${txt(euros(t.total))}</span></div>
      ${parPersonne.map(([p, m]) => `<div class="lr-pied-ligne"><span>${txt(p)}</span><span class="mono">${txt(euros(m))}</span></div>`).join("")}
      ${t.nonPaye ? `<div class="lr-pied-ligne lr-pied-alerte"><span>Pas encore payé</span><span class="mono">${txt(euros(t.nonPaye))}</span></div>` : ""}
    </div>`;
  }

  function html() {
    const tries = [...resas()].sort((a, b) => (a.debut ?? "").localeCompare(b.debut ?? ""));
    return `<div class="fiche-resas">
      ${titreSection("Réservations")}
      ${carteListe(tries.map(ligne), "Aucune réservation pour l'instant.")}
      ${tries.length ? pied() : ""}
      <div class="lr-actions">
        <button type="button" class="btn btn-tirets" data-nouvelle-resa>+ Réservation</button>
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
    racine.querySelector("[data-nouvelle-resa]").addEventListener("click", () => formulaireResa(null));
    racine.querySelector("[data-nouvelle-piece]").addEventListener("click", () => formulairePiece(null));
  }

  async function ouvrirPiece(pieceId) {
    const piece = pieces().find((p) => p.id === pieceId);
    if (!piece) return;
    try { await ouvrirPieceEnPlein(api, piece); } catch (e) { cb.echec(e); }
  }

  // ---------- formulaire réservation ----------
  function formulaireResa(r) {
    ouvrirFeuille(`<form class="pile" data-form-resa>
      <h2>${r ? "Modifier la réservation" : "Nouvelle réservation"}</h2>
      ${select("type", "Type", TYPES_RESA.map((t) => [t.valeur, `${t.emoji} ${t.libelle}`]), r?.type ?? "vol")}
      ${champ("titre", "Titre", { valeur: r?.titre, requis: true, placeholder: "ex. Vol aller Paris → Malaga" })}
      ${champ("debut", "Début", { type: "datetime-local", valeur: r?.debut?.slice(0, 16) })}
      ${champ("fin", "Fin", { type: "datetime-local", valeur: r?.fin?.slice(0, 16) })}
      ${champ("prestataire", "Prestataire", { valeur: r?.prestataire, placeholder: "ex. Vueling" })}
      ${champ("code", "Code de réservation", { valeur: r?.code, placeholder: "ex. AB12CD" })}
      ${champ("prix", "Prix (€)", { valeur: r?.prix_centimes != null ? enEuros(r.prix_centimes) : "", placeholder: "0,00" })}
      ${select("paye_par", "Payé par", membresOptions(etat), r?.paye_par, { vide: "Pas encore payé" })}
      ${select("statut", "Statut", STATUTS, r?.statut ?? "reserve")}
      ${zone("note", "Note", r?.note, { lignes: 2 })}
      <div class="detail-actions">
        ${r ? `<button type="button" class="btn-lien" data-retirer-resa>Retirer</button>` : ""}
        <button type="submit" class="btn btn-bleu grandir">${r ? "Enregistrer" : "Ajouter"}</button>
      </div>
    </form>`, { onFermer: revenirALaFiche });
    const form = $("#feuille-corps [data-form-resa]");
    form.querySelector("[data-retirer-resa]")?.addEventListener("click", () => retirerResa(r));
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const v = lire(form);
      if (!v.titre) { toast("Le titre est obligatoire."); return; }
      let prix_centimes = null;
      if (v.prix) {
        try { prix_centimes = Math.abs(versCentimes(v.prix)); }
        catch { toast(`Prix illisible : « ${v.prix} ».`); return; }
      }
      const champs = {
        type: v.type, titre: v.titre, debut: v.debut || null, fin: v.fin || null,
        prestataire: v.prestataire, code: v.code, prix_centimes, paye_par: v.paye_par,
        statut: v.statut, note: v.note,
      };
      try {
        if (r) await api.majResa(r.id, champs);
        else await api.creerResa({ ...champs, voyage_id: voyage().id, cree_par: etat.prenom });
        fermerFeuille(); // déclenche onFermer -> revenirALaFiche (rafraîchit + scroll Réservations)
        toast(r ? "Réservation enregistrée." : "Réservation ajoutée.");
      } catch (e) { cb.echec(e); }
    });
  }

  async function retirerResa(r) {
    if (!(await confirmer(`Retirer la réservation « ${r.titre} » ?`, { ok: "Retirer" }))) return;
    try {
      await api.supprimerResa(r.id);
      fermerFeuille(); // déclenche onFermer -> revenirALaFiche
      toast("Réservation retirée.");
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
