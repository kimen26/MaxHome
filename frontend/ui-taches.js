// Écran « Aujourd'hui » du module Tâches : à faire (par groupe), au besoin, fait aujourd'hui, détail.
// Même patron que « Ce mois » : occurrences générées à l'ouverture, points figés à la coche (L-008).

import { $, txt, estPC, toast, fermerFeuille, feuilleOuverte, ouvrirFeuille, montrerEcran } from "./ui-base.js";
import { ligneCoche, carteListe, chiffres, titreSection, brancherCoches, marquerChoisi,
  enteteDetail, ouvrirPanneau, fermerPanneau, choixQui } from "./blocs.js";
import { occurrencesManquantes, perimees, pointsDe, groupe, GROUPES, trier, jourIso, balance, decalerJours,
  FREQUENCES, PENIBILITES } from "./taches.js";

const ASIDE = "#detail-tache-pc";
const pts = (n) => `${n} pt${n > 1 ? "s" : ""}`;

export function creerUiTaches(api, etat, cb) {
  let detailEnCours = null;
  const recDe = (t) => etat.tachesRec.find((r) => r.id === t.recurrent_id);
  const aujourdhui = () => jourIso(new Date());
  const faiteAujourdhui = (t) => t.fait_le && jourIso(new Date(t.fait_le)) === aujourdhui();

  // ---------- génération ----------
  async function genererOccurrences() {
    const mortes = perimees(etat.taches, aujourdhui());
    if (mortes.length) {
      await api.supprimerTaches(mortes.map((t) => t.id));
      etat.taches = etat.taches.filter((t) => !mortes.includes(t));
    }
    const manquantes = occurrencesManquantes(etat.tachesRec, etat.taches, aujourdhui());
    if (!manquantes.length) return;
    etat.taches.push(...await api.creerTaches(manquantes));
  }

  // ---------- rendu ----------
  const sousTitre = (t) => {
    const r = recDe(t);
    const morceaux = [t.categorie];
    if (r && r.fois > 1) morceaux.push(`${t.rang}/${r.fois}`);
    if (r) morceaux.push(FREQUENCES[r.frequence].toLowerCase());
    return morceaux.join(" · ");
  };

  const ligne = (t, prioritaire = false) => ligneCoche({
    id: t.id, titre: t.titre, sous: sousTitre(t), prioritaire,
    cochee: !!t.fait_le, pastille: t.qui,
    droite: `<span class="pts">${pts(t.fait_le ? t.points : pointsDe(recDe(t), t))}</span>`,
    notes: t.fait_le ? [] : [t.echeance < aujourdhui() ? `Prévue le ${t.echeance.slice(8)}/${t.echeance.slice(5, 7)}` : null],
    alerte: !t.fait_le && t.echeance < aujourdhui(),
  });

  function rendre() {
    const jour = aujourdhui();
    const aFaire = trier(etat.taches.filter((t) => !t.fait_le), etat.tachesRec);
    const faites = etat.taches.filter(faiteAujourdhui).sort((a, b) => b.fait_le.localeCompare(a.fait_le));
    const duJour = aFaire.filter((t) => groupe(t, jour) !== "mois" && groupe(t, jour) !== "semaine");
    const total = duJour.length + faites.length;

    const d = new Date();
    $("#titre-jour").textContent = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
      .replace(/^./, (c) => c.toUpperCase());
    $("#sous-jour").textContent = total
      ? `${faites.length} tâche${faites.length > 1 ? "s" : ""} sur ${total} faite${faites.length > 1 ? "s" : ""}`
      : "Rien de prévu aujourd’hui.";
    $("#jauge-jour").style.width = total ? `${Math.round((faites.length / total) * 100)}%` : "0%";

    const b = balance(etat.taches, etat.membres.map((m) => m.prenom), decalerJours(jour, -6), jour);
    $("#chiffres-jour").innerHTML = chiffres([
      { etiquette: "Reste aujourd’hui", valeur: String(duJour.length), accent: true },
      ...etat.membres.map((m) => ({ etiquette: `${m.prenom} · 7 j`, valeur: `${Math.round(b.ratio[m.prenom] * 100)} %` })),
    ]);

    let html = "";
    let premier = true;
    for (const [cle, libelle] of GROUPES) {
      const liste = aFaire.filter((t) => groupe(t, jour) === cle);
      if (!liste.length) continue;
      html += titreSection(libelle) + carteListe(liste.map((t) => {
        const l = ligne(t, premier); premier = false; return l;
      }), "");
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

    $("#taches-faites").innerHTML = carteListe(faites.map((t) => ligne(t)), "Rien de coché pour l’instant.");

    const racine = $("#ecran-jour");
    brancherCoches(racine, basculer, ouvrirDetail);
    for (const el of racine.querySelectorAll("[data-rapide]")) {
      el.addEventListener("click", () => faireMaintenant(Number(el.dataset.rapide)));
    }

    if (estPC() && $(ASIDE).hidden && !detailEnCours) {
      const p = duJour[0] ?? faites[0];
      if (p) ouvrirDetail(p.id);
    }
    if (estPC()) marquerChoisi(racine, Number($(ASIDE).querySelector(".detail")?.dataset.id));
  }

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
    ? `<button class="btn grandir" data-basculer>Annuler la coche</button>`
    : `<button class="btn btn-vert grandir" data-basculer>✓ Fait par moi</button>
           ${autres.map((p) => `<button class="btn grandir" data-pour="${txt(p)}">Fait par ${txt(p)}</button>`).join("")}`}
      </div>
      ${r ? '<button class="btn-lien centre" data-vers-reglages>Modifier la tâche récurrente</button>' : ""}
    </div>`;
  }

  function ouvrirDetail(id) {
    const t = etat.taches.find((x) => x.id === id);
    if (!t) return;
    const racine = ouvrirPanneau(ASIDE, htmlDetail(t));
    racine.querySelector("[data-fermer-detail]")?.addEventListener("click", fermerDetail);
    racine.querySelector("[data-basculer]")?.addEventListener("click", () => basculer(t.id));
    for (const b of racine.querySelectorAll("[data-pour]")) b.addEventListener("click", () => basculer(t.id, b.dataset.pour));
    for (const b of racine.querySelectorAll("[data-qui]")) b.addEventListener("click", () => attribuer(t, b.dataset.qui));
    racine.querySelector("[data-vers-reglages]")?.addEventListener("click", () => { fermerDetail(); montrerEcran("taches-rec"); });
    if (estPC()) marquerChoisi($("#ecran-jour"), id);
  }
  const fermerDetail = () => fermerPanneau(ASIDE);

  // ---------- écritures ----------
  async function basculer(id, pour = etat.prenom) {
    const t = etat.taches.find((x) => x.id === id);
    if (!t) return;
    const avant = { fait_le: t.fait_le, qui: t.qui, points: t.points };
    // Les points se figent à la coche : lus AVANT de poser la date (L-008).
    const figes = pointsDe(recDe(t), t);
    if (t.fait_le) { t.fait_le = null; t.points = 0; t.qui = recDe(t)?.attribue_a ?? null; }
    else { t.fait_le = new Date().toISOString(); t.qui = pour; t.points = figes; }
    if (feuilleOuverte()) fermerFeuille();
    detailEnCours = estPC() ? id : null;
    rendre();
    if (estPC()) ouvrirDetail(id);
    detailEnCours = null;
    try {
      await api.majTache(id, { fait_le: t.fait_le, qui: t.qui, points: t.points });
      toast(avant.fait_le ? "Coche annulée." : `Fait. +${pts(t.points)} pour ${t.qui}.`);
      cb.surTaches?.();
    } catch (e) { Object.assign(t, avant); rendre(); cb.echec(e); }
  }

  async function attribuer(t, qui) {
    if (t.qui === qui) return;
    const avant = t.qui;
    t.qui = qui;
    rendre();
    if (estPC()) ouvrirDetail(t.id);
    try { await api.majTache(t.id, { qui }); toast(`Attribuée à ${qui}.`); cb.surTaches?.(); }
    catch (e) { t.qui = avant; rendre(); cb.echec(e); }
  }

  /** Tâche « au besoin » : créée déjà faite, par moi, maintenant. */
  async function faireMaintenant(recId) {
    const r = etat.tachesRec.find((x) => x.id === recId);
    if (!r) return;
    try {
      const [t] = await api.creerTaches([{ recurrent_id: r.id, titre: r.titre, categorie: r.categorie,
        echeance: aujourdhui(), rang: 1 + etat.taches.filter((x) => x.recurrent_id === r.id && x.echeance === aujourdhui()).length,
        qui: etat.prenom, fait_le: new Date().toISOString(), points: r.penibilite }]);
      etat.taches.push(t);
      rendre();
      toast(`${r.titre} : +${pts(t.points)} pour ${etat.prenom}.`);
      cb.surTaches?.();
    } catch (e) { cb.echec(e); }
  }

  function formulairePonctuelle() {
    ouvrirFeuille(`<form id="form-tache-ponct" class="pile">
      <h2>Tâche faite hors liste</h2>
      <label>Quoi <input class="champ" name="titre" required placeholder="ex. Monter le lit"></label>
      <label>Catégorie <input class="champ" name="categorie" list="categories-taches" value="Maison"></label>
      <datalist id="categories-taches">${[...new Set(etat.tachesRec.map((r) => r.categorie))].map((c) => `<option value="${txt(c)}">`).join("")}</datalist>
      <label>Pénibilité <select class="champ" name="points">
        ${PENIBILITES.slice(1).map((l, i) => `<option value="${i + 1}"${i + 1 === 3 ? " selected" : ""}>${i + 1} — ${l}</option>`).join("")}
      </select></label>
      <label>Fait par <select class="champ" name="qui">
        ${etat.membres.map((m) => `<option${m.prenom === etat.prenom ? " selected" : ""}>${txt(m.prenom)}</option>`).join("")}
      </select></label>
      <button type="submit" class="btn btn-bleu grandir">Enregistrer</button>
    </form>`);
    $("#form-tache-ponct").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      try {
        const [t] = await api.creerTaches([{ recurrent_id: null, titre: f.get("titre").trim(),
          categorie: f.get("categorie").trim() || "Maison", echeance: aujourdhui(), rang: 1,
          qui: f.get("qui"), fait_le: new Date().toISOString(), points: Number(f.get("points")) }]);
        etat.taches.push(t);
        fermerFeuille();
        rendre();
        toast("Tâche enregistrée.");
        cb.surTaches?.();
      } catch (e) { cb.echec(e); }
    });
  }

  $("#btn-tache-ponctuelle").addEventListener("click", formulairePonctuelle);

  return { rendre, genererOccurrences, fermerDetail };
}
