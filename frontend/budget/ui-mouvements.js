// Écran « Ce mois » : mouvements à faire / faits, détail et coche.
// Le comportement (coche, panneau, rollback) vient de blocs-checklist ; ici, le HTML et les règles.

import { euros, versCentimes, montantTheorique } from "./calc.js";
import { $, txt, toast, copier, montrerEcran, ouvrirFeuille, fermerFeuille, MOIS } from "../socle/ui-base.js";
import { ligneCoche, carteListe, chiffres, enteteDetail, trajetComptes } from "../socle/blocs.js";
import { creerCheckList } from "../socle/blocs-checklist.js";
import { champ, montant, zone, select, comptesOptions, membresOptions, lire } from "../socle/blocs-form.js";

const ASIDE = "#detail-pc";

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

  // ---------- lignes ----------
  function ligneAFaire(m) {
    const r = recurrentDe(m);
    const consigne = m.consigne ?? r?.consigne ?? "";
    return ligneCoche({
      id: m.id, titre: m.titre, sous: trajet(m), prioritaire: aFaire()[0]?.id === m.id,
      alerte: enAlerte(m), pastille: m.qui,
      notes: [consigne, enAlerte(m) ? "Montant en attente : la charge liée n’a pas de montant ce mois." : null],
      droite: `<span class="mono mvt-montant">${euros(montantAffiche(m))}</span>`,
    });
  }

  function ligneFaite(m) {
    const date = new Date(m.fait_le);
    const quand = `${date.getDate()} ${MOIS[date.getMonth()].slice(0, 4)}.`;
    return ligneCoche({
      id: m.id, titre: m.titre, cochee: true, sous: `${trajet(m)} · fait le ${quand}`,
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
      racine.querySelector("[data-vers-recurrents]")?.addEventListener("click", () => { fermer(); montrerEcran("recurrents"); });
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

  // ---------- mouvement ponctuel ----------
  function formulairePonctuel() {
    ouvrirFeuille(`<form id="form-ponctuel" class="pile">
      <h2>Mouvement ce mois seulement</h2>
      ${champ("titre", "Titre", { requis: true, placeholder: "ex. Régularisation eau" })}
      ${select("compte_de", "De", comptesOptions(etat), null, { vide: "—" })}
      ${select("compte_vers", "Vers", comptesOptions(etat), null, { vide: "—" })}
      ${montant("montant", "Montant", null, { requis: true })}
      ${select("qui", "Qui", membresOptions(etat), null, { vide: "—" })}
      ${zone("consigne", "Consigne")}
      <button type="submit" class="btn btn-bleu grandir">Ajouter</button>
    </form>`);
    $("#form-ponctuel").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const v = lire(ev.target, { nombres: ["compte_de", "compte_vers"] });
        const [cree] = await api.creerMouvements([{
          annee: etat.annee, mois: etat.mois, recurrent_id: null,
          titre: v.titre, compte_de: v.compte_de, compte_vers: v.compte_vers,
          montant_centimes: versCentimes(v.montant), qui: v.qui, consigne: v.consigne,
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
    const resteAVirer = restants.reduce((s, m) => s + montantAffiche(m), 0);

    $("#titre-mois").textContent = `${MOIS[etat.mois - 1][0].toUpperCase()}${MOIS[etat.mois - 1].slice(1)} ${etat.annee}`;
    $("#sous-mois").textContent = total
      ? `${termines.length} mouvement${termines.length > 1 ? "s" : ""} sur ${total} fait${termines.length > 1 ? "s" : ""}`
      : "Aucun mouvement ce mois — définis-en dans Récurrents.";
    $("#jauge-mois").style.width = total ? `${Math.round((termines.length / total) * 100)}%` : "0%";

    const r = etat.resultat;
    $("#chiffres-mois").innerHTML = chiffres([
      { etiquette: "Reste à virer", valeur: euros(resteAVirer), accent: true },
      { etiquette: "Total commun", valeur: euros(r.totalCommun) },
      ...etat.membres.map((m) => ({ etiquette: `Reste ${m.prenom}`, valeur: euros(r.reste[m.prenom] ?? 0) })),
    ]);
    $("#mvts-a-faire").innerHTML = carteListe(restants.map(ligneAFaire), "Tout est fait pour ce mois.");
    $("#mvts-faits").innerHTML = carteListe(termines.map(ligneFaite), "Rien de coché pour l’instant.");
    liste.apresRendu();
  }

  $("#btn-mvt-ponctuel").addEventListener("click", formulairePonctuel);

  return { rendre, fermerDetail: liste.fermerDetail };
}
