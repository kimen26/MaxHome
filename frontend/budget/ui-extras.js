// « Ce mois seulement » : les charges ponctuelles (charges.ponctuel = true), affichées et
// validables comme les charges par catégorie (D-046). Sorti de ui-mouvements.js (qui dépassait
// 400 lignes) : même rôle que ui-regularisations.js, un sous-bloc de la carte « Ce mois
// seulement » avec son propre rendu et ses écritures. Une ligne de ce mois EST une charge
// comme les autres pour le calcul : `ponctuel` ne sert qu'à l'afficher ici plutôt que dans les
// catégories, et à ne pas lui proposer de référence d'un mois sur l'autre. Une ligne naît « à
// financer » (hors calcul) ; son financement (financement-extra.js) dit si elle entre dans le
// commun (calc.js, compteDansLeCommun).

import { euros } from "./calc.js";
import { txt, toast, confirmer } from "../socle/ui-base.js";
import { caseCycle, creerFileEcritures } from "../socle/blocs.js";
import { brancherCycles } from "../socle/blocs-cycle.js";
import { libelleRegle } from "./repartition.js";
import { repereFinancement, doitChoisirAvantValidation, choisirFinancement } from "./financement-extra.js";
import { preparerBascule, appliquerBascule, annulerBascule, ecrireBascule, valeurCourante, valeurAffichee } from "./coche-ligne.js";

/** jj/mm d'une date ISO — même calcul que jourMois() de ui-mouvements.js. */
const jourMois = (iso) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function creerUiExtras(api, etat, cb) {
  // Une ponctuelle n'existe que dans le mois où elle a sa ligne : ailleurs, rien à afficher.
  const ponctuelles = () => etat.charges.filter((c) => c.ponctuel && c.actif !== false && etat.lignes[c.id] !== undefined);
  // Une charge à la fois, file indépendante de celle des catégories (creerFileEcritures, blocs.js).
  const enFileValidation = creerFileEcritures();

  const ligne = (c) => {
    // Montant toujours en positif (D-053, cohérent avec la liste unifiée) : une ligne de ce
    // mois sort du commun comme une charge normale, son signe en base reste négatif, mais rien
    // sur cet écran n'affiche plus de signe hors « Reste ».
    const m = Math.abs(etat.lignes[c.id]?.montant_centimes ?? 0);
    const fait = etat.lignes[c.id]?.fait_le;
    const valeur = valeurCourante(etat.lignes[c.id]);
    const [p1] = etat.membres.map((mb) => mb.prenom);
    const repere = repereFinancement(etat.lignes[c.id]?.financement);
    return `<div class="ligne extra${fait ? " fait" : ""}" data-charge="${c.id}">
      ${caseCycle({ id: c.id, valeur: valeurAffichee(valeur), p1, titre: c.libelle })}
      <button type="button" class="titre" data-suppr-extra="${c.id}" title="Retirer">${txt(c.libelle)}</button>
      <span class="repere">${txt(libelleRegle(c.regle))}</span>
      ${repere ? `<span class="repere financement ${repere.classe}">${txt(repere.texte)}</span>` : ""}
      ${fait ? `<span class="repere mc-fait">✓ ${[etat.lignes[c.id].fait_par, jourMois(fait)].filter(Boolean).join(" · ")}</span>` : ""}
      <span class="mono valeur">${euros(m)}</span>
      <button type="button" class="btn-lien changer-financement" data-changer-financement="${c.id}">Changer le financement</button>
    </div>`;
  };

  /** Applique `prep` à l'état, rend, écrit, et restaure tout si l'écriture échoue : LE cycle
   *  optimiste/rollback de la ligne (D-024), partagé par la validation et le changement de
   *  financement — pas de second cycle équivalent. */
  async function appliquerEtEcrire(chargeId, prep, rendre) {
    const restaure = appliquerBascule(etat, chargeId, prep);
    cb.recalculer();
    rendre();
    try {
      await enFileValidation(chargeId, () => ecrireBascule(api, etat, chargeId, prep));
      toast(prep.message);
    } catch (e) {
      annulerBascule(etat, chargeId, restaure, prep.mouvementLie);
      cb.recalculer();
      rendre();
      cb.echec(e);
    }
  }

  const chargeDe = (id) => etat.charges.find((c) => c.id === id);

  async function basculerValidation(chargeId, rendre) {
    let prep = preparerBascule(etat, chargeId);
    if (!prep.ok) { toast(prep.message, true); return; }
    // Un extra « à financer » ne se valide pas avant de dire d'où vient l'argent.
    if (doitChoisirAvantValidation(etat.lignes[chargeId])) {
      const c = chargeDe(chargeId);
      const financement = await choisirFinancement(etat, { titre: c.libelle, regle: c.regle });
      if (!financement) return; // feuille fermée : rien ne change
      prep = preparerBascule(etat, chargeId); // l'état a pu bouger pendant le choix
      if (!prep.ok) { toast(prep.message, true); return; }
      prep = { ...prep, champsLigne: { ...prep.champsLigne, financement } };
    }
    await appliquerEtEcrire(chargeId, prep, rendre);
  }

  const MESSAGES_FINANCEMENT = {
    a_financer: "Remis à financer.", joint: "Le compte joint l'absorbe.", chacun: "Chacun ajoute ce mois-ci.",
  };

  async function changerFinancement(chargeId, rendre) {
    const c = chargeDe(chargeId);
    const courant = etat.lignes[chargeId]?.financement ?? null;
    const financement = await choisirFinancement(etat, { titre: c.libelle, regle: c.regle, courant, changement: true });
    if (!financement || financement === courant) return;
    await appliquerEtEcrire(chargeId,
      { ok: true, message: MESSAGES_FINANCEMENT[financement], champsLigne: { financement }, mouvementLie: null }, rendre);
  }

  /** HTML des lignes de ce mois, puis le sous-total « À financer » s'il y en a — sans les
   *  régularisations (ajoutées par l'appelant). */
  function html() {
    const enAttente = Math.abs(etat.resultat?.aFinancer ?? 0);
    const sousTotal = enAttente
      ? `<div class="extras-a-financer" role="status">À financer : <span class="mono">${euros(enAttente)}</span></div>` : "";
    return ponctuelles().map(ligne).join("") + sousTotal;
  }

  /** Total de la carte : ce qui est compté ce mois, sans les extras encore « à financer »
   *  (leur somme a son propre sous-total). */
  function total() {
    return ponctuelles()
      .filter((c) => etat.lignes[c.id]?.financement !== "a_financer")
      .reduce((s, c) => s + (etat.lignes[c.id]?.montant_centimes ?? 0), 0);
  }

  /** Branche suppr et case de validation sur `racine` (la carte « Ce mois seulement »). */
  function brancher(racine, rendre) {
    for (const b of racine.querySelectorAll("[data-suppr-extra]")) {
      b.addEventListener("click", async () => {
        const id = Number(b.dataset.supprExtra);
        if (!(await confirmer("Retirer cette ligne ?", { ok: "Retirer" }))) return;
        try {
          await api.majCharge(id, { actif: false });
          etat.charges.find((c) => c.id === id).actif = false;
          delete etat.lignes[id];
          cb.recalculer();
          rendre();
          toast("Ligne retirée.");
        } catch (e) { cb.echec(e); }
      });
    }
    for (const b of racine.querySelectorAll("[data-changer-financement]")) {
      b.addEventListener("click", () => changerFinancement(Number(b.dataset.changerFinancement), rendre));
    }
    brancherCycles(racine, (id) => basculerValidation(Number(id), rendre));
  }

  return { html, total, brancher };
}
