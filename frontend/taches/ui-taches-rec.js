// Écran « Réglages · Tâches » du module Tâches : un tableau par THÈME (la catégorie : Cuisine,
// Ménage…), où chaque colonne est un bouton-cycle (D-024, blocs-cycle.js) — l'effet est
// immédiat et se propage partout, pas de feuille à ouvrir pour changer une valeur. La feuille
// en formulaire (blocs-reglages.js) reste pour créer une tâche et pour les champs longs (titre,
// catégorie, consigne, fréquence). Arbitrages de cette présentation : D-038.
//
// Piège D-026 : un tap répété sur un cycle (parts, oblig., rythme) part en écriture optimiste
// à chaque geste. Sans file, deux écritures rapprochées du même réglage pourraient arriver dans
// le désordre et laisser la base sur un état antérieur au dernier tap. `creerFileEcritures()`
// sérialise par tâche (clé = id du récurrent), comme le fait déjà l'écran Semaine.

import { $, txt, ouvrirFeuille } from "../socle/ui-base.js";
import { creerFileEcritures } from "../socle/blocs.js";
import { boutonCycle, brancherCycles, suivante } from "../socle/blocs-cycle.js";
import { creerReglages } from "../socle/blocs-reglages.js";
import { champ, zone, select, caseACocher, listeChoix, membresOptions, lire } from "../socle/blocs-form.js";
import { FREQUENCES, ECHELLE_QUART, partsTexte, parts } from "./taches.js";

// Dans un thème : le quotidien d'abord, puis la semaine, le mois, l'au-besoin.
const ORDRE_FREQUENCES = ["quotidien", "hebdo", "mensuel", "au_besoin"];
const PAR_PERIODE = { quotidien: "j", hebdo: "sem.", mensuel: "mois" };
const CYCLE_MINUTES = [5, 10, 15, 20, 30, 45, 60, 90];
const CYCLE_FOIS = [1, 2, 3, 4, 5, 7];

