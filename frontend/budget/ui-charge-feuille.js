// Feuille de réglage d'UNE charge, ouverte au tap sur son libellé (écran Mois) ou sur son
// nom (Réglages · Charges). Quatre questions, dans l'ordre où on se les pose (D-040, D-042) :
//   1. Le montant revient-il chaque mois ? « Toujours le même » (noté ici) ou « Change chaque
//      mois » (on reprend le dernier) ;
//   2. Qui paie quoi ? 50/50, prorata, clé fixe, un seul paie — la part de chacun sous chaque option ;
//   3. Où va l'argent ? Commun, ou un autre compte (compte-charge.js) ;
//   4. Nom et catégorie.
// Les choix sont locaux jusqu'à « Enregistrer » : un seul geste écrit, comme partout ailleurs
// dans les feuilles. Mobile : feuille ; PC : colonne de droite de l'écran Mois, ou feuille
// depuis Réglages · Charges (qui n'a pas de colonne).

import { euros, versCentimes, regleEffective } from "./calc.js";
import { $, txt, toast, ouvrirFeuille, fermerFeuille } from "../socle/ui-base.js";
import { ouvrirPanneau, fermerPanneau, choixDetaille, marquerChoix } from "../socle/blocs.js";
import { champ, select, membresOptions, lire, enEuros } from "../socle/blocs-form.js";
import { REGLES, libelleRegle, optionsRegle } from "./repartition.js";
import { FIXE, VARIABLE, faconDe, montantHabituel, optionsFacon } from "./habituel.js";
import { AIDE_SANS_COMPTE, aAutreCompte, compteDeCharge, optionsCompte, choisirCompte } from "./compte-charge.js";

const ASIDE = "#reglages-pc";

