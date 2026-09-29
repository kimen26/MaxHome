// Écran « Mois » (budget.png, D-036 §4) : fusion de l'ancien « Ce mois » et de l'ancien
// « Charges ». Bande de mois plate + titre en en-tête (index.html), puis dans l'ordre :
// salaires Y/C + clé, trois chiffres, À faire / Fait (mouvements, comportement inchangé de
// blocs-checklist), charges par catégorie en deux colonnes (déléguées à ui-mois-charges.js),
// « Ce mois seulement » (ex-ajustements), FAB « + Ajouter » qui ouvre la feuille
// « Ligne de ce mois ».

import { euros, versCentimes, montantTheorique } from "./calc.js";
import { $, $$, txt, toast, copier, montrerEcran, ouvrirFeuille, fermerFeuille, confirmer, MOIS } from "../socle/ui-base.js";
import { ligneCoche, carteListe, enteteDetail, trajetComptes, choixDetaille, marquerChoix } from "../socle/blocs.js";
import { creerCheckList } from "../socle/blocs-checklist.js";
import { champ, select, membresOptions, lire } from "../socle/blocs-form.js";
import { creerUiMoisCharges } from "./ui-mois-charges.js";
import { creerUiRegularisations } from "./ui-regularisations.js";
import { creerUiExtras } from "./ui-extras.js";
import { optionsRegle, detailRegle } from "./repartition.js";
import { etatDuMois, texteAFaireVide } from "./etat-mois.js";
import { valeurCourante, valeurAffichee, prochaineValeur } from "./coche-ligne.js";
import { creerUiGroupesVirements } from "./ui-groupes-virements.js";

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
  // Le virement au commun part du compte perso de chacun, qui n'est pas en base : on nomme la
  // personne plutôt que d'afficher « compte à définir ».
  const trajet = (m) => (m.compte_de == null && m.qui && m.compte_vers != null
    ? `Compte de ${m.qui} → ${nomCompte(m.compte_vers) ?? "compte à définir"}`
    : trajetComptes(etat.comptes, m.compte_de, m.compte_vers));
  const detailCompte = (id) => {
    const c = compte(id);
    return c?.iban_masque ? `····${c.iban_masque}` : (c?.titulaire ?? "");
  };
  // Un mouvement dont le récurrent est en mode "charge" (crédit immo → Caisse Épargne Joint,
  // par ex.) ne s'affiche plus ici : sa case, c'est désormais celle de sa ligne de charge
  // (ui-mois-charges.js, D-046). Il reste en base pour le bot et le rappel Telegram.
  const modeCharge = (m) => recurrentDe(m)?.mode === "charge";
  const aFaire = () => etat.mouvements.filter((m) => !m.fait_le && !modeCharge(m));
  const faits = () => etat.mouvements.filter((m) => m.fait_le && !modeCharge(m));

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
  const [p1] = etat.membres.map((mb) => mb.prenom);

  function ligneAFaire(m) {
    const r = recurrentDe(m);
    const consigne = m.consigne ?? r?.consigne ?? "";
    return ligneCoche({
      id: m.id, titre: m.titre, sous: trajet(m), prioritaire: aFaire()[0]?.id === m.id,
      alerte: enAlerte(m), // pas de pastille : le trajet dit déjà de qui part le virement (maquette)
      notes: [consigne, enAlerte(m) ? "Montant en attente : la charge liée n’a pas de montant ce mois." : null],
      droite: `<span class="mono mvt-montant">${euros(montantAffiche(m))}</span>`,
      cycle: { valeur: valeurAffichee(valeurCourante(m)), p1 },
    });
  }

  /** Coché, le montant est figé (D-015) ; s'il ne correspond plus au calcul du jour (salaires
   *  ou charges saisis après la coche), on le DIT — pas de recalcul silencieux d'un virement
   *  peut-être déjà parti (D-042). Écart d'1 centime toléré : arrondi du prorata. */
  function ecartFige(m) {
    const t = montantTheorique(recurrentDe(m), etat);
    if (t === null || Math.abs(t - m.montant_centimes) <= 1) return null;
    return `Coché à ${euros(m.montant_centimes)} ; le calcul donne maintenant ${euros(t)}. Décoche puis recoche pour mettre à jour.`;
  }

  /** jj/mm d'une date ISO — factorisé : utilisé par la ligne « Fait » et son détail. */
  const jourMois = (iso) => {
    const date = new Date(iso);
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
  };

  function ligneFaite(m) {
    const quand = jourMois(m.fait_le);
    const ecart = ecartFige(m);
    return ligneCoche({
      id: m.id, titre: m.titre, cochee: true, sous: m.fait_par ? `${quand} · ${m.fait_par}` : quand,
      alerte: !!ecart, notes: [ecart],
      droite: `<span class="mono mvt-montant pale">${euros(m.montant_centimes)}</span>`,
      cycle: { valeur: valeurAffichee(valeurCourante(m)), p1 },
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
        ${m.fait_le ? `<span class="sous">Fait le ${jourMois(m.fait_le)}${m.fait_par ? ` par ${txt(m.fait_par)}` : ""}</span>` : ""}
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
        ${(() => {
          // Même cycle que la case (D-048) : ce bouton avance d'un cran, son libellé dit
          // vers quoi — jamais un simple binaire fait/pas fait qui ne dirait plus qui valide.
          const suivant = prochaineValeur([null, ...etat.membres.map((mb) => mb.prenom)], valeurCourante(m));
          return `<button class="btn ${suivant === null ? "" : "btn-vert"} grandir" data-basculer>
            ${suivant === null ? "Annuler la validation" : `✓ Valider pour ${txt(suivant)}`}</button>`;
        })()}
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
      // Le montant se fige à la PREMIÈRE coche (D-048, rien → quelqu'un) : il est lu AVANT
      // toute mutation, sinon montantAffiche() renvoie déjà la valeur figée de la ligne (L-008).
      // Aux changements de personne suivants (quelqu'un → l'autre), il reste tel quel.
      figer: (m) => montantAffiche(m),
      // `options.valeurCible`/`options.dateCible` (D-048 §3) : un groupe de virements impose
      // LA MÊME personne ET LA MÊME date à toutes ses lignes non faites en un seul tap, au
      // lieu du cycle indépendant par ligne (jamais un `new Date()` par ligne, qui divergerait).
      appliquer: (m, fige, options = {}) => {
        const courant = valeurCourante(m);
        const suivant = options.valeurCible !== undefined
          ? options.valeurCible : prochaineValeur([null, ...etat.membres.map((mb) => mb.prenom)], courant);
        // Première coche = le mouvement n'était PAS coché du tout (courant null) — depuis
        // SANS_PRENOM (D-048), fait_le existe déjà, le montant reste tel quel (déjà figé).
        const premiereCoche = courant === null && suivant !== null;
        m.fait_le = suivant === null ? null : (m.fait_le ?? options.dateCible ?? new Date().toISOString());
        m.fait_par = suivant;
        if (premiereCoche) m.montant_centimes = fige;
        return { fait_le: m.fait_le, montant_centimes: m.montant_centimes, fait_par: m.fait_par };
      },
      ecrire: (id, champs) => api.majMouvement(id, champs),
      // `avant` (snapshot pré-mutation) n'a pas de notion de SANS_PRENOM (c'est fait_par tel
      // qu'écrit en base) : `_m.fait_par` (post-mutation) dit qui valide maintenant, `null` en
      // sortie de cycle. Le sens (annulé vs validé) se lit sur fait_le, pas sur fait_par seul.
      message: (_m, avant) => (avant.fait_le && !_m.fait_le ? "Validation annulée." : `Validé pour ${_m.fait_par}.`),
    },
  });

  // ---------- « Virements à faire » : regroupement par trajet (D-048 §3, ui-groupes-virements.js) ----------
  const groupesVirements = creerUiGroupesVirements(api, etat, cb, { basculerMouvement: liste.basculer });

  // ---------- revenus (salaires + part de chacun au prorata) ----------
  function rendreSalaires() {
    $("#salaires").innerHTML = `${etat.membres.map((m) => `
      <label class="salaire-champ"><span class="salaire-prenom">${txt(m.prenom)}</span>
        <input class="champ champ-montant pos" inputmode="decimal" data-revenu="${txt(m.prenom)}"
               value="${etat.revenus[m.prenom] ? (etat.revenus[m.prenom] / 100).toFixed(2).replace(".", ",") : ""}"
               placeholder="0,00"></label>`).join("")}
      <span class="salaire-cle">Prorata : <strong>${txt(detailRegle("proport", etat))}</strong></span>`;
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

  // ---------- « Ce mois seulement » : charges ponctuelles + régularisations (ui-extras.js) ----------
  const extras = creerUiExtras(api, etat, cb);
  const regularisations = creerUiRegularisations(api, etat, cb);

  function rendreExtras() {
    $("#ce-mois-tete-total").textContent = euros(extras.total());
    // Charges ponctuelles puis régularisations entre nous : les deux ne valent que ce mois-ci.
    $("#ajustements").innerHTML = extras.html() + regularisations.html();
    extras.brancher($("#ajustements"), rendre);
    regularisations.brancher($("#ajustements"), rendre);
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
        <div data-regle-ajout><span class="etiquette">Répartition</span>
          ${choixDetaille(optionsRegle(etat, {}), "proport", { attr: "regle", etiquette: "Répartition" })}</div>
      </div>
      <button type="submit" class="btn btn-vert grandir">Ajouter au mois</button>
    </form>`);
    const form = $("#form-ligne-mois");
    for (const p of form.querySelectorAll("[data-suggestion]")) {
      p.addEventListener("click", () => { form.titre.value = p.dataset.suggestion; form.titre.focus(); });
    }
    let regleChoisie = "proport";
    for (const b of form.querySelectorAll("[data-regle-ajout] [data-regle]")) {
      b.addEventListener("click", () => { regleChoisie = b.dataset.regle; marquerChoix(b); });
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
    const r = etat.resultat;
    const statut = etatDuMois(etat);

    const commun = etat.comptes.find((c) => c.commun);
    $("#commun-mois").textContent = commun ? `Commun · ${commun.nom}` : "";

    // « (fin de mois) » est écrit à côté, dans index.html : le salaire noté ici est celui reçu
    // à la fin de ce mois-là (D-042).
    const nomMois = `${MOIS[etat.mois - 1][0].toUpperCase()}${MOIS[etat.mois - 1].slice(1)} ${etat.annee}`;
    $("#titre-mois").textContent = nomMois;
    // Sans salaire, la clé de prorata n'est pas encore connue (100 / 0 ou 50 / 50 par défaut) :
    // on ne l'affiche qu'une fois les salaires notés. Espaces insécables : à 360 px, « clé 47 »
    // et « / 53 » tombaient sur deux lignes.
    const cle = etat.membres.map((m) => Math.round((r.ratio[m.prenom] ?? 0) * 100)).join("\u00a0/\u00a0");
    $("#sous-mois").textContent = statut.statut === "salaires" ? statut.phrase : `${statut.phrase} · clé\u00a0${cle}`;
    $("#total-charges-mois").textContent = euros(r.total);

    rendreSalaires();

    $("#chiffres-mois").innerHTML = `
      <div class="carte chiffre-carte"><span class="chiffre-etiquette">Total commun</span>
        <span class="mono chiffre-valeur">${euros(r.totalCommun)}</span></div>
      ${etat.membres.map((m) => `<div class="carte chiffre-carte"><span class="chiffre-etiquette">Reste ${txt(m.prenom)}</span>
        <span class="mono chiffre-valeur ${(r.reste[m.prenom] ?? 0) < 0 ? "accent-rouge" : "accent-vert"}">${euros(r.reste[m.prenom] ?? 0)}</span></div>`).join("")}`;

    $("#afaire-tete-total").textContent = String(restants.length);
    $("#fait-tete-total").textContent = String(termines.length);
    $("#mvts-a-faire").innerHTML = carteListe(restants.map(ligneAFaire), texteAFaireVide(statut));
    $("#mvts-faits").innerHTML = carteListe(termines.map(ligneFaite), "Rien de coché pour l’instant.");
    liste.apresRendu();

    charges.rendre();
    rendreExtras();

    $("#groupes-virements").innerHTML = groupesVirements.html();
    groupesVirements.brancher($("#groupes-virements"));
  }

  $("#btn-mvt-ponctuel").addEventListener("click", formulairePonctuel);
  $("#fab-ajouter-mois").addEventListener("click", formulaireLigneDuMois);

  return { rendre, fermerDetail: liste.fermerDetail, fermerReglagesCharges: charges.fermerReglages,
    ouvrirReglagesCharge: charges.ouvrirReglages };
}
