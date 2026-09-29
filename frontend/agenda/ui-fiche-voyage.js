// Fiche d'un voyage : ouverte en feuille plein écran du socle (cohérent avec le reste de
// l'app — aucun écran caché de plus à ajouter à la navigation globale, D-036 §3/§8 ; une
// feuille est déjà le mécanisme utilisé pour tout détail qui n'est pas un onglet permanent,
// voir ui-charge-feuille.js). Assemble, dans l'ordre du brief : en-tête, Réservations, Carte,
// Lieux, Topo. Les sous-écrans (résas, lieux) vivent dans leurs propres fichiers, < 400 lignes.

import { $, txt, ouvrirFeuille, fermerFeuille, toast } from "../socle/ui-base.js";
import { titreSection } from "../socle/blocs.js";
import { formatPeriode, jourIso } from "./calendrier.js";
import { joursAvant } from "./carnet.js";
import { rendreTopo } from "./topo.js";
import { creerFicheResas } from "./ui-fiche-resas.js";
import { creerFicheLieux } from "./ui-fiche-lieux.js";
import { rendreCarteVoyage } from "./ui-fiche-carte.js";
import { dansLaFenetreHorsLigne, copierPieceEnCache } from "./pieces-hors-ligne.js";

export function creerFicheVoyage(api, etat, cb) {
  let voyage = null;
  let lieux = [];
  let resas = [];
  let pieces = [];
  let modifieTopo = false;

  const resas_actif = () => creerFicheResas(api, etat, cb, { voyage: () => voyage, resas: () => resas, pieces: () => pieces, rafraichir, revenirALaFiche: () => revenirALaFiche("resas") });
  const lieux_actif = () => creerFicheLieux(api, etat, cb, { voyage: () => voyage, lieux: () => lieux, rafraichir, revenirALaFiche: () => revenirALaFiche("lieux") });

  function decompteTexte() {
    const d = joursAvant(voyage, jourIso(new Date()));
    if (d === "en cours") return "En cours";
    if (d === "passé") return "Passé";
    return `Dans ${d} j`;
  }

  function htmlTopo() {
    if (modifieTopo) {
      return `<div class="fiche-topo">
        ${titreSection("Topo")}
        <textarea id="topo-edition" class="champ" rows="10">${txt(voyage.topo ?? "")}</textarea>
        <div class="detail-actions">
          <button type="button" class="btn-lien" data-annuler-topo>Annuler</button>
          <button type="button" class="btn btn-bleu grandir" data-enregistrer-topo>Enregistrer</button>
        </div>
      </div>`;
    }
    const rendu = rendreTopo(voyage.topo);
    return `<div class="fiche-topo">
      ${titreSection("Topo")}
      ${rendu ? `<div class="topo-rendu">${rendu}</div>` : `<p class="vide">Pas encore de résumé.</p>`}
      <button type="button" class="btn-lien" data-modifier-topo>Modifier</button>
    </div>`;
  }

  function html() {
    return `<div class="pile fiche-voyage" data-fiche-voyage>
      <div class="fiche-tete">
        <button type="button" class="btn-lien" data-retour-voyages>← Voyages</button>
        <h2>${txt(voyage.titre)}</h2>
        <p class="sous">${txt(voyage.lieu ?? "")}${voyage.lieu ? " · " : ""}${txt(formatPeriode(voyage.debut, voyage.fin, { annee: true }))}</p>
        <span class="fiche-decompte">${txt(decompteTexte())}</span>
      </div>
      <div id="fiche-resas-corps"></div>
      <div id="fiche-carte-corps"></div>
      <div id="fiche-lieux-corps"></div>
      <div id="fiche-topo-corps">${htmlTopo()}</div>
    </div>`;
  }

  async function rafraichir() {
    const [l, r, p] = await Promise.all([api.voyageLieux(voyage.id), api.voyageResas(voyage.id), api.voyagePieces(voyage.id)]);
    lieux = l; resas = r; pieces = p;
    rendre();
  }

  /** (Ré)ouvre la feuille plein écran sur la fiche avec les données déjà en mémoire (lieux/
   *  resas/pieces) et branche « ← Voyages ». Commun à l'ouverture initiale et au retour depuis
   *  un sous-écran : `sectionAScroller` optionnelle défile jusqu'à sa section une fois rendue. */
  function afficherFiche(sectionAScroller = null) {
    ouvrirFeuille(html(), { pleinEcran: true });
    $("#feuille-corps [data-retour-voyages]").addEventListener("click", fermerFeuille);
    rendre();
    if (sectionAScroller) $(`#fiche-${sectionAScroller}-corps`)?.scrollIntoView({ block: "start" });
  }

  /** Seul chemin de retour depuis un sous-écran de la fiche (formulaire Lieu/Résa/Billet, ou la
   *  feuille du lieu) : le formulaire a remplacé le contenu de la feuille UNIQUE du socle
   *  (#feuille-corps), donc `[data-fiche-voyage]` n'est plus dans le DOM — on ne peut pas se
   *  contenter de rafraîchir, il faut RÉOUVRIR la feuille en plein écran avec le HTML de la
   *  fiche (`afficherFiche`), puis scroller sur la section concernée. Passé aux sous-modules à
   *  la place de fermerFeuille+rafraichir : SEUL point qui sait revenir sur la fiche, jamais
   *  dupliqué (brief : enregistrer, supprimer, écarter, Annuler, voile, Échap doivent tous
   *  ramener ici, pas sur la liste des voyages). */
  async function revenirALaFiche(section) {
    await rafraichir(); // recharge lieux/résas/pièces AVANT de rouvrir : la fiche s'affiche à jour
    afficherFiche(section);
  }

  function rendre() {
    if (!$("#feuille-corps [data-fiche-voyage]")) return;
    $("#fiche-topo-corps").innerHTML = htmlTopo();
    resas_actif().rendre();
    lieux_actif().rendre();
    brancherTopo();
    // La carte se peuple après coup (Leaflet chargé à la demande) : ne bloque pas le reste.
    rendreCarteVoyage("#fiche-carte-corps", lieux);
  }

  function brancherTopo() {
    const racine = $("#feuille-corps [data-fiche-voyage]");
    racine.querySelector("[data-modifier-topo]")?.addEventListener("click", () => { modifieTopo = true; rendre(); });
    racine.querySelector("[data-annuler-topo]")?.addEventListener("click", () => { modifieTopo = false; rendre(); });
    racine.querySelector("[data-enregistrer-topo]")?.addEventListener("click", async () => {
      const texte = $("#topo-edition").value;
      try {
        await api.majTopo(voyage.id, texte);
        voyage.topo = texte;
        modifieTopo = false;
        rendre();
        toast("Topo enregistré.");
      } catch (e) { cb.echec(e); }
    });
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
    modifieTopo = false;
    ouvrirFeuille(`<div class="pile" data-chargement-fiche><p class="vide">Chargement…</p></div>`, { pleinEcran: true });
    try {
      const [l, r, p] = await Promise.all([api.voyageLieux(voyage.id), api.voyageResas(voyage.id), api.voyagePieces(voyage.id)]);
      lieux = l; resas = r; pieces = p;
    } catch (e) {
      fermerFeuille();
      cb.echec(e);
      return;
    }
    $("#feuille-corps").innerHTML = html();
    $("#feuille-corps [data-retour-voyages]").addEventListener("click", fermerFeuille);
    rendre();
    precopierPiecesHorsLigne();
  }

  return { ouvrir };
}