/** `categories` : liste proposée dans le select (celle de la charge est ajoutée si absente). */
export function creerFeuilleCharge(api, etat, cb, categories) {
  let ouverte = null; // { enFeuille, apres } de la feuille affichée

  const ligne = (id) => etat.lignes[id];

  function html(c) {
    const regleMois = regleEffective(c, ligne(c.id));
    const saisi = ligne(c.id) !== undefined;
    const m = ligne(c.id)?.montant_centimes ?? 0;
    const habituel = montantHabituel(c, etat.derniers);
    // Écart utile seulement pour « Toujours le même » : ce mois diffère du montant noté.
    const ecart = !c.defaut_dernier && saisi && c.montant_defaut != null && m !== c.montant_defaut;
    const cats = categories.includes(c.categorie) ? categories : [...categories, c.categorie];
    return `<form class="pile reglages" data-charge="${c.id}" novalidate>
      <div class="detail-tete"><div><h2>${txt(c.libelle)}</h2>
        <span class="sous">${txt(c.categorie)}${habituel != null ? ` · habituellement ${txt(euros(habituel))}` : ""}</span></div>
        <button type="button" class="btn-lien" data-fermer-reglages>Fermer</button></div>

      ${ecart ? `<div class="ecart-mois">
        <span>Ce mois : <strong class="mono">${euros(m)}</strong> au lieu de ${euros(c.montant_defaut)}</span>
        <button type="button" class="btn-lien" data-garder-mois>Garder ${euros(m)} pour les mois suivants</button>
      </div>` : ""}

      <fieldset class="bloc-reglage"><legend class="etiquette">Le montant, chaque mois</legend>
        ${choixDetaille(optionsFacon(c, etat.derniers), faconDe(c), { attr: "facon", etiquette: "Le montant, chaque mois" })}
        <label data-si-facon="${FIXE}"${c.defaut_dernier ? " hidden" : ""}>Montant
          <input class="champ champ-montant grand-montant" name="montant_defaut" inputmode="decimal"
                 value="${enEuros(c.montant_defaut)}" placeholder="ex. -1200,00"></label>
      </fieldset>

      <fieldset class="bloc-reglage"><legend class="etiquette">Qui paie quoi</legend>
        ${choixDetaille(optionsRegle(etat, c, REGLES.map(([v]) => v)), c.regle, { attr: "regle", etiquette: "Qui paie quoi" })}
        <div data-si-regle="cle"${c.regle === "cle" ? "" : " hidden"}>
          ${champ("cle_pct", `Part de ${etat.membres[0]?.prenom ?? ""} (%)`, { type: "number", valeur: c.cle_pct ?? 50, attrs: 'min="0" max="100"' })}</div>
        <div data-si-regle="perso"${c.regle === "perso" ? "" : " hidden"}>
          ${select("payeur", "Qui paie", membresOptions(etat), c.payeur)}</div>
        ${regleMois !== c.regle ? `<p class="regle-mois">Ce mois-ci seulement : ${txt(libelleRegle(regleMois))}
          <button type="button" class="btn-lien" data-rendre-defaut>Revenir à ${txt(libelleRegle(c.regle))}</button></p>` : ""}
      </fieldset>

      <fieldset class="bloc-reglage"><legend class="etiquette">Où va l'argent</legend>
        ${select("compte", "va sur", optionsCompte(etat.comptes), compteDeCharge(c, etat.recurrents))}
        ${aAutreCompte(etat.comptes) ? "" : `<p class="aide-compte">${txt(AIDE_SANS_COMPTE)}</p>`}
      </fieldset>

      <fieldset class="bloc-reglage"><legend class="etiquette">Nom et catégorie</legend>
        ${champ("libelle", "Nom", { valeur: c.libelle, requis: true })}
        ${select("categorie", "Catégorie", cats.map((k) => [k, k]), c.categorie)}
      </fieldset>

      <div class="detail-actions">
        <button type="button" class="btn" data-archiver>Archiver</button>
        <button type="submit" class="btn btn-bleu grandir">Enregistrer</button>
      </div>
    </form>`;
  }

  /** `enFeuille` : toujours en feuille (Réglages · Charges) ; `apres` : rendu de l'écran appelant. */
  function ouvrir(id, { enFeuille = false, apres = null } = {}) {
    const c = etat.charges.find((x) => x.id === id);
    if (!c) throw new Error(`charge introuvable : ${id}`);
    ouverte = { enFeuille, apres };
    let racine;
    if (enFeuille) { ouvrirFeuille(html(c)); racine = $("#feuille-corps"); }
    else racine = ouvrirPanneau(ASIDE, html(c));
    brancher(c, racine);
  }

  function fermer() {
    if (ouverte?.enFeuille) fermerFeuille();
    else fermerPanneau(ASIDE);
    ouverte = null;
  }

  /** Après une écriture : recalcul, écran Mois, écran appelant (`apres`). */
  function rafraichirEcrans(apres) {
    cb.recalculer();
    cb.rendreMois();
    apres?.();
  }

  /** Écrit, ferme la feuille, rafraîchit. Une saisie invalide s'annonce en toast, sans écrire.
   *  `ecrire` renvoie true quand le compte de la charge a changé : le module se recharge alors,
   *  ce qui crée le virement du mois s'il manque (compte-charge.js). */
  async function enregistrerPuisFermer(ecrire, message) {
    const { apres } = ouverte;
    try {
      const recharger = await ecrire();
      fermer();
      rafraichirEcrans(apres);
      toast(message);
      if (recharger) await cb.rafraichir?.("budget");
    } catch (e) { cb.echec(e); }
  }

  function brancher(c, racine) {
    const form = racine.querySelector("form.reglages");
    let facon = faconDe(c);
    let regle = c.regle;
    const montrer = (attr, valeur) => {
      for (const el of form.querySelectorAll(`[data-si-${attr}]`)) el.hidden = el.dataset[`si${attr[0].toUpperCase()}${attr.slice(1)}`] !== valeur;
    };

    form.querySelector("[data-fermer-reglages]").addEventListener("click", fermer);
    for (const b of form.querySelectorAll("[data-facon]")) {
      b.addEventListener("click", () => { facon = b.dataset.facon; marquerChoix(b); montrer("facon", facon); });
    }
    for (const b of form.querySelectorAll("[data-regle]")) {
      b.addEventListener("click", () => { regle = b.dataset.regle; marquerChoix(b); montrer("regle", regle); });
    }

    form.querySelector("[data-garder-mois]")?.addEventListener("click", async () => {
      const m = ligne(c.id).montant_centimes;
      try {
        await api.majCharge(c.id, { montant_defaut: m });
        c.montant_defaut = m;
        rafraichirEcrans(ouverte.apres);
        toast(`${c.libelle} : ${euros(m)} pour les mois suivants.`);
        ouvrir(c.id, ouverte);
      } catch (e) { cb.echec(e); }
    });

    form.querySelector("[data-rendre-defaut]")?.addEventListener("click", async () => {
      try {
        await api.majLigne(etat.annee, etat.mois, c.id, { regle: null, montant_centimes: ligne(c.id).montant_centimes });
        etat.lignes[c.id] = { ...ligne(c.id), regle: null };
        rafraichirEcrans(ouverte.apres);
        ouvrir(c.id, ouverte);
      } catch (e) { cb.echec(e); }
    });

    // Une charge archivée n'envoie plus rien : son virement vers un autre compte s'arrête aussi.
    form.querySelector("[data-archiver]").addEventListener("click", () => enregistrerPuisFermer(async () => {
      await api.majCharge(c.id, { actif: false });
      c.actif = false;
      return choisirCompte(api, etat, c, null);
    }, `${c.libelle} archivée.`));

    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const champs = lireChamps(form, facon, regle);
      if (typeof champs === "string") { toast(champs); return; }
      const compte = form.elements.compte.value ? Number(form.elements.compte.value) : null;
      enregistrerPuisFermer(async () => {
        await api.majCharge(c.id, champs);
        Object.assign(c, champs);
        // Après la charge : le titre du virement et son compte de départ suivent le nom et la
        // règle qu'on vient d'écrire. Sans changement, choisirCompte n'écrit rien.
        return choisirCompte(api, etat, c, compte);
      }, `${champs.libelle} enregistrée.`);
    });
  }

  return { ouvrir, fermer };
}

/** Champs à écrire, ou le message à montrer si la saisie ne tient pas. */
function lireChamps(form, facon, regle) {
  const v = lire(form, { nombres: ["cle_pct"] });
  if (!v.libelle) return "Le nom de la charge est vide.";
  const champs = { libelle: v.libelle, categorie: v.categorie, regle, defaut_dernier: facon === VARIABLE };
  // « Toujours le même » sans montant ne voudrait rien dire : on le demande.
  if (facon === FIXE) {
    if (!v.montant_defaut) return `Note le montant de « ${v.libelle} », ou choisis « Change chaque mois ».`;
    try { champs.montant_defaut = versCentimes(v.montant_defaut); }
    catch { return `Montant illisible : « ${v.montant_defaut} ».`; }
  }
  if (regle === "cle") {
    if (v.cle_pct == null || v.cle_pct < 0 || v.cle_pct > 100) return "La part doit être entre 0 et 100 %.";
    champs.cle_pct = v.cle_pct;
  }
  if (regle === "perso") {
    if (!v.payeur) return "Choisis qui paie.";
    champs.payeur = v.payeur;
  }
  return champs;
}
