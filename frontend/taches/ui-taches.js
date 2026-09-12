// Écran « Tâches · Jour » : segmenté Jour|Semaine, bande des 7 jours, cartes du jour puis
// Semaine/Mois, barre « Fait » repliable. Le comportement de la coche (cycle, écriture,
// rollback) vient de blocs-checklist ; ici, le HTML et les règles d'affichage (D-024, inv. 6).
//
// Le quotidien se répartit en deux cartes « Matin / Soir » (handoff §1), portées par
// `taches_recurrentes.moment` (012_moment.sql, nullable). Une tâche quotidienne sans moment
// réglé reste visible dans une troisième carte « Sans moment » plutôt que de disparaître —
// jamais de tâche qu'un tap ailleurs ferait perdre de vue.
//
// Une tâche prévue plusieurs fois par période s'affiche sur UNE ligne, cochée autant de fois
// que prévu (D-023) : la liste se lit d'un coup d'œil, le bot garde une occurrence par coche.

import { $, txt, montrerEcran, ouvrirFeuille, fermerFeuille, toast } from "../socle/ui-base.js";
import { enteteDetail, choixQui } from "../socle/blocs.js";
import { creerCheckList } from "../socle/blocs-checklist.js";
import { boutonCycle, brancherCycles, suivante } from "../socle/blocs-cycle.js";
import { occurrencesManquantes, perimees, partsDe, creditDe, partsTexte, groupe, trier,
  jourIso, depuisIso, decalerJours, echeance, FREQUENCES } from "./taches.js";

const ASIDE = "#detail-tache-pc";
// Marqueur du cran « fait à deux » dans le cycle de coche : ni un prénom, ni null, jamais
// écrit tel quel en base (basculer() le traduit en qui + qui2, cf. creditDe).
const A_DEUX = "_deux";

/** Occurrences du jour : purge des périmées, création des manquantes (taches.js, testé). */
export const STRATEGIE_TACHES = {
  existantes: (etat) => etat.taches,
  perimees: (existantes) => perimees(existantes, jourIso(new Date())),
  manquantes: (etat, restantes) => occurrencesManquantes(etat.tachesRec, restantes, jourIso(new Date())),
  creer: (api, lignes) => api.creerTaches(lignes),
  supprimer: (api, ids) => api.supprimerTaches(ids),
  poser: (etat, restantes, creees) => { etat.taches = [...restantes, ...creees]; },
};

