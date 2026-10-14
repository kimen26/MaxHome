// Fiche d'un voyage V3 (brief fiche-voyage-v3.md, D-058) : ouverte en feuille plein écran du socle.
// ASSEMBLEUR : bandeau, légende des trois statuts, feuille de route, puis cinq onglets (Planning ·
// Activités · Carte · À faire · Infos). Les rendus vivent dans fiche-*.js (purs) et ui-fiche-*.js
// (actions), chacun < 300 lignes ; ici : les données, l'onglet courant et le retour depuis un
// sous-écran.

import { $, ouvrirFeuille, fermerFeuille } from "../socle/ui-base.js";
import { jourIso } from "./calendrier.js";
import { rendreBandeau } from "./ui-fiche-bandeau.js";
import { rendreProchaineEtape } from "./ui-fiche-etape.js";
import { creerFicheBudget } from "./ui-fiche-budget.js";
import { creerFicheResas } from "./ui-fiche-resas.js";
import { creerFicheActivites } from "./ui-fiche-activites.js";
import { creerFicheTodos, nbAFaire } from "./ui-fiche-todos.js";
import { creerFicheBlocs } from "./ui-fiche-blocs.js";
import { creerFichePartage } from "./ui-fiche-partage.js";
import { rendreCarteVoyage } from "./ui-fiche-carte.js";
import { rendreLegende } from "./fiche-statuts.js";
import { rendreFeuilleRoute } from "./fiche-route.js";
import { rendrePlanning } from "./fiche-planning.js";
import { chargerMeteo } from "./meteo.js";
import { dansLaFenetreHorsLigne, copierPieceEnCache } from "./pieces-hors-ligne.js";

const ONGLETS = [
  { cle: "planning", icone: "📅", libelle: "Planning" },
  { cle: "activites", icone: "🎟️", libelle: "Activités" },
  { cle: "carte", icone: "🗺️", libelle: "Carte" },
  { cle: "afaire", icone: "✅", libelle: "À faire" },
  { cle: "infos", icone: "ℹ️", libelle: "Infos" },
];
/** Section d'un sous-écran → onglet qui la contient (revenirALaFiche). */
const ONGLET_DE_SECTION = { lieux: "activites", resas: "infos", budget: "infos", resume: "infos", partage: "infos", afaire: "afaire" };

