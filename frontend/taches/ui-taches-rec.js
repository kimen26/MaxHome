// Écran « Réglages · Parts » du module Tâches : tableau par cadence où chaque colonne est un
// bouton-cycle (D-024, blocs-cycle.js) — l'effet est immédiat et se propage partout, pas de
// feuille à ouvrir pour changer une valeur. La feuille en formulaire (blocs-reglages.js) reste
// pour créer une tâche et pour les champs longs (titre, catégorie, consigne, fréquence).
//
// Piège D-026 : un tap répété sur un cycle (parts, oblig., à 2, fois) part en écriture optimiste
// à chaque geste. Sans file, deux écritures rapprochées du même réglage pourraient arriver dans
// le désordre et laisser la base sur un état antérieur au dernier tap. `creerFileEcritures()`
// sérialise par tâche (clé = id du récurrent), comme le fait déjà l'écran Semaine.

import { $, txt } from "../socle/ui-base.js";
import { creerFileEcritures } from "../socle/blocs.js";
import { boutonCycle, brancherCycles, suivante } from "../socle/blocs-cycle.js";
import { creerReglages } from "../socle/blocs-reglages.js";
import { champ, zone, select, caseACocher, listeChoix, membresOptions, lire } from "../socle/blocs-form.js";
import { FREQUENCES, ECHELLE_QUART, partsTexte, parts } from "./taches.js";

const CADENCES = [["quotidien", "Chaque jour", "Jour"], ["hebdo", "Chaque semaine", "Sem."], ["mensuel", "Chaque mois", "Mois"]];
const CYCLE_MINUTES = [5, 10, 15, 20, 30, 45, 60, 90];
const CYCLE_FOIS = [1, 2, 3, 4, 5, 7];

