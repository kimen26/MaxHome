// Section « Virements à faire » de l'écran Mois (D-048 §3, Yann : « Mets-moi le global
// directement : de CB j'envoie à Caisse d'Épargne, de CB j'envoie à Commun épargne, etc. ») —
// un groupe par trajet (compte de départ → compte de destination), au-dessus des catégories de
// charges. Une case par groupe (même cycle que les lignes, D-048 §2) : cocher un groupe valide
// toutes ses lignes non faites pour la même personne et la même date, décocher un groupe déjà
// fait annule tout. Le détail replié (tap hors case) montre De/Vers, l'IBAN de la destination
// s'il est connu, le libellé de virement à copier (ou à compléter ce mois si le compte en
// demande un qui change chaque mois, D-050), et un bouton Copier le montant total. La logique de
// regroupement est pure (groupes-virements.js, testée en node) : ce fichier n'assemble que
// l'affichage (D-024).

import { euros } from "./calc.js";
import { $, $$, txt, toast, copier, ouvrirFeuille, fermerFeuille, feuilleOuverte } from "../socle/ui-base.js";
import { caseCycle, enteteDetail } from "../socle/blocs.js";
import { brancherCycles } from "../socle/blocs-cycle.js";
import { construireGroupes, preparerBasculeGroupe } from "./groupes-virements.js";
import { SANS_PRENOM, valeurAffichee, preparerBascule as preparerBasculeLigne, appliquerBascule as appliquerBasculeLigne,
  annulerBascule as annulerBasculeLigne, ecrireBascule as ecrireBasculeLigne } from "./coche-ligne.js";
import { libelleACompleter } from "./libelle-virement.js";
import { htmlBlocLibelle, brancherBlocLibelle } from "./bloc-libelle-virement.js";