export function creerFicheVoyage(api, etat, cb) {
  let voyage = null;
  let lieux = [];
  let resas = [];
  let pieces = [];
  let blocs = [];
  let enveloppes = [];
  let todos = [];
  let meteo = null;
  let onglet = "planning";

  const ctx = { voyage: () => voyage, resas: () => resas, lieux: () => lieux, pieces: () => pieces, blocs: () => blocs, enveloppes: () => enveloppes, todos: () => todos, meteo: () => meteo, rafraichir };
  const resas_actif = (section = "resas") => creerFicheResas(api, etat, cb, { ...ctx, revenirALaFiche: () => revenirALaFiche(section) });
  const blocs_actif = () => creerFicheBlocs(api, etat, cb, { ...ctx, revenirALaFiche: () => revenirALaFiche("resume") });
  const budget_actif = () => creerFicheBudget(api, etat, cb, { ...ctx, revenirALaFiche: () => revenirALaFiche("budget") });
  // Persistants d'un rendu à l'autre : cartes dépliées, photos déjà signées.
  const activites = creerFicheActivites(api, etat, cb, {
    ...ctx, rendreTout: () => rendre(), revenirALaFiche: () => revenirALaFiche("lieux"),
    ouvrirResa: (resa, init) => resas_actif("lieux").formulaireResa(resa, init),
  });
  const partageFiche = creerFichePartage(api, etat, cb, { ...ctx, rendreTout: () => rendre(), revenirALaFiche: (section) => revenirALaFiche(section) });
  const todosFiche = creerFicheTodos(api, etat, cb, { ...ctx, rendreTout: () => rendre(), revenirALaFiche: () => revenirALaFiche("afaire") });

  function html() {
    const panneau = (cle, contenu) => `<section class="fv-panneau" id="fiche-${cle}-panneau" role="tabpanel" data-panneau="${cle}"${cle === onglet ? "" : " hidden"}>${contenu}</section>`;
    return `<div class="fiche-voyage" data-fiche-voyage>
      <div id="fiche-bandeau-corps"></div>
      <div id="fiche-legende-corps"></div>
      <div id="fiche-route-corps"></div>
      <div class="fv-onglets" id="fiche-onglets-corps" role="tablist"></div>
      ${panneau("planning", `<div id="fiche-planning-corps"></div>`)}
      ${panneau("activites", `<div id="fiche-lieux-corps"></div>`)}
      ${panneau("carte", `<div id="fiche-carte-corps"></div>`)}
      ${panneau("afaire", `<div id="fiche-todos-corps"></div>`)}
      ${panneau("infos", `<div class="fv-sections">
        <div id="fiche-resume-corps"></div><div id="fiche-etape-corps"></div><div id="fiche-resas-corps"></div>
        <div id="fiche-budget-corps"></div><div id="fiche-blocs-corps"></div><div id="fiche-partage-corps"></div></div>`)}
    </div>`;
  }

  async function charger() {
    const [l, r, p, b, e, t] = await Promise.all([
      api.voyageLieux(voyage.id), api.voyageResas(voyage.id), api.voyagePieces(voyage.id),
      api.voyageBlocs(voyage.id), api.voyageEnveloppes(voyage.id), api.voyageTodos(voyage.id),
      partageFiche.charger(),
    ]);
    lieux = l; resas = r; pieces = p; blocs = b; enveloppes = e; todos = t;
  }

  async function rafraichir() {
    await charger();
    rendre();
  }

  /** (Ré)ouvre la feuille plein écran sur la fiche avec les données déjà en mémoire. `section`
   *  (nom d'un sous-écran) choisit l'onglet et défile jusqu'à sa zone. */
  function afficherFiche(section = null) {
    if (section) onglet = ONGLET_DE_SECTION[section] ?? onglet;
    ouvrirFeuille(html(), { pleinEcran: true });
    rendre();
    brancherRetour();
    if (section) $(`#fiche-${section}-corps`)?.scrollIntoView({ block: "start" });
  }

  function brancherRetour() {
    $("#feuille-corps [data-retour-voyages]")?.addEventListener("click", fermerFeuille);
  }

  /** Seul chemin de retour depuis un sous-écran (formulaire Bloc/Lieu/Résa/Billet, confirmation) :
   *  il a remplacé le contenu de la feuille UNIQUE du socle, donc on RÉOUVRE la fiche (D-045). */
  async function revenirALaFiche(section) {
    await charger(); // recharge tout AVANT de rouvrir : la fiche s'affiche à jour
    afficherFiche(section);
    chargerLaMeteo();
  }

  function rendreOnglets() {
    $("#fiche-onglets-corps").innerHTML = ONGLETS.map((o) => {
      const reste = o.cle === "afaire" ? nbAFaire(todos) : 0;
      return `<button type="button" class="fv-onglet" role="tab" data-onglet="${o.cle}" aria-selected="${o.cle === onglet}" aria-controls="fiche-${o.cle}-panneau">
        <span class="fv-onglet-i" aria-hidden="true">${o.icone}</span><span>${o.libelle}</span>
        ${reste ? `<span class="fv-badge" aria-label="${reste} à faire">${reste}</span>` : ""}
      </button>`;
    }).join("");
    for (const b of document.querySelectorAll("#fiche-onglets-corps [data-onglet]")) {
      b.addEventListener("click", () => choisirOnglet(b.dataset.onglet, { defiler: true }));
    }
  }

  /** Affiche l'onglet (les autres panneaux se cachent). La carte ne se dessine qu'une fois son
   *  panneau visible : Leaflet mesure son cadre à la création. */
  function choisirOnglet(cle, { defiler = false } = {}) {
    onglet = cle;
    for (const p of document.querySelectorAll("#feuille-corps [data-panneau]")) p.hidden = p.dataset.panneau !== cle;
    rendreOnglets();
    if (cle === "carte") rendreCarteVoyage("#fiche-carte-corps", lieux, resas);
    if (defiler) $(`#fiche-${cle}-panneau`)?.scrollIntoView({ block: "start" });
  }

  function rendreJours() {
    $("#fiche-route-corps").innerHTML = rendreFeuilleRoute(voyage, lieux, resas);
    for (const b of document.querySelectorAll("#fiche-route-corps [data-jour]")) {
      b.addEventListener("click", () => {
        choisirOnglet("planning");
        document.getElementById(`fv-jour-${b.dataset.jour}`)?.scrollIntoView({ block: "start" });
      });
    }
    $("#fiche-planning-corps").innerHTML = rendrePlanning(voyage, lieux, resas, meteo);
  }

  function rendre() {
    if (!$("#feuille-corps [data-fiche-voyage]")) return;
    $("#fiche-bandeau-corps").innerHTML = rendreBandeau(voyage, { resas, lieux, enveloppes, todos });
    brancherRetour();
    $("#fiche-legende-corps").innerHTML = rendreLegende();
    rendreJours();
    rendreOnglets();
    activites.rendre();
    todosFiche.rendre();
    $("#fiche-etape-corps").innerHTML = rendreProchaineEtape(resas);
    budget_actif().rendre();
    resas_actif().rendre();
    blocs_actif().rendre();
    partageFiche.rendre();
    if (onglet === "carte") rendreCarteVoyage("#fiche-carte-corps", lieux, resas);
  }

  /** La météo arrive après coup (réseau) : jamais bloquante, jamais d'erreur visible (le journal
   *  console garde la cause, meteo.js::chargerMeteo). */
  async function chargerLaMeteo() {
    try {
      meteo = await chargerMeteo(voyage, lieux, resas, jourIso(new Date()));
      if ($("#fiche-planning-corps")) $("#fiche-planning-corps").innerHTML = rendrePlanning(voyage, lieux, resas, meteo);
    } catch (e) { console.error("météo de la fiche", e); }
  }

  /** Précopie les pièces en Cache Storage si le voyage est proche/en cours (brief §Hors ligne) :
   *  best-effort, jamais bloquant pour l'ouverture de la fiche. */
  async function precopierPiecesHorsLigne() {
    if (!dansLaFenetreHorsLigne(voyage, jourIso(new Date()))) return;
    for (const piece of pieces) {
      try { await copierPieceEnCache(piece.id, await api.urlPiece(piece.chemin)); }
      catch (e) { console.error("précopie hors ligne", piece.id, e); }
    }
  }

  async function ouvrir(voyageId) {
    voyage = etat.voyages.find((v) => v.id === voyageId);
    if (!voyage) throw new Error(`voyage introuvable : ${voyageId}`);
    onglet = "planning";
    meteo = null;
    ouvrirFeuille(`<div class="pile" data-chargement-fiche><p class="vide">Chargement…</p></div>`, { pleinEcran: true });
    try {
      await charger();
    } catch (e) {
      fermerFeuille();
      cb.echec(e);
      return;
    }
    $("#feuille-corps").innerHTML = html();
    brancherRetour();
    rendre();
    chargerLaMeteo();
    precopierPiecesHorsLigne();
  }

  return { ouvrir };
}