export function creerUiTachesRec(api, etat, cb) {
  const enFile = creerFileEcritures();
  const actives = () => etat.tachesRec.filter((r) => r.actif);
  const categories = () => [...new Set(etat.tachesRec.map((r) => r.categorie))];
  const membres = () => etat.membres.map((m) => m.prenom);

  // ---------- petits cycles sous le titre : minutes, moment, part équiv/spé ----------
  const renduMinutes = (v) => (v ? `${v}′` : "—");
  // Moment (matin/soir) : seules les tâches quotidiennes alimentent les deux cartes de l'écran
  // Jour (012_moment.sql) — un cycle « Matin → Soir → — » pour régler ça sans quitter le tableau.
  const renduMoment = (v) => (v === "matin" ? "Matin" : v === "soir" ? "Soir" : "—");
  const renduPartSpe = (v) => ({ libelle: v ? "Part spé." : "Part équiv.", classe: v ? "rp-spe-actif" : "" });

  // ---------- colonnes du tableau ----------
  function renduParts(q) {
    const classe = q >= 20 ? "cycle-plein" : q >= 8 ? "cycle-clair" : "";
    return { libelle: partsTexte(q), classe };
  }
  const renduOblig = (v) => (v ? { libelle: "Oui", classe: "cycle-actif-rouge" } : { libelle: "—", classe: "cycle-inactif" });
  /** « 2×/j », « 3×/sem. », « 1×/mois » : le nombre de fois ET la période, lisibles sans
   *  en-tête à décoder. C'est un minimum, pas un plafond. */
  const renduRythme = (r) => (n) => `${n}×/${PAR_PERIODE[r.frequence]}`;

  /** Part spé : une ligne sous la tâche, un cycle par personne sur l'échelle (D-038). */
  const lignePartSpe = (r) => `<div class="rp-spe">
      <span class="rp-spe-titre">Parts de chacun</span>
      ${membres().map((p) => `<span class="rp-spe-personne">${txt(p)}
        ${boutonCycle({ cle: `spep|${r.id}|${p}`, valeurs: ECHELLE_QUART, valeur: r.parts_spe[p] ?? r.parts_quart, rendu: renduParts, taille: "reglage", classe: "cible44" })}
      </span>`).join("")}
    </div>`;

  /** Une ligne : titre (bouton, tap = feuille de modification, D-036 décision 5) + petits
   *  cycles texte, puis Parts / Oblig. / Rythme. Modifier les champs longs et retirer la tâche
   *  se fait dans la feuille (bouton « Retirer » en pied) — pas de deuxième liste (D-024). */
  function ligneTableau(r) {
    const spe = !!r.parts_spe;
    return `<div class="ligne-reglage-parts" data-id="${r.id}">
      <div class="rp-titre">
        <button type="button" class="rp-nom" data-ouvrir-form="${r.id}">${txt(r.titre)}</button>
        <span class="rp-mini">
          ${boutonCycle({ cle: `minutes|${r.id}`, valeurs: CYCLE_MINUTES, valeur: r.minutes ?? 0, rendu: renduMinutes, classe: "rp-bouton-texte", taille: "mini" })}
          ${r.frequence === "quotidien"
            ? boutonCycle({ cle: `moment|${r.id}`, valeurs: ["matin", "soir", null], valeur: r.moment ?? null, rendu: renduMoment, classe: "rp-bouton-texte rp-moment", taille: "mini" })
            : ""}
          ${boutonCycle({ cle: `spe|${r.id}`, valeurs: [false, true], valeur: spe, rendu: renduPartSpe, classe: "rp-bouton-texte rp-part-spe", taille: "mini" })}
        </span>
      </div>
      ${spe
        ? '<span class="rp-fige cible44" aria-label="Parts propres à chacun, réglées dessous">spé.</span>'
        : boutonCycle({ cle: `parts|${r.id}`, valeurs: ECHELLE_QUART, valeur: r.parts_quart, rendu: renduParts, taille: "reglage", classe: "cible44" })}
      ${boutonCycle({ cle: `oblig|${r.id}`, valeurs: [false, true], valeur: r.obligatoire, rendu: renduOblig, taille: "reglage", classe: "cible44" })}
      ${r.frequence === "au_besoin"
        ? '<span class="rp-fige rp-rythme cible44">au besoin</span>'
        : boutonCycle({ cle: `fois|${r.id}`, valeurs: CYCLE_FOIS, valeur: r.fois ?? 1, rendu: renduRythme(r), taille: "reglage", classe: "cible44 rp-rythme" })}
      ${spe ? lignePartSpe(r) : ""}
    </div>`;
  }

  /** Thèmes dans l'ordre de leur première tâche (`ordre`), tâches triées par cadence puis ordre. */
  function themes() {
    const triees = [...actives()].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.id - b.id);
    const parTheme = new Map();
    for (const r of triees) parTheme.set(r.categorie, [...(parTheme.get(r.categorie) ?? []), r]);
    const rang = (r) => ORDRE_FREQUENCES.indexOf(r.frequence);
    return [...parTheme].map(([nom, recs]) => [nom, [...recs].sort((a, b) => rang(a) - rang(b))]);
  }

  const tableauTheme = ([nom, recs]) => `<section class="carte bloc-cadence">
      <div class="carte-tete entete-reglage-parts">
        <span>${txt(nom)}</span><span>Parts</span><span>Oblig.</span><span>Rythme</span>
      </div>
      ${recs.map(ligneTableau).join("")}
    </section>`;

  /** L'explication tient dans une feuille ouverte par le « ? » de l'en-tête : l'écran montre
   *  le tableau d'abord (D-038). Texte seulement (`.carte-explication` du socle). Le dépôt
   *  écrit « le petit », jamais le prénom de l'enfant (invariant 1). */
  function ouvrirAide() {
    ouvrirFeuille(`<h2 class="feuille-titre">Comment on compte</h2>
      <div class="carte-explication">
        <p><strong>Parts</strong> : <span class="mono">${ECHELLE_QUART.map(partsTexte).join(" · ")}</span>.
          Le temps et le relou dans un seul chiffre : 0,5 le lait du soir, 8 la salle de bain.</p>
        <p><span class="accent-rouge">Oblig.</span> : pas négociable (le petit habillé, lavé, nourri).
          Compté à part dans la semaine.</p>
        <p><strong>Rythme</strong> : le minimum, 2×/j, 3×/sem. ou 1×/mois. Une fois de plus
          s'ajoute avec « + Ajouter ».</p>
        <p><span class="accent-bleu">Part spé.</span> : la tâche ne coûte pas pareil aux deux,
          chacun a ses parts.</p>
        <p><strong>À deux</strong> : se choisit en cochant. Chacun prend ses parts, ou ⅔ · ⅓
          s'il en a fait moins.</p>
        <p>Les minutes sous le titre sont un repère, hors calcul.</p>
      </div>`);
  }

  function rendreTableau() {
    $("#tableau-taches-parts").innerHTML = themes().map(tableauTheme).join("")
      || '<p class="vide">Aucune tâche récurrente.</p>';
    brancherCycles($("#tableau-taches-parts"), surCycle);
    for (const b of $("#tableau-taches-parts").querySelectorAll("[data-ouvrir-form]")) {
      b.addEventListener("click", () => reglages.formulaire(actives().find((r) => r.id === Number(b.dataset.ouvrirForm)) ?? null));
    }
  }

  /** Applique le geste d'un cycle : écriture optimiste + rollback, sérialisée par tâche (D-026). */
  async function surCycle(cle) {
    const [champNom, idTxt, prenom] = cle.split("|");
    const id = Number(idTxt);
    const r = etat.tachesRec.find((x) => x.id === id);
    if (!r) return;
    const patch = calculerPatch(champNom, r, prenom);
    if (!patch) return;
    const avant = { ...r };
    Object.assign(r, patch);
    rendreTableau();
    try {
      await enFile(id, () => api.majTacheRec(id, patch));
    } catch (e) {
      Object.assign(r, avant);
      rendreTableau();
      cb.echec(e);
    }
  }

  function calculerPatch(champNom, r, prenom) {
    if (champNom === "parts") return { parts_quart: suivante(ECHELLE_QUART, r.parts_quart) };
    if (champNom === "oblig") return { obligatoire: !r.obligatoire };
    if (champNom === "fois") return r.frequence === "au_besoin" ? null : { fois: suivante(CYCLE_FOIS, r.fois ?? 1) };
    if (champNom === "minutes") return { minutes: suivante([0, ...CYCLE_MINUTES], r.minutes ?? 0) || null };
    if (champNom === "moment") return { moment: suivante(["matin", "soir", null], r.moment ?? null) };
    // Part spé : chacun part des parts communes ; revenir en équiv efface le détail.
    if (champNom === "spe") return { parts_spe: r.parts_spe ? null : Object.fromEntries(membres().map((p) => [p, r.parts_quart])) };
    if (champNom === "spep" && r.parts_spe) {
      return { parts_spe: { ...r.parts_spe, [prenom]: suivante(ECHELLE_QUART, r.parts_spe[prenom] ?? r.parts_quart) } };
    }
    return null;
  }

  // ---------- formulaire en feuille : création, champs longs, et Modifier / Retirer ----------
  // Pas de liste séparée (D-036 décision 5) : le tableau au-dessus ouvre `formulaire(el)` au tap
  // sur le titre d'une ligne ; le bouton « + Nouvelle tâche récurrente » reste la seule entrée
  // de création, en tirets sous les cartes (`#form-tache-rec`, avant la légende).
  const reglages = creerReglages({
    bouton: "#form-tache-rec", libelleNouveau: "+ Nouvelle tâche récurrente",
    elements: actives,
    retirerDansFeuille: true,
    titreForm: (r) => (r ? "Modifier la tâche" : "Nouvelle tâche récurrente"),
    htmlForm: (r) => `
      ${champ("titre", "Titre", { valeur: r?.titre, requis: true })}
      ${champ("categorie", "Thème", { valeur: r?.categorie ?? "Maison", attrs: 'list="cats-rec"' })}
      ${listeChoix("cats-rec", categories())}
      ${select("frequence", "Fréquence minimale", Object.entries(FREQUENCES), r?.frequence ?? "quotidien")}
      ${champ("fois", "Combien de fois par période, au moins", { type: "number", valeur: r?.fois ?? 1, attrs: 'min="1" max="10"' })
        .replace("<label>", "<label data-si-periode>")}
      ${select("parts_quart", "Parts", ECHELLE_QUART.map((q) => [q, parts(q)]), r?.parts_quart ?? 4)}
      ${champ("minutes", "Minutes indicatives (repère, hors calcul)", { type: "number", valeur: r?.minutes ?? "", attrs: 'min="1" max="240"' })}
      ${select("attribue_a", "Attribuée d’habitude à", membresOptions(etat), r?.attribue_a, { vide: "Personne en particulier" })}
      ${caseACocher("obligatoire", "Obligatoire — pas négociable", r?.obligatoire)}
      ${zone("consigne", "Consigne", r?.consigne)}`,
    apresOuverture: (form) => {
      const majVisibilite = () => { form.querySelector("[data-si-periode]").hidden = form.frequence.value === "au_besoin"; };
      form.frequence.addEventListener("change", majVisibilite);
      majVisibilite();
    },
    champs: (form) => {
      const v = lire(form, { nombres: ["fois", "parts_quart", "minutes"], booleens: ["obligatoire"] });
      return {
        titre: v.titre, categorie: v.categorie ?? "Maison", frequence: v.frequence,
        fois: v.frequence === "au_besoin" ? 1 : Math.max(1, v.fois || 1),
        parts_quart: ECHELLE_QUART.includes(v.parts_quart) ? v.parts_quart : 4,
        minutes: v.minutes, attribue_a: v.attribue_a, obligatoire: v.obligatoire, consigne: v.consigne,
      };
    },
    api: {
      creer: async (valeurs) => {
        etat.tachesRec.push(await api.creerTacheRec({ ...valeurs, actif: true, ordre: etat.tachesRec.length + 1 }));
        rendreTableau();
      },
      maj: async (id, valeurs) => { await api.majTacheRec(id, valeurs); rendreTableau(); },
      // Désactivation, pas suppression : l'historique des parts reste lisible.
      retirer: async (r) => { await api.majTacheRec(r.id, { actif: false }); r.actif = false; rendreTableau(); },
    },
    apresEcriture: () => cb.rafraichir("taches"),
    confirmerRetrait: (r) => `Retirer « ${r.titre} » ? Les tâches déjà faites restent comptées.`,
    messageRetrait: "Tâche retirée.",
    echec: cb.echec,
  });

  function rendre() {
    reglages.rendre();
    rendreTableau();
  }

  $("#btn-aide-parts")?.addEventListener("click", ouvrirAide);

  // Le FAB « + Ajouter » des écrans Jour et Semaine ouvre la feuille d'ajout d'occurrence
  // (ui-taches-ajout.js) ; ce formulaire-ci reste la seule création de tâche RÉCURRENTE (D-024).
  return { rendre, ouvrirAjout: () => reglages.formulaire(null) };
}