export function creerUiGroupesVirements(api, etat, cb, { basculerMouvement }) {
  const [p1] = etat.membres.map((m) => m.prenom);

  /** Une ligne du détail replié : libellé + montant, jamais la case (le groupe se coche
   *  entier, pas ligne à ligne depuis ce détail — chaque ligne reste cochable dans sa propre
   *  catégorie, règle 3 du brief). */
  const ligneDetail = (l) => `<div class="gv-detail-ligne">
    <span>${txt(l.libelle)}</span><span class="mono">${euros(l.montant_centimes)}</span></div>`;

  /** Mouvement réel du mois qui réalise ce trajet, quel que soit son mode — même pour une
   *  charge en mode "charge" (D-046 : sa LIGNE porte la validation visible, mais le mouvement
   *  existe en base et se coche en parallèle), c'est lui qui porte la surcharge de libellé du
   *  mois : jamais g.lignes, qui ne contient qu'un élément `type: "ligne"` pour ce mode. */
  function mouvementDuGroupe(g) {
    return etat.mouvements.find((m) => m.compte_vers === g.vers
      && (m.compte_de ?? (m.qui ? `perso:${m.qui}` : null)) === g.de);
  }

  function html() {
    const groupes = construireGroupes(etat);
    const enCours = groupes.filter((g) => !g.fait);
    const finis = groupes.filter((g) => g.fait);
    if (!groupes.length) return "";
    const ligne = (g) => {
      const valeur = g.fait ? g.prenom : null;
      // « ✓ Prénom » seulement si un prénom commun existe (D-048) ; sinon juste « ✓ » — jamais
      // le Symbol SANS_PRENOM affiché tel quel dans le texte.
      const suffixeFait = g.fait ? ` · ✓${g.prenom !== SANS_PRENOM ? ` ${txt(g.prenom)}` : ""}` : "";
      const compteVers = etat.comptes.find((c) => c.id === g.vers);
      const aCompleter = libelleACompleter(mouvementDuGroupe(g), compteVers);
      return `<div class="mvt gv-groupe cliquable${g.fait ? " fait" : ""}" data-id="${txt(g.cle)}">
        ${caseCycle({ id: g.cle, valeur: valeurAffichee(valeur), p1, titre: `${g.libelleDe} vers ${g.libelleVers}` })}
        <div class="mvt-corps">
          <span class="mvt-titre">${txt(g.libelleDe)} → ${txt(g.libelleVers)}</span>
          <span class="mvt-trajet">${g.lignes.length} ligne${g.lignes.length > 1 ? "s" : ""}${suffixeFait}</span>
          ${aCompleter ? `<span class="mvt-note gv-libelle-alerte">Libellé à compléter</span>` : ""}
        </div>
        <div class="mvt-droite"><span class="mono mvt-montant">${euros(g.total)}</span></div>
      </div>`;
    };
    return `<div class="carte carte-mvts carte-groupes-virements">
      <div class="carte-tete"><span>VIREMENTS À FAIRE</span><span class="mono">${enCours.length}</span></div>
      ${enCours.map(ligne).join("") || '<p class="vide">Rien à virer ce mois-ci.</p>'}
      ${finis.length ? `<div class="carte-tete complete">FAIT</div>${finis.map(ligne).join("")}` : ""}
    </div>`;
  }

  /** Bascule la case d'UN groupe : applique la valeur suivante du cycle à ses lignes cibles
   *  (préparées par groupes-virements.js), une par une, dans l'ordre — pas en parallèle,
   *  chaque ligne suit son propre cycle optimiste/rollback (coche-ligne.js pour les lignes de
   *  charge, `basculerMouvement` — creerCheckList.basculer — pour les mouvements). */
  async function basculerGroupe(cle) {
    const groupes = construireGroupes(etat);
    const g = groupes.find((x) => x.cle === cle);
    if (!g) return;
    const { valeurCible, cibles } = preparerBasculeGroupe(g, etat.membres);
    if (!cibles.length) return;
    // Une SEULE date pour tout le groupe (règle 3 du brief : « même personne, même date ») —
    // jamais un `new Date()` par ligne, qui divergerait de quelques millisecondes.
    const dateCible = valeurCible === null ? null : new Date().toISOString();
    for (const c of cibles) {
      if (c.type === "mouvement") { await basculerMouvement(c.id, { valeurCible, dateCible }); continue; }
      const prep = preparerBasculeLigne(etat, c.id, valeurCible, dateCible);
      if (!prep.ok) { toast(prep.message, true); continue; }
      const restaure = appliquerBasculeLigne(etat, c.id, prep);
      try { await ecrireBasculeLigne(api, etat, c.id, prep); }
      catch (e) { annulerBasculeLigne(etat, c.id, restaure, prep.mouvementLie); cb.echec(e); }
    }
    cb.recalculer();
    cb.rendreMois();
    toast(valeurCible === null ? "Validation annulée." : `Validé pour ${valeurCible}.`);
  }

  /** Détail replié d'un groupe (tap hors case) : De/Vers, IBAN si connu, libellé, Copier le total. */
  function ouvrirDetail(cle) {
    const g = construireGroupes(etat).find((x) => x.cle === cle);
    if (!g) return;
    const compteVers = etat.comptes.find((c) => c.id === g.vers);
    const mouvement = mouvementDuGroupe(g);
    const iban = compteVers?.iban ?? null;
    const html = `<div class="detail" data-id="${txt(g.cle)}">
      ${enteteDetail(`${g.libelleDe} → ${g.libelleVers}`, `${g.lignes.length} ligne${g.lignes.length > 1 ? "s" : ""}`)}
      <div class="detail-montant">
        <span class="mono grand">${euros(g.total)}</span>
      </div>
      <div class="detail-trajet">
        <div class="case-compte"><span class="etiquette">De</span><span class="nom">${txt(g.libelleDe)}</span></div>
        <span class="fleche">→</span>
        <div class="case-compte"><span class="etiquette">Vers</span><span class="nom">${txt(g.libelleVers)}</span>
          ${iban ? `<span class="sous mono">${txt(iban)}</span>` : ""}</div>
      </div>
      ${htmlBlocLibelle(mouvement, compteVers)}
      <div class="gv-detail-lignes">${g.lignes.map(ligneDetail).join("")}</div>
      <div class="detail-actions">
        <button class="btn btn-bleu grandir" data-copier-total="${(g.total / 100).toFixed(2).replace(".", ",")}">
          Copier le montant total</button>
      </div>
    </div>`;
    ouvrirFeuille(html);
    $("#feuille-corps [data-copier-total]").addEventListener("click", (e) => copier(e.currentTarget.dataset.copierTotal));
    brancherBlocLibelle($("#feuille-corps"), api, etat, cb, () => ouvrirDetail(cle));
  }

  /** Branche les cases (cycle) et le tap sur la ligne (détail) — `racine` (#groupes-virements)
   *  n'accueille QUE les groupes : `[data-cycle]` n'y désigne jamais un id numérique de charge
   *  ou de mouvement, aucun risque de collision avec les autres racines (mois-categories,
   *  ajustements) qui appellent aussi `brancherCycles` sur leur propre sous-arbre. */
  function brancher(racine) {
    brancherCycles(racine, basculerGroupe);
    for (const el of racine.querySelectorAll(".gv-groupe[data-id]")) {
      el.addEventListener("click", () => ouvrirDetail(el.dataset.id));
    }
  }

  return { html, brancher };
}