export function creerUiTachesRec(api, etat, cb) {
  const enFile = creerFileEcritures();
  const actives = () => etat.tachesRec.filter((r) => r.actif);
  const categories = () => [...new Set(etat.tachesRec.map((r) => r.categorie))];
  const membres = () => etat.membres.map((m) => m.prenom);

  // ---------- rendu des cycles de la colonne 1 (minutes, écart, moment) ----------
  function renduMinutes(v) { return v ? `${v}′` : "—"; }
  function renduEcart(r, v) {
    if (!v) return "les deux pareil";
    const [p1, p2] = membres();
    const autre = v === p1 ? p2 : p1;
    return `${v[0]} ${partsTexte(unCranPlus(r.parts_quart))} · ${autre[0]} ${partsTexte(r.parts_quart)}`;
  }
  const unCranPlus = (base) => { const i = ECHELLE_QUART.indexOf(base); return ECHELLE_QUART[Math.min(ECHELLE_QUART.length - 1, i + 1)] ?? base; };
  // Moment (matin/soir) : seules les tâches quotidiennes alimentent les deux cartes de l'écran
  // Jour (012_moment.sql) — un cycle « Matin → Soir → — » pour régler ça sans quitter le tableau.
  function renduMoment(v) { return v === "matin" ? "Matin" : v === "soir" ? "Soir" : "—"; }

  // ---------- rendu des colonnes du tableau ----------
  function renduParts(q) {
    const classe = q >= 20 ? "cycle-plein" : q >= 8 ? "cycle-clair" : "";
    return { libelle: partsTexte(q), classe };
  }
  function renduOblig(v) {
    return v ? { libelle: "Oui", classe: "cycle-actif-rouge" } : { libelle: "—", classe: "cycle-inactif" };
  }
  function renduADeux(v) {
    return v ? { libelle: "÷2", classe: "cycle-actif-olive" } : { libelle: "—", classe: "cycle-inactif" };
  }
  function renduFois(n) { return String(n); }

  /** Une ligne du tableau : titre (bouton, tap = ouvre la feuille de modification existante,
   *  D-036 décision 5) + deux/trois cycles texte, puis Parts / Oblig. / À 2 / Fois. Modifier
   *  les champs longs (catégorie, consigne, fréquence) et retirer la tâche se fait dans cette
   *  même feuille (bouton « Retirer » en pied, `retirerDansFeuille`) — pas de deuxième liste
   *  ni de deuxième geste réinventés pour la même action (D-024). */
  function ligneTableau(r) {
    const foisFige = r.frequence === "mensuel";
    return `<div class="ligne-reglage-parts" data-id="${r.id}">
      <div class="rp-titre">
        <button type="button" class="rp-nom" data-ouvrir-form="${r.id}">${txt(r.titre)}</button>
        <span class="rp-mini">
          ${boutonCycle({ cle: `minutes|${r.id}`, valeurs: CYCLE_MINUTES, valeur: r.minutes ?? 0, rendu: renduMinutes, classe: "rp-bouton-texte", taille: "mini" })}
          ${boutonCycle({ cle: `ecart|${r.id}`, valeurs: [null, ...membres()], valeur: r.ecart_prenom ?? null, rendu: (v) => renduEcart(r, v), classe: "rp-bouton-texte rp-ecart", taille: "mini" })}
          ${r.frequence === "quotidien"
            ? boutonCycle({ cle: `moment|${r.id}`, valeurs: ["matin", "soir", null], valeur: r.moment ?? null, rendu: renduMoment, classe: "rp-bouton-texte rp-moment", taille: "mini" })
            : ""}
        </span>
      </div>
      ${boutonCycle({ cle: `parts|${r.id}`, valeurs: ECHELLE_QUART, valeur: r.parts_quart, rendu: renduParts, taille: "reglage", classe: "cible44" })}
      ${boutonCycle({ cle: `oblig|${r.id}`, valeurs: [false, true], valeur: r.obligatoire, rendu: renduOblig, taille: "reglage", classe: "cible44" })}
      ${boutonCycle({ cle: `deux|${r.id}`, valeurs: [false, true], valeur: r.partageable, rendu: renduADeux, taille: "reglage", classe: "cible44" })}
      ${foisFige
        ? `<span class="rp-fois-fige cible44" aria-label="1 fois, fixe pour une tâche mensuelle">1×</span>`
        : boutonCycle({ cle: `fois|${r.id}`, valeurs: CYCLE_FOIS, valeur: r.fois ?? 1, rendu: renduFois, taille: "reglage", classe: "cible44" })}
    </div>`;
  }

  function tableauCadence(cle, nom, enTeteFois) {
    const recs = actives().filter((r) => r.frequence === cle);
    if (!recs.length) return "";
    return `<section class="carte bloc-cadence">
      <div class="carte-tete entete-reglage-parts">
        <span>${txt(nom)}</span><span>Parts</span><span>Oblig.</span><span>À 2</span><span>${txt(enTeteFois)}</span>
      </div>
      ${recs.map(ligneTableau).join("")}
    </section>`;
  }

  /** Carte d'explication (§5 du handoff) : reprise telle quelle, c'est la pédagogie du système
   *  — texte, jamais des boutons (`.carte-explication` du socle). Le handoff cite le prénom de
   *  l'enfant ; le dépôt écrit « le petit » (invariant 1, aucune donnée personnelle en git). */
  const carteExplication = () => `<section class="carte-explication">
    <h3>On compte en parts de la maison, pas en points de match</h3>
    <p>Échelle : <strong class="mono">${ECHELLE_QUART.map(partsTexte).join(" · ")}</strong>.
      Le plus petit, c'est préparer le lait du soir (0,5) ; le plus gros, nettoyer la salle de
      bain (8). Chaque cran contient déjà le temps <em>et</em> le relou, donc cinq bricoles ne
      valent pas une grosse corvée. Les minutes sous le titre ne comptent pas, c'est juste un repère.</p>
    <p><span class="accent-bleu">C 3 · Y 2</span> — l'écart, quand la même tâche coûte un cran
      de plus à l'un des deux (amener le petit). Tap pour changer de côté.</p>
    <p><span class="accent-rouge">Oblig.</span> — pas négociable : le petit doit être habillé,
      lavé, nourri. Ça ne rapporte pas plus ; ça se compte à part dans la semaine, là où on voit
      qui porte l'incontournable.</p>
    <p><span class="accent-olive">÷2</span> — faisable à deux. Le bain fait ensemble reste un
      bain : les parts se partagent (2 → 1 + 1), elles ne doublent pas.</p>
    <p><strong>Sem. / Mois</strong> — la dernière colonne : combien de fois sur la période.
      Lessive 3× par semaine, salle de bain 1× par mois.</p>
  </section>`;

  function rendreTableau() {
    $("#tableau-taches-parts").innerHTML = carteExplication() + CADENCES.map(([cle, nom, entete]) => tableauCadence(cle, nom, entete)).join("")
      || '<p class="vide">Aucune tâche récurrente.</p>';
    brancherCycles($("#tableau-taches-parts"), surCycle);
    for (const b of $("#tableau-taches-parts").querySelectorAll("[data-ouvrir-form]")) {
      b.addEventListener("click", () => reglages.formulaire(actives().find((r) => r.id === Number(b.dataset.ouvrirForm)) ?? null));
    }
  }

  /** Applique le geste d'un cycle : écriture optimiste + rollback, sérialisée par tâche (D-026). */
  async function surCycle(cle) {
    const [champNom, idTxt] = cle.split("|");
    const id = Number(idTxt);
    const r = etat.tachesRec.find((x) => x.id === id);
    if (!r) return;
    const patch = calculerPatch(champNom, r);
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

  function calculerPatch(champNom, r) {
    if (champNom === "parts") return { parts_quart: suivante(ECHELLE_QUART, r.parts_quart) };
    if (champNom === "oblig") return { obligatoire: !r.obligatoire };
    if (champNom === "deux") return { partageable: !r.partageable };
    if (champNom === "fois") {
      if (r.frequence === "mensuel") return null; // figé, cf. rendu (pas de bouton-cycle affiché)
      return { fois: suivante(CYCLE_FOIS, r.fois ?? 1) };
    }
    if (champNom === "minutes") return { minutes: suivante([0, ...CYCLE_MINUTES], r.minutes ?? 0) || null };
    if (champNom === "ecart") return { ecart_prenom: suivante([null, ...membres()], r.ecart_prenom ?? null) };
    if (champNom === "moment") return { moment: suivante(["matin", "soir", null], r.moment ?? null) };
    return null;
  }

  // ---------- formulaire en feuille : création, champs longs, et Modifier / Retirer ----------
  // Pas de liste séparée (D-036 décision 5) : le tableau au-dessus ouvre `formulaire(el)` au tap
  // sur le titre d'une ligne ; le bouton « + Nouvelle tâche récurrente » reste la seule entrée
  // de création, en tirets sous les trois cartes (`#form-tache-rec`, avant la légende).
  const reglages = creerReglages({
    bouton: "#form-tache-rec", libelleNouveau: "+ Nouvelle tâche récurrente",
    elements: actives,
    retirerDansFeuille: true,
    titreForm: (r) => (r ? "Modifier la tâche" : "Nouvelle tâche récurrente"),
    htmlForm: (r) => `
      ${champ("titre", "Titre", { valeur: r?.titre, requis: true })}
      ${champ("categorie", "Catégorie", { valeur: r?.categorie ?? "Maison", attrs: 'list="cats-rec"' })}
      ${listeChoix("cats-rec", categories())}
      ${select("frequence", "Fréquence", Object.entries(FREQUENCES), r?.frequence ?? "quotidien")}
      ${champ("fois", "Combien de fois par période", { type: "number", valeur: r?.fois ?? 1, attrs: 'min="1" max="10"' })
        .replace("<label>", "<label data-si-periode>")}
      ${select("parts_quart", "Parts", ECHELLE_QUART.map((q) => [q, parts(q)]), r?.parts_quart ?? 4)}
      ${champ("minutes", "Minutes indicatives (repère, hors calcul)", { type: "number", valeur: r?.minutes ?? "", attrs: 'min="1" max="240"' })}
      ${select("ecart_prenom", "Coûte un cran de plus à", membresOptions(etat), r?.ecart_prenom, { vide: "Les deux pareil" })}
      ${select("attribue_a", "Attribuée d’habitude à", membresOptions(etat), r?.attribue_a, { vide: "Personne en particulier" })}
      ${caseACocher("obligatoire", "Obligatoire — pas négociable", r?.obligatoire)}
      ${caseACocher("partageable", "Faisable à deux — parts partagées", r?.partageable)}
      ${zone("consigne", "Consigne", r?.consigne)}`,
    apresOuverture: (form) => {
      const majVisibilite = () => { form.querySelector("[data-si-periode]").hidden = form.frequence.value === "au_besoin"; };
      form.frequence.addEventListener("change", majVisibilite);
      majVisibilite();
    },
    champs: (form) => {
      const v = lire(form, { nombres: ["fois", "parts_quart", "minutes"], booleens: ["obligatoire", "partageable"] });
      return {
        titre: v.titre, categorie: v.categorie ?? "Maison", frequence: v.frequence,
        fois: v.frequence === "au_besoin" ? 1 : Math.max(1, v.fois || 1),
        parts_quart: ECHELLE_QUART.includes(v.parts_quart) ? v.parts_quart : 4,
        minutes: v.minutes, ecart_prenom: v.ecart_prenom, attribue_a: v.attribue_a,
        obligatoire: v.obligatoire, partageable: v.partageable, consigne: v.consigne,
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

  // Le FAB « + Ajouter » des écrans Jour et Semaine (handoff « Structure de l'écran ») ouvre
  // ce même formulaire de création : c'est la seule création de tâche que l'app sait faire
  // aujourd'hui (une occurrence libre, sans tâche récurrente, n'existe pas côté métier —
  // cf. rapport de l'agent). Pas de deuxième formulaire réinventé pour la même action (D-024).
  return { rendre, ouvrirAjout: () => reglages.formulaire(null) };
}
