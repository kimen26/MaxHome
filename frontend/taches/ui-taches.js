// Écran « Aujourd'hui » du module Tâches : à faire (par groupe), au besoin, fait aujourd'hui, détail.
// Le comportement (coche, panneau, rollback) vient de blocs-checklist ; ici, le HTML et les règles.
// Une tâche prévue plusieurs fois par période s'affiche sur UNE ligne, cochée autant de fois
// que prévu (D-023) : la liste se lit d'un coup d'œil, le bot garde une occurrence par coche.

import { $, txt, toast, ouvrirFeuille, fermerFeuille, montrerEcran } from "../socle/ui-base.js";
import { ligneCoche, carteListe, chiffres, titreSection, enteteDetail, choixQui } from "../socle/blocs.js";
import { creerCheckList } from "../socle/blocs-checklist.js";
import { champ, select, listeChoix, membresOptions, lire } from "../socle/blocs-form.js";
import { occurrencesManquantes, perimees, pointsDe, groupe, GROUPES, trier, jourIso, balance,
  decalerJours, FREQUENCES, PENIBILITES, pts } from "./taches.js";

const ASIDE = "#detail-tache-pc";

/** Occurrences du jour : purge des périmées, création des manquantes (taches.js, testé). */
export const STRATEGIE_TACHES = {
  existantes: (etat) => etat.taches,
  perimees: (existantes) => perimees(existantes, jourIso(new Date())),
  manquantes: (etat, restantes) => occurrencesManquantes(etat.tachesRec, restantes, jourIso(new Date())),
  creer: (api, lignes) => api.creerTaches(lignes),
  supprimer: (api, ids) => api.supprimerTaches(ids),
  poser: (etat, restantes, creees) => { etat.taches = [...restantes, ...creees]; },
};