export function creerUiTaches(api, etat, cb, ouvrirAjout) {
  const recDe = (t) => etat.tachesRec.find((r) => r.id === t.recurrent_id);
  const membres = () => etat.membres.map((m) => m.prenom);
  let jourSel = jourIso(new Date());
  let faitesOuvertes = false;

  const aFaire = () => trier(etat.taches.filter((t) => !t.fait_le), etat.tachesRec);
  const faitesLe = (jour) => etat.taches.filter((t) => t.fait_le && jourIso(new Date(t.fait_le)) === jour)
    .sort((a, b) => b.fait_le.localeCompare(a.fait_le));
  const duJour = (jour) => aFaire().filter((t) => ["retard", "aujourdhui"].includes(groupe(t, jour)));

  /** Crédit d'une occurrence, quelle que soit la forme de l'objet (occurrence réelle ou figurée). */
  const credit = (t) => creditDe({ parts_quart: t.parts_quart }, t);
  const totalCredit = (c) => Object.values(c).reduce((s, n) => s + n, 0);
  const partDe = (c, prenom) => c[prenom] ?? 0;

  // ---------- cycle de coche (tri-état) ----------
  /** Valeurs du cycle, dans l'ordre du handoff : Claudia → Yann → (les deux) → rien. */
  const valeursCycle = (r) => (r?.partageable ? [null, ...membres(), A_DEUX] : [null, ...membres()]);
  /** Valeur courante de la case, dérivée de l'état réel de la tâche (jamais recalculée à part). */
  const valeurCourante = (t) => (!t.fait_le ? null : t.qui2 ? A_DEUX : t.qui);

  function renduCase(valeur) {
    if (valeur === null) return { libelle: "", classe: "case-cycle-vide" };
    if (valeur === A_DEUX) return { libelle: "CY", classe: "case-cycle-deux" };
    const [p1] = membres();
    return { libelle: valeur[0].toUpperCase(), classe: valeur === p1 ? "case-cycle-p1" : "case-cycle-p2" };
  }
  function caseTacheHtml(t) {
    const r = recDe(t);
    return boutonCycle({
      cle: String(t.id), valeurs: valeursCycle(r), valeur: valeurCourante(t),
      rendu: renduCase, classe: "case-tache", taille: "jour",
    });
  }

  /** Regroupe les occurrences d'un même récurrent et d'une même échéance : une ligne par tâche. */
  function regrouper(liste) {
    const groupes = new Map();
    for (const t of liste) {
      const cle = t.recurrent_id ? `${t.recurrent_id}|${t.echeance}` : `ponctuelle-${t.id}`;
      if (!groupes.has(cle)) groupes.set(cle, t);
    }
    return [...groupes.values()];
  }

  /** Parts affichées sur une ligne : `1+1` quand fait à deux, sinon la valeur qui suit qui a coché. */
  function partsLigne(t) {
    if (t.fait_le) {
      const c = credit(t);
      return t.qui2 ? `${partsTexte(c[t.qui] ?? 0)}+${partsTexte(c[t.qui2] ?? 0)}` : partsTexte(c[t.qui] ?? 0);
    }
    const r = recDe(t);
    return partsTexte(partsDe(r, r?.attribue_a ?? null));
  }

  function ligneTache(t, { metaDroite = null, metaClasse = "" } = {}) {
    const r = recDe(t);
    const fait = !!t.fait_le;
    const droite = metaDroite ?? partsLigne(t);
    return `<div class="ligne-tache${fait ? " ligne-faite" : ""}" data-id="${t.id}">
      ${caseTacheHtml(t)}
      <span class="point-oblig ${r?.obligatoire ? (fait ? "oblig-faite" : "oblig-due") : "oblig-non"}" aria-hidden="true"></span>
      <span class="titre-tache${fait ? " fait" : ""}">${txt(t.titre)}</span>
      <span class="mono parts-ligne ${metaClasse}">${txt(droite)}</span>
    </div>`;
  }

  const carte = (nom, lignesHtml, compte, compteClasse) => `<div class="carte-taches">
    <div class="carte-taches-tete${compteClasse === "vert" ? " tete-complete" : ""}">
      <span>${txt(nom)}</span><span class="mono compte-${compteClasse || "ambre"}">${txt(compte)}</span>
    </div>
    ${lignesHtml || '<p class="vide-carte">Rien.</p>'}
  </div>`;

  /** Une tâche ajoutée depuis la feuille « Ajouter une tâche » (§8 du handoff) est une
   *  occurrence SANS récurrent : elle ne porte ni fréquence ni moment, donc les filtres
   *  ci-dessous (qui ne lisent que `recDe(t)`) la manqueraient. Elle rejoint la carte
   *  « Sans moment » du jour, ou les cartes Semaine/Mois à côté des lignes des récurrents —
   *  jamais invisible faute de rattachement (même principe que le « sans moment » du §1). */
  const ponctuelle = (t) => !t.recurrent_id;

  /** Carte « Matin » / « Soir » (ou « Sans moment ») : les occurrences quotidiennes du jour
   *  dont la tâche récurrente porte ce moment (handoff §1). `null` regroupe les tâches
   *  quotidiennes pas encore réglées, et les ponctuelles du jour sans récurrent : jamais
   *  invisibles, juste pas encore rangées. */
  function carteMoment(nom, moment, jour) {
    const quotidienne = (t) => recDe(t)?.frequence === "quotidien";
    const appartient = (t) => moment === null && ponctuelle(t) ? true
      : quotidienne(t) && (recDe(t)?.moment ?? null) === moment;
    const restantes = regrouper(duJour(jour)).filter(appartient);
    const faites = faitesLe(jour).filter(appartient);
    const total = restantes.length + faites.length;
    const complet = total > 0 && restantes.length === 0;
    const compte = total ? `${faites.length}/${total}` : "—";
    const lignes = [...restantes, ...faites].map((t) => ligneTache(t)).join("");
    return carte(nom, lignes, complet ? "fait" : compte, complet ? "vert" : "ambre");
  }

  /** Cartes du quotidien : Matin + Soir toujours affichées (structure de la maquette), et une
   *  troisième carte « Sans moment » dès qu'une tâche quotidienne n'a pas encore de moment
   *  réglé OU qu'une ponctuelle sans récurrent est due ce jour — jamais de tâche cochable qui
   *  disparaîtrait de l'écran faute de réglage. */
  function cartesMoment(jour) {
    const sansMoment = (t) => (recDe(t)?.frequence === "quotidien" && !recDe(t)?.moment) || ponctuelle(t);
    const aSansMoment = regrouper(duJour(jour)).some(sansMoment) || faitesLe(jour).some(sansMoment);
    return carteMoment("Matin", "matin", jour) + carteMoment("Soir", "soir", jour)
      + (aSansMoment ? carteMoment("Sans moment", null, jour) : "");
  }

  /** Carte Semaine/Mois : avancement sur la période entière, la tâche se coche sur `jour` choisi.
   *  Les récurrents d'abord (une ligne par tâche, avancement `x/fois`), puis les occurrences
   *  ponctuelles sans récurrent dont l'échéance tombe en fin de cette période (une tâche « Ce
   *  jour » ajoutée un lundi vaut pour la semaine qui finit ce dimanche-là). */
  function cartePeriode(nom, frequence, jour) {
    const recs = etat.tachesRec.filter((r) => r.actif && r.frequence === frequence);
    const finPeriode = echeance(frequence, jour);
    const lignesRec = recs.map((r) => {
      const occs = etat.taches.filter((t) => t.recurrent_id === r.id && t.echeance === finPeriode);
      const faitesN = occs.filter((t) => t.fait_le).length;
      // Occurrence à cocher : la première non faite, sinon la dernière faite (annulation possible).
      const t = occs.find((x) => !x.fait_le) ?? occs.find((x) => x.fait_le) ?? occs[0];
      if (!t) return "";
      const complet = faitesN >= r.fois;
      const meta = complet ? "fait" : faitesN > 0 ? `${faitesN}/${r.fois}` : "—";
      return ligneTache(t, { metaDroite: meta, metaClasse: complet ? "vert" : faitesN > 0 ? "ambre" : "" });
    }).filter(Boolean);
    const lignesPonctuelles = etat.taches.filter((t) => ponctuelle(t) && t.echeance === finPeriode).map((t) => ligneTache(t));
    return carte(nom, [...lignesRec, ...lignesPonctuelles].join(""), "", "");
  }

  // ---------- détail (feuille / colonne PC) ----------
  function htmlDetail(t) {
    const r = recDe(t);
    const quand = t.fait_le ? new Date(t.fait_le).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : null;
    return `<div class="detail" data-id="${t.id}">
      ${enteteDetail(t.titre, r ? `${FREQUENCES[r.frequence]}${r.obligatoire ? " · obligatoire" : ""}` : "Hors liste")}
      <div class="detail-montant">
        <span class="mono grand">${txt(partsLigne(t))}</span>
        <span class="sous">${t.fait_le ? `Fait le ${quand}${t.qui ? ` par ${txt(t.qui)}${t.qui2 ? ` et ${txt(t.qui2)}` : ""}` : ""}.` : "Les parts vont à qui coche."}</span>
      </div>
      ${r?.consigne ? `<div class="detail-consigne"><span class="etiquette">Consigne</span><p class="texte-consigne">${txt(r.consigne)}</p></div>` : ""}
      <div class="detail-actions">
        ${t.fait_le ? '<button class="btn grandir" data-basculer>Annuler la coche</button>' : choixQui(membres(), null)}
      </div>
      ${r ? '<button class="btn-lien centre" data-vers-reglages>Modifier la tâche récurrente</button>' : ""}
    </div>`;
  }

  const liste = creerCheckList({
    ecran: "#ecran-jour", aside: ASIDE,
    trouver: (id) => etat.taches.find((t) => t.id === id),
    premier: () => duJour(jourSel)[0] ?? faitesLe(jourSel)[0],
    htmlDetail, rendre, echec: cb.echec,
    brancherDetail: (t, racine, { basculer, fermer }) => {
      for (const b of racine.querySelectorAll("[data-qui]")) b.addEventListener("click", () => basculer({ suivant: b.dataset.qui }));
      racine.querySelector("[data-vers-reglages]")?.addEventListener("click", () => { fermer(); montrerEcran("taches-rec"); });
    },
    basculer: {
      // Les parts se figent à la coche : lues AVANT de poser la date (L-008).
      figer: (t) => partsDe(recDe(t), t.qui ?? recDe(t)?.attribue_a ?? null),
      appliquer(t, figees, { suivant } = {}) {
        const r = recDe(t);
        // `suivant` vient du cycle (case tapée) ou du choix « Fait par » du détail.
        const cible = suivant !== undefined ? suivant : (t.fait_le ? null : etat.prenom);
        if (cible === null) Object.assign(t, { fait_le: null, qui: null, qui2: null, parts_quart: 0 });
        else if (cible === A_DEUX) {
          const [p1, p2] = membres();
          Object.assign(t, { fait_le: t.fait_le ?? new Date().toISOString(), qui: p1, qui2: p2, parts_quart: r.parts_quart });
        } else Object.assign(t, { fait_le: t.fait_le ?? new Date().toISOString(), qui: cible, qui2: null, parts_quart: figees });
        return { fait_le: t.fait_le, qui: t.qui, qui2: t.qui2, parts_quart: t.parts_quart };
      },
      ecrire: (id, champs) => api.majTache(id, champs),
      message: (t) => {
        if (!t.fait_le) return "Coche annulée.";
        const c = credit(t);
        return `Fait. ${Object.entries(c).map(([p, q]) => `${partsTexte(q)} part${q >= 8 ? "s" : ""} pour ${p}`).join(" et ")}.`;
      },
    },
  });

  // ---------- bande des 7 jours ----------
  function bandeJours() {
    const lundi = decalerJours(jourSel, -((depuisIso(jourSel).getDay() + 6) % 7));
    const jours = Array.from({ length: 7 }, (_, i) => decalerJours(lundi, i));
    const auj = jourIso(new Date());
    const [p1] = membres();
    return `<div class="bande-jours">${jours.map((j) => {
      const c = faitesLe(j).reduce((acc, t) => {
        for (const [p, q] of Object.entries(credit(t))) acc[p] = (acc[p] ?? 0) + q;
        return acc;
      }, {});
      const total = totalCredit(c);
      const pctP1 = total ? Math.round((partDe(c, p1) / total) * 100) : 50;
      const d = depuisIso(j);
      const classes = ["jour-bande", j === jourSel ? "jour-choisi" : "", j === auj && j !== jourSel ? "jour-auj" : "", j > auj ? "jour-futur" : ""].filter(Boolean).join(" ");
      const aria = `${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })}${j === auj ? ", aujourd’hui" : ""}`;
      return `<button type="button" class="${classes}" data-jour="${j}" aria-label="${txt(aria)}">
        <span class="jour-lettre">${d.toLocaleDateString("fr-FR", { weekday: "narrow" }).toUpperCase()}</span>
        <span class="jour-num">${d.getDate()}</span>
        <span class="jour-barre"><span style="width:${pctP1}%"></span></span>
      </button>`;
    }).join("")}</div>`;
  }

  // ---------- rendu ----------
  function rendre() {
    const jour = jourSel;
    const restantes = duJour(jour);
    const termines = faitesLe(jour);
    const [p1, p2] = membres();

    const oblRestants = regrouper(restantes).filter((t) => recDe(t)?.obligatoire).map((t) => t.titre);
    const d = depuisIso(jour);
    $("#titre-jour").textContent = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" }).replace(/^./, (c) => c.toUpperCase());
    $("#sous-jour").textContent = oblRestants.length
      ? `aujourd’hui · oblig. : ${oblRestants.join(", ")}`
      : restantes.length || termines.length ? "aujourd’hui · rien oublié aujourd’hui" : "aujourd’hui · rien de prévu";

    const c = termines.reduce((acc, t) => { for (const [p, q] of Object.entries(credit(t))) acc[p] = (acc[p] ?? 0) + q; return acc; }, {});
    const total = totalCredit(c);
    const pctP1 = total ? Math.round((partDe(c, p1) / total) * 100) : 50;
    $("#chiffres-jour").innerHTML = `<span class="mono repere-p1">${txt(p1?.[0] ?? "")} ${txt(partsTexte(partDe(c, p1)))}</span>
      <span class="barre-partagee"><span style="width:${pctP1}%"></span></span>
      <span class="mono repere-p2">${txt(partsTexte(partDe(c, p2)))} ${txt(p2?.[0] ?? "")}</span>`;

    $("#bande-jours-taches").innerHTML = bandeJours();
    for (const b of $("#bande-jours-taches").querySelectorAll("[data-jour]")) {
      b.addEventListener("click", () => { jourSel = b.dataset.jour; rendre(); });
    }

    $("#cartes-moment").innerHTML = `<div class="grille-cartes">${cartesMoment(jour)}</div>`;
    $("#cartes-periode").innerHTML = `<div class="grille-cartes">
      ${cartePeriode("Cette semaine", "hebdo", jour)}${cartePeriode("Ce mois", "mensuel", jour)}
    </div>`;

    $("#barre-faites").innerHTML = `<button type="button" class="barre-fait-bouton" id="bouton-plier-faites"
        aria-expanded="${faitesOuvertes}">
      <span class="fait-label">Fait · ${termines.length}</span>
      <span class="fait-pastilles">${termines.slice(0, 6).map((t) => {
        const q = Object.values(credit(t))[0] ?? 0;
        return `<span class="pastille-fait ${t.qui2 ? "case-cycle-deux" : t.qui === p1 ? "case-cycle-p1" : "case-cycle-p2"}">${txt(partsTexte(q))}</span>`;
      }).join("")}</span>
      <span class="fait-voir">${faitesOuvertes ? "Replier" : "Voir"}</span>
    </button>`;
    $("#bouton-plier-faites").addEventListener("click", () => { faitesOuvertes = !faitesOuvertes; rendre(); });

    $("#liste-faites-jour").hidden = !faitesOuvertes;
    if (faitesOuvertes) {
      $("#liste-faites-jour").innerHTML = termines.length
        ? `<div class="carte-taches">${termines.map((t) => ligneTache(t)).join("")}</div>`
        : '<p class="vide-carte">Rien de coché.</p>';
    }

    $("#badge-todo").textContent = String(auBesoinActives().length);

    liste.apresRendu();
    brancherCycles($("#ecran-jour"), (cle) => {
      const t = etat.taches.find((x) => x.id === Number(cle));
      if (!t) return;
      liste.basculer(t.id, { suivant: suivante(valeursCycle(recDe(t)), valeurCourante(t)) });
    });
    // apresRendu() ouvre le détail via brancherCoches(), qui ne connaît que .mvt[data-id] : nos
    // lignes portent leur propre layout (.ligne-tache), donc on branche nous-même l'ouverture au
    // tap sur la ligne. La case-cycle stoppe sa propagation (blocs-cycle.js), pas de conflit.
    for (const el of $("#ecran-jour").querySelectorAll(".ligne-tache[data-id]")) {
      el.addEventListener("click", () => { if (Number(el.dataset.id) > 0) liste.ouvrirDetail(Number(el.dataset.id)); });
    }
  }

  // ---------- Todo : travaux sans date (tâches récurrentes « au besoin ») ----------
  const auBesoinActives = () => etat.tachesRec.filter((r) => r.actif && r.frequence === "au_besoin");

  /** Tâche « au besoin » cochée depuis le Todo : créée déjà faite, par moi, maintenant. */
  async function faireDepuisTodo(recId) {
    const r = etat.tachesRec.find((x) => x.id === recId);
    if (!r) return;
    try {
      const rang = 1 + etat.taches.filter((x) => x.recurrent_id === r.id && x.echeance === jourSel).length;
      const [t] = await api.creerTaches([{ recurrent_id: r.id, titre: r.titre, categorie: r.categorie,
        echeance: jourSel, rang, qui: etat.prenom, fait_le: new Date().toISOString(), parts_quart: r.parts_quart }]);
      etat.taches.push(t);
      fermerFeuille();
      rendre();
      toast(`${r.titre} : ${partsTexte(r.parts_quart)} part${r.parts_quart >= 8 ? "s" : ""} pour ${etat.prenom}.`);
    } catch (e) { cb.echec(e); }
  }

  /** Dernière occurrence connue d'un récurrent « au besoin » (pour la méta « fait par … »
   *  de la feuille Todo). Les occurrences faites restent en base (D-024 : pas de suppression
   *  qui perdrait l'historique), donc la plus récente par échéance suffit. */
  const derniereOccurrence = (recId) => etat.taches.filter((t) => t.recurrent_id === recId)
    .sort((a, b) => b.echeance.localeCompare(a.echeance))[0] ?? null;

  /** Feuille « Travaux en attente » (§8 du handoff) : liste sans date, case 19 px, titre 14 px,
   *  méta 11 px (« fait par Claudia » si une occurrence récente existe, sinon la catégorie —
   *  la date d'ajout n'est pas stockée en base, cf. rapport), bouton en tirets pour en ajouter. */
  function ouvrirTodo() {
    const items = auBesoinActives();
    const ligne = (r) => {
      const derniere = derniereOccurrence(r.id);
      const fait = derniere?.fait_le;
      const meta = fait ? `fait par ${txt(derniere.qui)}${derniere.qui2 ? ` et ${txt(derniere.qui2)}` : ""}` : txt(r.categorie);
      return `<div class="ligne-todo" data-todo="${r.id}">
        <span class="case-todo${fait ? " case-todo-faite" : ""}" aria-hidden="true">${fait ? "✓" : ""}</span>
        <div class="todo-corps">
          <span class="todo-titre${fait ? " fait" : ""}">${txt(r.titre)}</span>
          <span class="todo-meta">${meta}</span>
        </div>
        <span class="mono todo-parts">${txt(partsTexte(r.parts_quart))}</span>
      </div>`;
    };
    ouvrirFeuille(`<div class="entete-feuille-todo">
        <h2 class="feuille-titre">Travaux en attente</h2>
        <span class="sous">sans date · comptent en parts</span>
      </div>
      <div class="liste-todo">${items.length ? items.map(ligne).join("") : '<p class="vide">Aucun travail en attente.</p>'}</div>
      <button type="button" class="btn-tirets" id="btn-ajouter-todo">+ Ajouter aux travaux</button>`);
    for (const el of $("#feuille-corps").querySelectorAll("[data-todo]")) {
      el.addEventListener("click", () => faireDepuisTodo(Number(el.dataset.todo)));
    }
    $("#btn-ajouter-todo").addEventListener("click", () => ouvrirAjout?.({ cad: "todo" }));
  }

  $("#segment-vue-taches")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-vue]");
    if (b) montrerEcran(b.dataset.vue);
  });
  $("#btn-todo")?.addEventListener("click", ouvrirTodo);
  $("#btn-ajouter-tache")?.addEventListener("click", () => ouvrirAjout?.());

  return {
    rendre, fermerDetail: liste.fermerDetail,
    jourSelectionne: () => jourSel,
    allerAuJour: (j) => { jourSel = j; montrerEcran("jour"); },
  };
}
