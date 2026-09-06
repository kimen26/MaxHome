// Écran « Ce mois » : liste des mouvements à faire / faits, détail et coche.
// Les occurrences du mois sont générées à l'ouverture depuis les récurrents actifs.

import { euros } from "./calc.js";
import { $, txt, estPC, ouvrirFeuille, fermerFeuille, feuilleOuverte, toast, copier, montrerEcran, MOIS } from "./ui-base.js";
import { ligneCoche, carteListe, chiffres, brancherCoches, marquerChoisi,
  enteteDetail, ouvrirPanneau, fermerPanneau, trajetComptes } from "./blocs.js";

/** Montant théorique d'un mouvement selon le mode de son récurrent.
 *  `null` seulement s'il n'y a pas de récurrent (mouvement ponctuel) ; un mode inconnu
 *  est une donnée corrompue et lève, comme côté bot (scripts/bot/mouvements.py). */
export function montantTheorique(recurrent, contexte) {
  if (!recurrent) return null;
  if (recurrent.mode === "fixe") return recurrent.montant_centimes ?? 0;
  if (recurrent.mode === "charge") return contexte.lignes[recurrent.charge_id]?.montant_centimes ?? 0;
  if (recurrent.mode === "part") return -(contexte.resultat.aVerser[recurrent.prenom_part] ?? 0);
  throw new Error(`mode de mouvement récurrent inconnu : ${recurrent.mode}`);
}

const ASIDE = "#detail-pc";

