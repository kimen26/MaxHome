// Écran « Réglages · Tâches » : une LISTE À LIRE, une FICHE POUR SAISIR (D-041). Une ligne par
// tâche, rangée par thème : le titre, quand, le temps. Tap sur la ligne = la fiche
// (ui-taches-fiche.js) dans le cycle CRUD du socle (blocs-reglages.js, D-024). Plus de boutons
// à taper dans la ligne : on voyait mal ce qui se lisait et ce qui se réglait (retour de Yann).
// Les étapes ne s'affichent pas dans la liste (« 3 étapes ») : elles s'ouvrent depuis la fiche
// de leur tâche.

import { $, txt, ouvrirFeuille } from "../socle/ui-base.js";
import { creerReglages } from "../socle/blocs-reglages.js";
import { texteQuand, texteTemps, etapesDe } from "./rythme.js";
import { htmlFiche, brancherFiche, lireFiche } from "./ui-taches-fiche.js";

// Dans un thème : le quotidien d'abord, puis la semaine, le mois, l'au-besoin.
const ORDRE_FREQUENCES = ["quotidien", "hebdo", "mensuel", "au_besoin"];

export function creerUiTachesRec(api, etat, cb) {
  const actives = () => etat.tachesRec.filter((r) => r.actif);
  const principales = () => actives().filter((r) => !r.parent_id);
  const categories = () => [...new Set(principales().map((r) => r.categorie))];
  const parId = (id) => etat.tachesRec.find((r) => r.id === id) ?? null;
  // Nouvelle étape en cours de création : la fiche vide doit savoir de quelle tâche elle dépend.
  let parentNouvelleEtape = null;

  /** Temps affiché à droite : « 15′ », « C 20′ · Y 15′ », « 5′ à 40′ », ou la somme des étapes. */
  function texteTempsLigne(r) {
    const etapes = etapesDe(r, etat.tachesRec).filter((e) => !e.facultatif);
    if (etapes.length) return texteTemps(etapes.reduce((s, e) => s + (e.minutes ?? 0), 0));
    if (r.variantes?.length) {
      const m = r.variantes.map((v) => v.minutes);
      return `${texteTemps(Math.min(...m))} à ${texteTemps(Math.max(...m))}`;
    }
    if (r.parts_spe) return etat.membres.map((p) => `${p.prenom[0]} ${texteTemps(Math.round(((r.parts_spe[p.prenom] ?? r.parts_quart) * 5) / 4))}`).join(" · ");
    return texteTemps(r.minutes);
  }

  function ligne(r) {
    const nbEtapes = etapesDe(r, etat.tachesRec).length;
    const details = [texteQuand(r), r.repetable ? "répétable" : "", nbEtapes ? `${nbEtapes} étapes` : ""].filter(Boolean).join(" · ");
    return `<button type="button" class="ligne-tr" data-ouvrir="${r.id}">
      <span class="ligne-tr-corps">
        <span class="ligne-tr-titre">${txt(r.titre)}</span>
        <span class="ligne-tr-quand">${r.obligatoire ? '<span class="etiquette-oblig">oblig.</span> ' : ""}${txt(details)}</span>
      </span>
      <span class="ligne-tr-temps mono">${txt(texteTempsLigne(r))}</span>
    </button>`;
  }

  /** Thèmes dans l'ordre de leur première tâche (`ordre`), tâches triées par rythme puis ordre. */
  function themes() {
    const rang = (r) => ORDRE_FREQUENCES.indexOf(r.frequence);
    const triees = [...principales()].sort((a, b) => rang(a) - rang(b) || (a.ordre ?? 0) - (b.ordre ?? 0) || a.id - b.id);
    const premier = (recs) => Math.min(...recs.map((r) => r.ordre ?? 0));
    const parTheme = new Map();
    for (const r of triees) parTheme.set(r.categorie, [...(parTheme.get(r.categorie) ?? []), r]);
    return [...parTheme].sort((a, b) => premier(a[1]) - premier(b[1]));
  }

  const carteTheme = ([nom, recs]) => `<section class="carte carte-theme">
      <div class="carte-tete"><span>${txt(nom)}</span><span class="mono">${recs.length}</span></div>
      ${recs.map(ligne).join("")}
    </section>`;

  /** L'explication tient dans une feuille ouverte par le « ? » de l'en-tête (D-038). Le dépôt
   *  écrit « le petit », jamais le prénom de l'enfant (invariant 1). */
  function ouvrirAide() {
    ouvrirFeuille(`<h2 class="feuille-titre">Comment on compte</h2>
      <div class="carte-explication">
        <p><strong>Le temps fait les points</strong> : 5 minutes = 1 part, moins de 3 minutes = 0,5.
          On estime le temps habituel, pénibilité comprise.</p>
        <p><strong>Rythme</strong> : chaque jour (avec ses moments : matin, midi, soir, nuit, tous
          les jours, en semaine ou le week-end), chaque semaine, chaque mois, ou au besoin.</p>
        <p><strong>Répétable</strong> : un « +1 » sur la ligne compte une fois de plus dans la
          période — un biberon après la sieste, des courses en plus.</p>
        <p><span class="accent-rouge">Oblig.</span> : pas négociable (le petit habillé, lavé,
          nourri). Compté à part dans la semaine.</p>
        <p><strong>À deux</strong> : se choisit en cochant. Chacun prend ses parts, ou ⅔ · ⅓ s'il
          en a fait moins.</p>
      </div>`);
  }

  function rendreListe() {
    $("#tableau-taches-parts").innerHTML = themes().map(carteTheme).join("")
      || '<p class="vide">Aucune tâche récurrente.</p>';
    for (const b of $("#tableau-taches-parts").querySelectorAll("[data-ouvrir]")) {
      b.addEventListener("click", () => ouvrir(parId(Number(b.dataset.ouvrir))));
    }
  }

  function ouvrir(r) {
    parentNouvelleEtape = null;
    reglages.formulaire(r);
  }
  function nouvelleEtape(parent) {
    parentNouvelleEtape = parent;
    reglages.formulaire(null);
  }
  const parentDe = (r) => (r ? parId(r.parent_id) : parentNouvelleEtape);

  /** Les étapes suivent le thème et le rythme de leur tâche : recopiés à chaque enregistrement,
   *  les écrans qui filtrent par fréquence (cartes Semaine/Mois) les rangent au bon endroit. */
  async function alignerEtapes(parent) {
    for (const e of etapesDe(parent, etat.tachesRec)) {
      const champs = { categorie: parent.categorie, frequence: parent.frequence };
      if (e.categorie === champs.categorie && e.frequence === champs.frequence) continue;
      await api.majTacheRec(e.id, champs);
      Object.assign(e, champs);
    }
  }

  const reglages = creerReglages({
    bouton: "#form-tache-rec", libelleNouveau: "+ Nouvelle tâche",
    elements: actives,
    retirerDansFeuille: true,
    titreForm: (r) => {
      const p = parentDe(r);
      if (p) return r ? `Étape de « ${p.titre} »` : `Nouvelle étape de « ${p.titre} »`;
      return r ? "Modifier la tâche" : "Nouvelle tâche";
    },
    htmlForm: (r) => htmlFiche(r, { etat, parent: parentDe(r), etapes: r ? etapesDe(r, etat.tachesRec) : [], categories: categories() }),
    apresOuverture: (form, r) => brancherFiche(form, {
      surEtape: (id) => ouvrir(parId(id)),
      surNouvelleEtape: () => nouvelleEtape(r),
    }),
    champs: (form, r) => lireFiche(form, { etat, etape: !!parentDe(r) }),
    api: {
      creer: async (valeurs) => {
        const p = parentNouvelleEtape;
        const ligneNouvelle = p
          ? { ...valeurs, parent_id: p.id, categorie: p.categorie, frequence: p.frequence, fois: 1 }
          : valeurs;
        etat.tachesRec.push(await api.creerTacheRec({ ...ligneNouvelle, actif: true, ordre: etat.tachesRec.length + 1 }));
        parentNouvelleEtape = null;
        rendreListe();
      },
      maj: async (id, valeurs) => {
        await api.majTacheRec(id, valeurs);
        const r = parId(id);
        if (r && !r.parent_id) await alignerEtapes({ ...r, ...valeurs });
        rendreListe();
      },
      // Désactivation, pas suppression : l'historique des parts reste lisible. Une tâche
      // retirée emporte ses étapes.
      retirer: async (r) => {
        for (const x of [r, ...etapesDe(r, etat.tachesRec)]) {
          await api.majTacheRec(x.id, { actif: false });
          x.actif = false;
        }
        rendreListe();
      },
    },
    apresEcriture: () => cb.rafraichir("taches"),
    confirmerRetrait: (r) => `Retirer « ${r.titre} » ? Les fois déjà faites restent comptées.`,
    messageRetrait: "Tâche retirée.",
    echec: cb.echec,
  });

  function rendre() {
    reglages.rendre();
    // « + Nouvelle tâche » ouvre une tâche, jamais une étape laissée en suspens par une fiche
    // d'étape refermée sans enregistrer. Capture : passe avant l'écouteur du socle.
    $("#form-tache-rec [data-nouveau]")?.addEventListener("click", () => { parentNouvelleEtape = null; }, { capture: true });
    rendreListe();
  }

  $("#btn-aide-parts")?.addEventListener("click", ouvrirAide);

  // Le FAB « + Ajouter » des écrans Jour et Semaine ouvre la feuille d'ajout d'occurrence
  // (ui-taches-ajout.js) ; cette fiche-ci reste la seule création de tâche RÉCURRENTE (D-024).
  return { rendre, ouvrirAjout: () => ouvrir(null) };
}
