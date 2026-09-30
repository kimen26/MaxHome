// Fiche d'un voyage V2 (D-047 §V2) : ouverte en feuille plein écran du socle. Assemble bandeau,
// Résumé, Prochaine étape, Budget, Réservations & dépenses, Carte, Lieux, mosaïque de blocs
// (Info/Astuce/Attention) — mise en page responsive par largeur (§V2 « Mise en page »), gérée en
// CSS (agenda.css) par grille 12 colonnes sur PC. Les sous-écrans vivent dans leurs propres
// fichiers, chacun < 300 lignes.

import { $, ouvrirFeuille, fermerFeuille } from "../socle/ui-base.js";
import { jourIso } from "./calendrier.js";
import { rendreBandeau } from "./ui-fiche-bandeau.js";
import { rendreProchaineEtape } from "./ui-fiche-etape.js";
import { creerFicheBudget } from "./ui-fiche-budget.js";
import { creerFicheResas } from "./ui-fiche-resas.js";
import { creerFicheLieux } from "./ui-fiche-lieux.js";
import { creerFicheBlocs } from "./ui-fiche-blocs.js";
import { rendreCarteVoyage } from "./ui-fiche-carte.js";
import { dansLaFenetreHorsLigne, copierPieceEnCache } from "./pieces-hors-ligne.js";

export function creerFicheVoyage(api, etat, cb) {
  let voyage = null;
  let lieux = [];
  let resas = [];
  let pieces = [];
  let blocs = [];
  let enveloppes = [];

  const resas_actif = () => creerFicheResas(api, etat, cb, { voyage: () => voyage, resas: () => resas, pieces: () => pieces, rafraichir, revenirALaFiche: () => revenirALaFiche("resas") });
  const lieux_actif = () => creerFicheLieux(api, etat, cb, { voyage: () => voyage, lieux: () => lieux, rafraichir, revenirALaFiche: () => revenirALaFiche("lieux") });
  const blocs_actif = () => creerFicheBlocs(api, etat, cb, { voyage: () => voyage, blocs: () => blocs, rafraichir, revenirALaFiche: () => revenirALaFiche("resume") });
  const budget_actif = () => creerFicheBudget(api, etat, cb, { voyage: () => voyage, resas: () => resas, enveloppes: () => enveloppes, rafraichir, revenirALaFiche: () => revenirALaFiche("budget") });

  // Grille CSS à zones nommées (relecture 2 §A), 5 enfants DIRECTS de .fiche-voyage-grille —
  // resume, cote (un seul wrapper pour Étape/Budget/Résas), carte, lieux, blocs : le Résumé n'est
  // plus hors grille (c'était la cause du trou à droite de lui sur PC, la colonne "cote" ne
  // pouvait démarrer qu'après). Ordre mobile (§V2) : resume → cote → carte → lieux → blocs,
  // simple empilement des zones nommées (agenda.css définit `grid-template-areas` par largeur,
  // jamais deux gabarits HTML à maintenir).
  function html() {
    return `<div class="fiche-voyage" data-fiche-voyage>
      <div id="fiche-bandeau-corps"></div>
      <div class="fiche-voyage-grille">
        <div id="fiche-resume-corps" class="zone-resume"></div>
        <div class="zone-cote">
          <div id="fiche-etape-corps"></div>
          <div id="fiche-budget-corps"></div>
          <div id="fiche-resas-corps"></div>
        </div>
        <div id="fiche-carte-corps" class="zone-carte"></div>
        <div id="fiche-lieux-corps" class="zone-lieux"></div>
        <div id="fiche-blocs-corps" class="zone-blocs"></div>
      </div>
    </div>`;
  }

  async function rafraichir() {
    const [l, r, p, b, e] = await Promise.all([
      api.voyageLieux(voyage.id), api.voyageResas(voyage.id), api.voyagePieces(voyage.id),
      api.voyageBlocs(voyage.id), api.voyageEnveloppes(voyage.id),
    ]);
    lieux = l; resas = r; pieces = p; blocs = b; enveloppes = e;
    rendre();
  }

  /** (Ré)ouvre la feuille plein écran sur la fiche avec les données déjà en mémoire et branche
   *  « ← Voyages ». Commun à l'ouverture initiale et au retour depuis un sous-écran :
   *  `sectionAScroller` optionnelle défile jusqu'à sa section une fois rendue. */
  function afficherFiche(sectionAScroller = null) {
    ouvrirFeuille(html(), { pleinEcran: true });
    rendre();
    brancherRetour();
    if (sectionAScroller) $(`#fiche-${sectionAScroller}-corps`)?.scrollIntoView({ block: "start" });
  }

  function brancherRetour() {
    $("#feuille-corps [data-retour-voyages]")?.addEventListener("click", fermerFeuille);
  }

  /** Seul chemin de retour depuis un sous-écran de la fiche (formulaire Bloc/Lieu/Résa/Billet) :
   *  le formulaire a remplacé le contenu de la feuille UNIQUE du socle, donc on RÉOUVRE la fiche
   *  (afficherFiche) puis on scrolle sur la section concernée — jamais dupliqué (D-045). */
  async function revenirALaFiche(section) {
    await rafraichir(); // recharge tout AVANT de rouvrir : la fiche s'affiche à jour
    afficherFiche(section);
  }

  function rendre() {
    if (!$("#feuille-corps [data-fiche-voyage]")) return;
    $("#fiche-bandeau-corps").innerHTML = rendreBandeau(voyage, { resas, lieux, enveloppes });
    brancherRetour();
    $("#fiche-etape-corps").innerHTML = rendreProchaineEtape(resas);
    budget_actif().rendre();
    resas_actif().rendre();
    lieux_actif().rendre();
    blocs_actif().rendre();
    // La carte se peuple après coup (Leaflet chargé à la demande) : ne bloque pas le reste.
    rendreCarteVoyage("#fiche-carte-corps", lieux);
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
    ouvrirFeuille(`<div class="pile" data-chargement-fiche><p class="vide">Chargement…</p></div>`, { pleinEcran: true });
    try {
      const [l, r, p, b, e] = await Promise.all([
        api.voyageLieux(voyage.id), api.voyageResas(voyage.id), api.voyagePieces(voyage.id),
        api.voyageBlocs(voyage.id), api.voyageEnveloppes(voyage.id),
      ]);
      lieux = l; resas = r; pieces = p; blocs = b; enveloppes = e;
    } catch (e) {
      fermerFeuille();
      cb.echec(e);
      return;
    }
    $("#feuille-corps").innerHTML = html();
    brancherRetour();
    rendre();
    precopierPiecesHorsLigne();
  }

  return { ouvrir };
}