export function creerUiMouvements(api, etat, cb) {
  // Mouvement dont le détail va être réaffiché juste après un rendu : évite d'ouvrir le premier par défaut.
  let detailEnCours = null;
  const recurrentDe = (m) => etat.recurrents.find((r) => r.id === m.recurrent_id);
  const compte = (id) => etat.comptes.find((c) => c.id === id);
  const nomCompte = (id) => compte(id)?.nom ?? null;
  const trajet = (m) => trajetComptes(etat.comptes, m.compte_de, m.compte_vers);
  const detailCompte = (id) => {
    const c = compte(id);
    return c?.iban_masque ? `····${c.iban_masque}` : (c?.titulaire ?? "");
  };

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
    const n = String(note).replace(/\s| | /g, "").match(/(\d+(?:[.,]\d{1,2})?)/);
    if (!n) return 0;
    return Math.round(Number(n[1].replace(",", ".")) * 100);
  }

  // ---------- génération des occurrences ----------
  async function genererOccurrences() {
    const dejaLa = new Set(etat.mouvements.map((m) => m.recurrent_id).filter(Boolean));
    const manquants = etat.recurrents.filter((r) => r.actif && !dejaLa.has(r.id));
    if (!manquants.length) return;
    const nouveaux = manquants.map((r) => ({
      annee: etat.annee, mois: etat.mois, recurrent_id: r.id, titre: r.titre,
      compte_de: r.compte_de, compte_vers: r.compte_vers,
      montant_centimes: montantTheorique(r, etat) ?? 0, qui: r.qui,
    }));
    const crees = await api.creerMouvements(nouveaux);
    etat.mouvements.push(...crees);
  }

  // ---------- rendu d'une ligne ----------
  function ligneAFaire(m) {
    const r = recurrentDe(m);
    const consigne = m.consigne ?? r?.consigne ?? "";
    const prioritaire = etat.mouvements.filter((x) => !x.fait_le)[0]?.id === m.id;
    return ligneCoche({
      id: m.id, titre: m.titre, sous: trajet(m), prioritaire, alerte: enAlerte(m), pastille: m.qui,
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
    const montant = montantAffiche(m);
    const perm = permanent(m);
    const aCopier = perm ? montant + perm : montant; // montant négatif, permanent positif
    const consigne = m.consigne ?? r?.consigne ?? "";
    const sousTitre = r
      ? `Récurrent · chaque mois${r.qui ? ` · ${r.qui}` : ""}`
      : `Ponctuel${m.qui ? ` · ${m.qui}` : ""}`;
    return `<div class="detail" data-id="${m.id}">
      ${enteteDetail(m.titre, sousTitre)}
      <div class="detail-montant">
        <span class="mono grand">${euros(montant)}</span>
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
        <button class="btn ${m.fait_le ? "" : "btn-vert"} grandir" data-basculer="${m.id}">
          ${m.fait_le ? "Annuler la coche" : "✓ Fait aujourd’hui"}</button>
      </div>
      ${r ? '<button class="btn-lien centre" data-vers-recurrents>Modifier le mouvement récurrent</button>' : ""}
    </div>`;
  }

  function ouvrirDetail(id) {
    const m = etat.mouvements.find((x) => x.id === id);
    if (!m) return;
    brancherDetail(m, ouvrirPanneau(ASIDE, htmlDetail(m)));
  }

  const fermerDetail = () => fermerPanneau(ASIDE);

  function brancherDetail(m, racine) {
    racine.querySelector("[data-fermer-detail]")?.addEventListener("click", fermerDetail);
    racine.querySelector("[data-copier]")?.addEventListener("click", (e) => copier(e.currentTarget.dataset.copier));
    racine.querySelector("[data-basculer]")?.addEventListener("click", () => basculer(m.id));
    racine.querySelector("[data-vers-recurrents]")?.addEventListener("click", () => { fermerDetail(); montrerEcran("recurrents"); });
    racine.querySelector("[data-consigne]")?.addEventListener("change", async (e) => {
      const valeur = e.target.value.trim() || null;
      try {
        await api.majMouvement(m.id, { consigne: valeur });
        m.consigne = valeur;
        toast("Enregistré.");
      } catch (err) { cb.echec(err); }
    });
  }

  // ---------- coche ----------
  async function basculer(id) {
    const m = etat.mouvements.find((x) => x.id === id);
    if (!m) return;
    const avant = { fait_le: m.fait_le, montant_centimes: m.montant_centimes };
    // Optimiste. Le montant se fige au moment de la coche : il est lu AVANT de poser
    // la date, sinon montantAffiche() renvoie déjà la valeur figée de la ligne.
    const fige = montantAffiche(m);
    m.fait_le = m.fait_le ? null : new Date().toISOString();
    if (m.fait_le) m.montant_centimes = fige;
    // Sur mobile la feuille se referme ; sur PC le panneau reste sur le mouvement basculé.
    if (feuilleOuverte()) fermerFeuille();
    detailEnCours = estPC() ? id : null;
    rendre();
    if (estPC()) ouvrirDetail(id);
    detailEnCours = null;
    try {
      await api.majMouvement(id, { fait_le: m.fait_le, montant_centimes: m.montant_centimes });
      toast(avant.fait_le ? "Coche annulée." : "Mouvement fait.");
    } catch (e) {
      Object.assign(m, avant);
      rendre();
      cb.echec(e);
    }
  }

  // ---------- mouvement ponctuel ----------
  function formulairePonctuel() {
    const options = (sel) => etat.comptes.map((c) => `<option value="${c.id}">${txt(c.nom)}</option>`).join("");
    ouvrirFeuille(`<form id="form-ponctuel" class="pile">
      <h2>Mouvement ce mois seulement</h2>
      <label>Titre <input class="champ" name="titre" required placeholder="ex. Régularisation eau"></label>
      <label>De <select class="champ" name="compte_de"><option value="">—</option>${options()}</select></label>
      <label>Vers <select class="champ" name="compte_vers"><option value="">—</option>${options()}</select></label>
      <label>Montant <input class="champ champ-montant" name="montant" inputmode="decimal" required placeholder="0,00"></label>
      <label>Qui <select class="champ" name="qui"><option value="">—</option>
        ${etat.membres.map((x) => `<option>${txt(x.prenom)}</option>`).join("")}</select></label>
      <label>Consigne <textarea class="champ" name="consigne" rows="2"></textarea></label>
      <button type="submit" class="btn btn-bleu grandir">Ajouter</button>
    </form>`);
    $("#form-ponctuel").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      try {
        const { versCentimes } = await import("./calc.js");
        const [cree] = await api.creerMouvements([{
          annee: etat.annee, mois: etat.mois, recurrent_id: null,
          titre: f.get("titre").trim(),
          compte_de: f.get("compte_de") || null, compte_vers: f.get("compte_vers") || null,
          montant_centimes: versCentimes(f.get("montant")),
          qui: f.get("qui") || null, consigne: f.get("consigne").trim() || null,
        }]);
        etat.mouvements.push(cree);
        fermerFeuille();
        rendre();
        toast("Mouvement ajouté.");
      } catch (e) { cb.echec(e); }
    });
  }

  // ---------- rendu de l'écran ----------
  function rendre() {
    const aFaire = etat.mouvements.filter((m) => !m.fait_le);
    const faits = etat.mouvements.filter((m) => m.fait_le);
    const total = etat.mouvements.length;
    const resteAVirer = aFaire.reduce((s, m) => s + montantAffiche(m), 0);

    $("#titre-mois").textContent = `${MOIS[etat.mois - 1][0].toUpperCase()}${MOIS[etat.mois - 1].slice(1)} ${etat.annee}`;
    $("#sous-mois").textContent = total
      ? `${faits.length} mouvement${faits.length > 1 ? "s" : ""} sur ${total} fait${faits.length > 1 ? "s" : ""}`
      : "Aucun mouvement ce mois — définis-en dans Récurrents.";
    $("#jauge-mois").style.width = total ? `${Math.round((faits.length / total) * 100)}%` : "0%";

    const r = etat.resultat;
    $("#chiffres-mois").innerHTML = chiffres([
      { etiquette: "Reste à virer", valeur: euros(resteAVirer), accent: true },
      { etiquette: "Total commun", valeur: euros(r.totalCommun) },
      ...etat.membres.map((m) => ({ etiquette: `Reste ${m.prenom}`, valeur: euros(r.reste[m.prenom] ?? 0) })),
    ]);

    $("#mvts-a-faire").innerHTML = carteListe(aFaire.map(ligneAFaire), "Tout est fait pour ce mois.");
    $("#mvts-faits").innerHTML = carteListe(faits.map(ligneFaite), "Rien de coché pour l’instant.");
    brancherCoches($("#ecran-mois"), basculer, ouvrirDetail);

    // Sur PC la colonne de droite ne reste jamais vide : elle montre le premier mouvement à faire.
    if (estPC() && $("#detail-pc").hidden && !detailEnCours) {
      const premier = aFaire[0] ?? faits[0];
      if (premier) ouvrirDetail(premier.id);
    }
    if (estPC()) marquerChoisi($("#ecran-mois"), Number($("#detail-pc").querySelector(".detail")?.dataset.id));
  }

  $("#btn-mvt-ponctuel").addEventListener("click", formulairePonctuel);

  return { rendre, genererOccurrences, fermerDetail };
}