export function creerUiTaches(api, etat, cb) {
  const recDe = (t) => etat.tachesRec.find((r) => r.id === t.recurrent_id);
  const aujourdhui = () => jourIso(new Date());
  const faiteAujourdhui = (t) => t.fait_le && jourIso(new Date(t.fait_le)) === aujourdhui();
  const aFaire = () => trier(etat.taches.filter((t) => !t.fait_le), etat.tachesRec);
  const faites = () => etat.taches.filter(faiteAujourdhui).sort((a, b) => b.fait_le.localeCompare(a.fait_le));
  const duJour = () => aFaire().filter((t) => ["retard", "aujourdhui"].includes(groupe(t, aujourdhui())));

  /** Regroupe les occurrences d'un même récurrent et d'une même échéance : une ligne par tâche. */
  function regrouper(liste) {
    const groupes = new Map();
    for (const t of liste) {
      const cle = t.recurrent_id ? `${t.recurrent_id}|${t.echeance}` : `ponctuelle-${t.id}`;
      if (!groupes.has(cle)) groupes.set(cle, { tache: t, restantes: 0 });
      groupes.get(cle).restantes += 1;
    }
    return [...groupes.values()];
  }

  const sousTitre = (t, restantes) => {
    const r = recDe(t);
    const morceaux = [t.categorie];
    if (r && r.fois > 1) {
      const faitesDuGroupe = etat.taches.filter((x) => x.recurrent_id === t.recurrent_id && x.echeance === t.echeance && x.fait_le).length;
      morceaux.push(`${faitesDuGroupe}/${r.fois} fait${faitesDuGroupe > 1 ? "s" : ""}${restantes > 1 ? "" : ", dernière"}`);
    }
    if (r) morceaux.push(FREQUENCES[r.frequence].toLowerCase());
    return morceaux.join(" · ");
  };

  const ligne = ({ tache: t, restantes = 1 }, prioritaire = false) => ligneCoche({
    id: t.id, titre: t.titre, sous: sousTitre(t, restantes), prioritaire,
    cochee: !!t.fait_le, pastille: t.qui,
    droite: `<span class="pts">${pts(t.fait_le ? t.points : pointsDe(recDe(t), t))}</span>`,
    notes: t.fait_le ? [] : [t.echeance < aujourdhui() ? `Prévue le ${t.echeance.slice(8)}/${t.echeance.slice(5, 7)}` : null],
    alerte: !t.fait_le && t.echeance < aujourdhui(),
  });

  // ---------- détail ----------
  function htmlDetail(t) {
    const r = recDe(t);
    const points = t.fait_le ? t.points : pointsDe(r, t);
    const quand = t.fait_le ? new Date(t.fait_le).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : null;
    const autres = etat.membres.map((m) => m.prenom).filter((p) => p !== etat.prenom);
    return `<div class="detail" data-id="${t.id}">
      ${enteteDetail(t.titre, r ? `${FREQUENCES[r.frequence]}${r.fois > 1 ? ` · ${r.fois} fois` : ""} · ${t.categorie}` : `Hors liste · ${t.categorie}`)}
      <div class="detail-montant">
        <span class="mono grand">${pts(points)}</span>
        <span class="sous">${r ? `Pénibilité « ${PENIBILITES[r.penibilite]} ». ` : ""}${t.fait_le ? `Fait le ${quand}${t.qui ? ` par ${txt(t.qui)}` : ""}.` : "Les points vont à la personne qui coche."}</span>
      </div>
      ${t.fait_le ? `<div class="detail-consigne"><span class="etiquette">Fait par</span>${choixQui(etat.membres.map((m) => m.prenom), t.qui)}</div>` : ""}
      ${r?.consigne ? `<div class="detail-consigne"><span class="etiquette">Consigne</span><p class="texte-consigne">${txt(r.consigne)}</p></div>` : ""}
      <div class="detail-actions">
        ${t.fait_le
    ? '<button class="btn grandir" data-basculer>Annuler la coche</button>'
    : `<button class="btn btn-vert grandir" data-basculer>✓ Fait par moi</button>
           ${autres.map((p) => `<button class="btn grandir" data-pour="${txt(p)}">Fait par ${txt(p)}</button>`).join("")}`}
      </div>
      ${r ? '<button class="btn-lien centre" data-vers-reglages>Modifier la tâche récurrente</button>' : ""}
    </div>`;
  }

  const liste = creerCheckList({
    ecran: "#ecran-jour", aside: ASIDE,
    trouver: (id) => etat.taches.find((t) => t.id === id),
    premier: () => duJour()[0] ?? faites()[0],
    htmlDetail, rendre, echec: cb.echec,
    brancherDetail: (t, racine, { basculer, fermer }) => {
      for (const b of racine.querySelectorAll("[data-pour]")) b.addEventListener("click", () => basculer({ pour: b.dataset.pour }));
      for (const b of racine.querySelectorAll("[data-qui]")) b.addEventListener("click", () => attribuer(t, b.dataset.qui));
      racine.querySelector("[data-vers-reglages]")?.addEventListener("click", () => { fermer(); montrerEcran("taches-rec"); });
    },
    basculer: {
      // Les points se figent à la coche : lus AVANT de poser la date (L-008).
      figer: (t) => pointsDe(recDe(t), t),
      appliquer: (t, figes, { pour = etat.prenom } = {}) => {
        if (t.fait_le) Object.assign(t, { fait_le: null, points: 0, qui: recDe(t)?.attribue_a ?? null });
        else Object.assign(t, { fait_le: new Date().toISOString(), qui: pour, points: figes });
        return { fait_le: t.fait_le, qui: t.qui, points: t.points };
      },
      ecrire: (id, champs) => api.majTache(id, champs),
      message: (t, avant) => (avant.fait_le ? "Coche annulée." : `Fait. +${pts(t.points)} pour ${t.qui}.`),
    },
  });

  async function attribuer(t, qui) {
    if (t.qui === qui) return;
    const avant = t.qui;
    t.qui = qui;
    rendre();
    liste.ouvrirDetail(t.id);
    try { await api.majTache(t.id, { qui }); toast(`Attribuée à ${qui}.`); }
    catch (e) { t.qui = avant; rendre(); cb.echec(e); }
  }

  /** Tâche « au besoin » : créée déjà faite, par moi, maintenant. */
  async function faireMaintenant(recId) {
    const r = etat.tachesRec.find((x) => x.id === recId);
    if (!r) return;
    try {
      const rang = 1 + etat.taches.filter((x) => x.recurrent_id === r.id && x.echeance === aujourdhui()).length;
      const [t] = await api.creerTaches([{ recurrent_id: r.id, titre: r.titre, categorie: r.categorie,
        echeance: aujourdhui(), rang, qui: etat.prenom, fait_le: new Date().toISOString(), points: r.penibilite }]);
      etat.taches.push(t);
      rendre();
      toast(`${r.titre} : +${pts(t.points)} pour ${etat.prenom}.`);
    } catch (e) { cb.echec(e); }
  }

  function formulairePonctuelle() {
    ouvrirFeuille(`<form id="form-tache-ponct" class="pile">
      <h2>Tâche faite hors liste</h2>
      ${champ("titre", "Quoi", { requis: true, placeholder: "ex. Monter le lit", attrs: 'autocomplete="off"' })}
      ${champ("categorie", "Catégorie", { valeur: "Maison", attrs: 'list="categories-taches"' })}
      ${listeChoix("categories-taches", [...new Set(etat.tachesRec.map((r) => r.categorie))])}
      ${select("points", "Pénibilité", PENIBILITES.slice(1).map((l, i) => [i + 1, `${i + 1} — ${l}`]), 3)}
      ${select("qui", "Fait par", membresOptions(etat), etat.prenom)}
      <button type="submit" class="btn btn-bleu grandir">Enregistrer</button>
    </form>`);
    $("#form-tache-ponct").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const v = lire(ev.target, { nombres: ["points"] });
        const [t] = await api.creerTaches([{ recurrent_id: null, titre: v.titre, categorie: v.categorie ?? "Maison",
          echeance: aujourdhui(), rang: 1, qui: v.qui, fait_le: new Date().toISOString(), points: v.points }]);
        etat.taches.push(t);
        fermerFeuille();
        rendre();
        toast("Tâche enregistrée.");
      } catch (e) { cb.echec(e); }
    });
  }

  // ---------- rendu ----------
  function rendre() {
    const jour = aujourdhui();
    const restantes = aFaire();
    const termines = faites();
    const total = duJour().length + termines.length;

    $("#titre-jour").textContent = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
      .replace(/^./, (c) => c.toUpperCase());
    $("#sous-jour").textContent = total
      ? `${termines.length} tâche${termines.length > 1 ? "s" : ""} sur ${total} faite${termines.length > 1 ? "s" : ""}`
      : "Rien de prévu aujourd’hui.";
    $("#jauge-jour").style.width = total ? `${Math.round((termines.length / total) * 100)}%` : "0%";

    const b = balance(etat.taches, etat.membres.map((m) => m.prenom), decalerJours(jour, -6), jour);
    $("#chiffres-jour").innerHTML = chiffres([
      { etiquette: "Reste aujourd’hui", valeur: String(duJour().length), accent: true },
      ...etat.membres.map((m) => ({ etiquette: `${m.prenom} · 7 j`, valeur: `${Math.round(b.ratio[m.prenom] * 100)} %` })),
    ]);

    let html = "";
    let premier = true;
    for (const [cle, libelle] of GROUPES) {
      const groupes = regrouper(restantes.filter((t) => groupe(t, jour) === cle));
      if (!groupes.length) continue;
      html += titreSection(libelle) + carteListe(groupes.map((g) => { const l = ligne(g, premier); premier = false; return l; }), "");
    }
    $("#taches-a-faire").innerHTML = html || `${titreSection("À faire")}<p class="vide">Tout est fait. Bravo.</p>`;

    const auBesoin = etat.tachesRec.filter((r) => r.actif && r.frequence === "au_besoin");
    $("#taches-au-besoin").innerHTML = auBesoin.length
      ? `<div class="carte-liste">${auBesoin.map((r) => `<div class="mvt rapide" data-rapide="${r.id}">
          <span class="case rapide" aria-hidden="true">+</span>
          <div class="mvt-corps"><span class="mvt-titre">${txt(r.titre)}</span>
            <span class="mvt-trajet">${txt(r.categorie)} · quand c’est nécessaire</span></div>
          <div class="mvt-droite"><span class="pts">${pts(r.penibilite)}</span></div>
        </div>`).join("")}</div>`
      : '<p class="vide">Aucune tâche « au besoin ».</p>';

    $("#taches-faites").innerHTML = carteListe(termines.map((t) => ligne({ tache: t })), "Rien de coché pour l’instant.");
    for (const el of $("#ecran-jour").querySelectorAll("[data-rapide]")) {
      el.addEventListener("click", () => faireMaintenant(Number(el.dataset.rapide)));
    }
    liste.apresRendu();
  }

  $("#btn-tache-ponctuelle").addEventListener("click", formulairePonctuelle);

  return { rendre, fermerDetail: liste.fermerDetail };
}
