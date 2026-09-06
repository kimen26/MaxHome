// Écran « Mouvements récurrents » : le modèle défini une fois, régénéré chaque mois.

import { euros, versCentimes } from "./calc.js";
import { $, $$, txt, ouvrirFeuille, fermerFeuille, toast } from "./ui-base.js";
import { carteListe, ligneReglage, brancherReglages, trajetComptes } from "./blocs.js";

const MODES = [["fixe", "Montant fixe"], ["charge", "Suit une charge"], ["part", "Part d’une personne"]];

export function creerUiRecurrents(api, etat, cb) {
  const trajet = (r) => trajetComptes(etat.comptes, r.compte_de, r.compte_vers);

  /** Montant : chiffre en mono pour un fixe, formule en texte courant sinon. */
  const decrireMontant = (r) => {
    if (r.mode === "fixe") return `<span class="mono">${euros(r.montant_centimes ?? 0)}</span>`;
    if (r.mode === "charge") return `charge « ${txt(etat.charges.find((c) => c.id === r.charge_id)?.libelle ?? "?")} »`;
    return `part de ${txt(r.prenom_part ?? "?")}`;
  };

  function rendre() {
    $("#liste-recurrents").innerHTML = carteListe(etat.recurrents.map((r) => ligneReglage({
      id: r.id, titre: r.titre,
      sous: `${txt(trajet(r))}${r.jour ? ` · le ${r.jour}` : ""}`,
      consigne: r.consigne, droite: `<span>${decrireMontant(r)}</span>`,
      pastille: r.qui, inactif: !r.actif,
    })), "Aucun mouvement récurrent.");

    $("#form-recurrent").innerHTML = '<button class="btn btn-tirets" id="btn-nouveau-recurrent">+ Nouveau mouvement récurrent</button>';
    $("#btn-nouveau-recurrent").addEventListener("click", () => formulaire(null));
    brancherReglages($("#liste-recurrents"),
      (id) => formulaire(etat.recurrents.find((r) => r.id === id)), retirer);
  }

  function formulaire(r) {
    const comptes = (sel) => `<option value="">—</option>` +
      etat.comptes.map((c) => `<option value="${c.id}"${c.id === sel ? " selected" : ""}>${txt(c.nom)}</option>`).join("");
    ouvrirFeuille(`<form id="form-rec" class="pile">
      <h2>${r ? "Modifier le mouvement" : "Nouveau mouvement récurrent"}</h2>
      <label>Titre <input class="champ" name="titre" required value="${txt(r?.titre ?? "")}"></label>
      <label>De <select class="champ" name="compte_de">${comptes(r?.compte_de)}</select></label>
      <label>Vers <select class="champ" name="compte_vers">${comptes(r?.compte_vers)}</select></label>
      <label>Montant <select class="champ" name="mode">
        ${MODES.map(([v, l]) => `<option value="${v}"${v === (r?.mode ?? "fixe") ? " selected" : ""}>${l}</option>`).join("")}
      </select></label>
      <label data-si="fixe">Montant fixe <input class="champ champ-montant" name="montant" inputmode="decimal"
        value="${r?.montant_centimes != null ? (r.montant_centimes / 100).toFixed(2).replace(".", ",") : ""}" placeholder="0,00"></label>
      <label data-si="charge">Charge liée <select class="champ" name="charge_id">
        <option value="">—</option>
        ${etat.charges.filter((c) => c.actif !== false).map((c) => `<option value="${c.id}"${c.id === r?.charge_id ? " selected" : ""}>${txt(c.libelle)}</option>`).join("")}
      </select></label>
      <label data-si="part">Part de <select class="champ" name="prenom_part">
        ${etat.membres.map((m) => `<option${m.prenom === r?.prenom_part ? " selected" : ""}>${txt(m.prenom)}</option>`).join("")}
      </select></label>
      <label>Qui s’en occupe <select class="champ" name="qui"><option value="">—</option>
        ${etat.membres.map((m) => `<option${m.prenom === r?.qui ? " selected" : ""}>${txt(m.prenom)}</option>`).join("")}
      </select></label>
      <label>Jour habituel <input class="champ" name="jour" type="number" min="1" max="31" value="${r?.jour ?? ""}"></label>
      <label>Consigne <textarea class="champ" name="consigne" rows="3">${txt(r?.consigne ?? "")}</textarea></label>
      <button type="submit" class="btn btn-bleu grandir">${r ? "Enregistrer" : "Ajouter"}</button>
    </form>`);

    const form = $("#form-rec");
    const majVisibilite = () => {
      const mode = form.mode.value;
      for (const l of form.querySelectorAll("[data-si]")) l.hidden = l.dataset.si !== mode;
    };
    form.mode.addEventListener("change", majVisibilite);
    majVisibilite();

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = new FormData(form);
      const mode = f.get("mode");
      const champs = {
        titre: f.get("titre").trim(),
        compte_de: f.get("compte_de") || null,
        compte_vers: f.get("compte_vers") || null,
        mode,
        montant_centimes: mode === "fixe" && f.get("montant").trim() ? versCentimes(f.get("montant")) : null,
        charge_id: mode === "charge" ? Number(f.get("charge_id")) || null : null,
        prenom_part: mode === "part" ? f.get("prenom_part") : null,
        qui: f.get("qui") || null,
        jour: f.get("jour") ? Number(f.get("jour")) : null,
        consigne: f.get("consigne").trim() || null,
      };
      try {
        if (r) {
          await api.majRecurrent(r.id, champs);
          Object.assign(r, champs);
        } else {
          etat.recurrents.push(await api.creerRecurrent({ ...champs, actif: true }));
        }
        fermerFeuille();
        rendre();
        toast("Enregistré.");
        await cb.rafraichirMois();
      } catch (e) { cb.echec(e); }
    });
  }

  async function retirer(id) {
    const r = etat.recurrents.find((x) => x.id === id);
    if (!r || !confirm(`Retirer « ${r.titre} » ? Les mouvements déjà générés restent en place.`)) return;
    try {
      // Désactivation plutôt que suppression : l'historique des mois passés reste lisible.
      await api.majRecurrent(id, { actif: false });
      r.actif = false;
      rendre();
      toast("Mouvement retiré.");
    } catch (e) { cb.echec(e); }
  }

  return { rendre };
}
