// Écran « Tâches · Semaine » : grille tâches × jours, bandeaux de cadence, carte KPI
// Obligatoire. Le cycle de coche est le même qu'au jour (blocs-cycle + creerCheckList,
// D-024) ; une cellule sait juste calculer sa propre valeur suivante à partir de l'occurrence
// qu'elle représente. Tap sur la lettre du jour = ouvre l'écran Jour sur ce jour-là.

import { $, txt, montrerEcran } from "../socle/ui-base.js";
import { creerFileEcritures } from "../socle/blocs.js";
import { boutonCycle, brancherCycles, suivante } from "../socle/blocs-cycle.js";
import { partsTexte, partsDe, balance, jourIso, depuisIso, decalerJours, echeance } from "./taches.js";

const A_DEUX = "_deux";
const CADENCES = [["quotidien", "Chaque jour"], ["hebdo", "Cette semaine"], ["mensuel", "Ce mois"]];

export function creerUiTachesSemaine(api, etat, cb, ui) {
  const membres = () => etat.membres.map((m) => m.prenom);
  const enFile = creerFileEcritures();

  const valeursCycle = (r) => (r?.partageable ? [null, ...membres(), A_DEUX] : [null, ...membres()]);
  const valeurCourante = (t) => (!t?.fait_le ? null : t.qui2 ? A_DEUX : t.qui);
  function renduCellule(valeur) {
    if (valeur === null) return { libelle: "", classe: "cellule-vide" };
    if (valeur === A_DEUX) return { libelle: "CY", classe: "case-cycle-deux" };
    const [p1] = membres();
    return { libelle: valeur[0].toUpperCase(), classe: valeur === p1 ? "case-cycle-p1" : "case-cycle-p2" };
  }

  /** Occurrences de `r` à considérer pour la semaine affichée :
   *  - quotidien : une échéance par jour (7 occurrences possibles, une par jour) ;
   *  - hebdo/mensuel : une seule échéance (fin de période), jusqu'à `fois` occurrences (rangs)
   *    dont la coche s'affiche sur le jour de leur `fait_le`, pas sur l'échéance elle-même. */
  function occurrencesPeriode(r, jours) {
    if (r.frequence === "quotidien") return etat.taches.filter((t) => t.recurrent_id === r.id && jours.includes(t.echeance));
    const e = echeance(r.frequence, jours[jours.length - 1]);
    return etat.taches.filter((t) => t.recurrent_id === r.id && t.echeance === e);
  }

  const virtuelle = (r, e) => ({ id: -r.id, recurrent_id: r.id, titre: r.titre, echeance: e, rang: 0,
    fait_le: null, qui: null, qui2: null, parts_quart: r.parts_quart, categorie: r.categorie });

  /** Occurrence que la cellule (r, j) affiche : celle échue ce jour (quotidien) ou faite ce
   *  jour-là (hebdo/mensuel, où seul `fait_le` dit le jour réel) ; virtuelle si rien encore. */
  function occurrenceAffichee(r, j, occs) {
    if (r.frequence === "quotidien") return occs.find((t) => t.echeance === j) ?? virtuelle(r, j);
    return occs.find((t) => t.fait_le && jourIso(new Date(t.fait_le)) === j) ?? virtuelle(r, echeance(r.frequence, j));
  }

  /** Occurrence à créer/modifier quand on tape la cellule (r, j) : celle déjà affichée si elle
   *  existe (annulation), sinon la première occurrence du groupe pas encore faite (hebdo/mensuel :
   *  n'importe quel rang libre peut se cocher sur ce jour), sinon la virtuelle du jour tapé. */
  function occurrenceACocher(r, j, occs) {
    const affichee = occurrenceAffichee(r, j, occs);
    if (affichee.id > 0) return affichee;
    if (r.frequence === "quotidien") return affichee;
    return occs.find((t) => !t.fait_le) ?? affichee;
  }

  function cellule(r, j, auj, occs) {
    const t = occurrenceAffichee(r, j, occs);
    const futur = j > auj;
    return boutonCycle({
      cle: `${r.id}|${j}`, valeurs: valeursCycle(r), valeur: valeurCourante(t),
      rendu: renduCellule, classe: `cellule-semaine${futur ? " cellule-future" : ""}`, taille: "jour",
    });
  }

  /** Une ligne de la grille : titre (ambre + `2/3` si hebdo multi-occurrences non atteint), 7 cellules. */
  function ligneGrille(r, jours, auj) {
    const occs = occurrencesPeriode(r, jours);
    const cellules = jours.map((j) => cellule(r, j, auj, occs));
    let suffixe = "";
    let ambre = false;
    if (r.frequence !== "quotidien" && r.fois > 1) {
      const faites = occs.filter((t) => t.fait_le).length;
      suffixe = ` ${faites}/${r.fois}`;
      ambre = faites < r.fois;
    }
    return `<div class="ligne-grille-semaine">
      <span class="titre-grille${ambre ? " titre-ambre" : ""}">${txt(r.titre)}${txt(suffixe)}</span>
      ${cellules.join("")}
    </div>`;
  }

  function bandeauCadence(nom, recs, compte) {
    return `<div class="bandeau-cadence"><span>${txt(nom)}</span><span class="mono">${txt(compte)}</span></div>`;
  }

  function enteteJours(jours, auj) {
    return `<div class="ligne-grille-semaine ligne-entete-semaine">
      <span class="titre-grille-entete">Tâche</span>
      ${jours.map((j) => {
        const d = depuisIso(j);
        const classes = ["lettre-jour-semaine", j === auj ? "lettre-jour-auj" : ""].filter(Boolean).join(" ");
        return `<button type="button" class="${classes}" data-ouvrir-jour="${j}"
          aria-label="Ouvrir ${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" })}">${d.toLocaleDateString("fr-FR", { weekday: "narrow" }).toUpperCase()}</button>`;
      }).join("")}
    </div>`;
  }

  /** Détail par catégorie, sur la semaine affichée : une ligne = une catégorie, barre
   *  partagée Claudia/Yann — reprend l'ex-écran Balance (D-023), sans sélecteur de période
   *  puisque la semaine est déjà choisie en haut de l'écran. `b.parCategorie` vient de
   *  `balance()` (taches.js), jamais recalculé ici. */
  function detailCategories(b, p1, p2) {
    const couleur = (p) => (p === p1 ? "var(--claudia)" : "var(--bleu)");
    const somme = (v) => Object.values(v).reduce((s, n) => s + n, 0);
    const cats = Object.entries(b.parCategorie).sort((x, y) => somme(y[1]) - somme(x[1]));
    if (!cats.length) return `<section class="carte"><h3>Par catégorie</h3><p class="vide">Rien à montrer.</p></section>`;
    return `<section class="carte">
      <h3>Par catégorie</h3>
      <div class="pile-cats">${cats.map(([cat, v]) => `<div class="cat-ligne">
        <div class="cat-tete"><span>${txt(cat)}</span>
          <span class="sous">${txt(p1)} ${partsTexte(v[p1] ?? 0)} · ${txt(p2)} ${partsTexte(v[p2] ?? 0)}</span></div>
        <div class="barre-h fine">
          <span style="width:${((v[p1] ?? 0) / somme(v)) * 100}%;background:${couleur(p1)}"></span>
          <span style="width:${((v[p2] ?? 0) / somme(v)) * 100}%;background:${couleur(p2)}"></span>
        </div>
      </div>`).join("")}</div>
      <p class="sous"><span class="puce-legende" style="background:${couleur(p1)};margin-right:4px"></span>${txt(p1)}
        <span class="puce-legende" style="background:${couleur(p2)};margin:0 4px 0 10px"></span>${txt(p2)}</p>
    </section>`;
  }

  function rendre() {
    const jourRef = ui.jourSelectionne();
    const lundi = decalerJours(jourRef, -((depuisIso(jourRef).getDay() + 6) % 7));
    const jours = Array.from({ length: 7 }, (_, i) => decalerJours(lundi, i));
    const auj = jourIso(new Date());
    const [p1, p2] = membres();

    const pctEntier = (n) => `${Math.round(n * 100)} %`;
    const b = balance(etat.taches, etat.tachesRec, membres(), jours[0], jours[6]);
    $("#titre-semaine").textContent = `Semaine du ${depuisIso(jours[0]).getDate()} ${depuisIso(jours[0]).toLocaleDateString("fr-FR", { month: "short" })}`;
    $("#sous-semaine").textContent = `${txt(p1)} ${pctEntier(b.ratio[p1] ?? 0)} · ${txt(p2)} ${pctEntier(b.ratio[p2] ?? 0)}`;
    $("#total-semaine").textContent = `${partsTexte(b.total)} part${b.total >= 8 ? "s" : ""}`;

    // ---------- KPI Obligatoire ----------
    const bo = balance(etat.taches, etat.tachesRec, membres(), jours[0], jours[6], { obligatoireSeul: true });
    const totalO = bo.total;
    const phrase = !totalO ? "rien de coché cette semaine"
      : Math.abs((bo.ratio[p1] ?? 0) - (bo.ratio[p2] ?? 0)) < 0.05 ? "à parts égales cette semaine"
      : (bo.ratio[p1] ?? 0) > (bo.ratio[p2] ?? 0) ? `${txt(p1)} en assure ${Math.round((bo.ratio[p1] ?? 0) * 100)} %`
      : `${txt(p2)} en assure ${Math.round((bo.ratio[p2] ?? 0) * 100)} %`;
    const pctO1 = totalO ? Math.round(((bo.parts[p1] ?? 0) / totalO) * 100) : 50;
    $("#kpi-obligatoire").innerHTML = `
      <div class="kpi-oblig-ligne1"><span class="kpi-oblig-etiquette">Obligatoire</span><span class="kpi-oblig-phrase">${txt(phrase)}</span></div>
      <div class="kpi-oblig-ligne2">
        <span class="mono repere-p1">${txt(p1[0])} ${txt(partsTexte(bo.parts[p1] ?? 0))}</span>
        <span class="barre-partagee barre-fine"><span style="width:${pctO1}%"></span></span>
        <span class="mono repere-p2">${txt(partsTexte(bo.parts[p2] ?? 0))} ${txt(p2[0])}</span>
      </div>`;

    // ---------- grille ----------
    let html = enteteJours(jours, auj);
    for (const [cle, nom] of CADENCES) {
      const recs = etat.tachesRec.filter((r) => r.actif && r.frequence === cle);
      if (!recs.length) continue;
      const compte = cle === "quotidien"
        ? `${jours.reduce((s, j) => s + etat.taches.filter((t) => t.echeance === j && t.fait_le && recs.some((r) => r.id === t.recurrent_id)).length, 0)} cochées`
        : `${recs.filter((r) => { const e = echeance(cle === "hebdo" ? "hebdo" : "mensuel", jours[6]); return etat.taches.some((t) => t.recurrent_id === r.id && t.echeance === e && t.fait_le); }).length}/${recs.length}`;
      html += bandeauCadence(nom, recs, compte) + recs.map((r) => ligneGrille(r, jours, auj)).join("");
    }
    $("#grille-semaine").innerHTML = html;

    // ---------- détail par catégorie (ex-écran Balance, D-023 : la vue qui dit « Claudia
    // fait toute la cuisine » — sans onglet dédié, sur la semaine déjà choisie ci-dessus). ----------
    $("#detail-categories-semaine").innerHTML = detailCategories(b, p1, p2);

    for (const b2 of $("#grille-semaine").querySelectorAll("[data-ouvrir-jour]")) {
      b2.addEventListener("click", () => ui.allerAuJour(b2.dataset.ouvrirJour));
    }
    brancherCycles($("#ecran-semaine"), (cle) => {
      const [recId, j] = cle.split("|");
      const r = etat.tachesRec.find((x) => x.id === Number(recId));
      if (!r) return;
      const occs = occurrencesPeriode(r, jours);
      const affichee = occurrenceAffichee(r, j, occs);
      const cible = occurrenceACocher(r, j, occs);
      const suivant = suivante(valeursCycle(r), valeurCourante(affichee));
      basculerCellule(r, cible, suivant, j);
    });
  }

  /** Bascule une cellule : si l'occurrence n'existe pas encore (id négatif), la créer d'abord, au
   *  prochain rang libre du groupe — le jour ne l'aura pas forcément matérialisée si on modifie un
   *  jour futur ou passé depuis la semaine. Écriture optimiste avec rollback, sérialisée par tâche
   *  (D-026, L-008 : les parts figées sont lues via calculerChamps AVANT toute mutation de `cible`). */
  async function basculerCellule(r, t, suivant, j) {
    let cible = t;
    if (t.id < 0) {
      try {
        const rang = 1 + etat.taches.filter((x) => x.recurrent_id === r.id && x.echeance === t.echeance).length;
        const [creee] = await api.creerTaches([{ recurrent_id: r.id, titre: r.titre, categorie: r.categorie,
          echeance: t.echeance, rang, qui: null }]);
        etat.taches.push(creee);
        cible = creee;
      } catch (e) { return cb.echec(e); }
    }
    const avant = { fait_le: cible.fait_le, qui: cible.qui, qui2: cible.qui2, parts_quart: cible.parts_quart };
    const champs = calculerChamps(r, cible, suivant, j);
    Object.assign(cible, champs);
    rendre();
    try {
      await enFile(cible.id, () => api.majTache(cible.id, champs));
    } catch (e) {
      Object.assign(cible, avant);
      rendre();
      cb.echec(e);
    }
  }

  /** `fait_le` porte le jour tapé (midi, pour rester ce jour-là quel que soit le fuseau d'affichage),
   *  pas l'instant présent : cocher mardi depuis la grille doit rester affiché sous mardi. */
  const dateDuJour = (j) => { const d = depuisIso(j); d.setHours(12, 0, 0, 0); return d.toISOString(); };

  function calculerChamps(r, t, suivant, j) {
    if (suivant === null) return { fait_le: null, qui: null, qui2: null, parts_quart: 0 };
    if (suivant === A_DEUX) {
      const [p1, p2] = membres();
      return { fait_le: t.fait_le ?? dateDuJour(j), qui: p1, qui2: p2, parts_quart: r.parts_quart };
    }
    return { fait_le: t.fait_le ?? dateDuJour(j), qui: suivant, qui2: null, parts_quart: partsDe(r, suivant) };
  }

  $("#segment-vue-taches-semaine")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-vue]");
    if (b) montrerEcran(b.dataset.vue);
  });

  return { rendre };
}
