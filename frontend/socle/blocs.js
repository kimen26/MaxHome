// Blocs d'affichage partagés entre modules : ligne cochable, carte-liste, chiffres d'en-tête,
// ligne de réglage, panneau de détail. Chaque module assemble ces blocs, il ne redessine pas.

import { $, txt, estPC, ouvrirFeuille, fermerFeuille, feuilleOuverte } from "./ui-base.js";

/** Case à cocher franche (26 px, bord ≥ 3:1, zone de tap 48 px via ::before, D-024/D-042) :
 *  partagée par `ligneCoche` (mouvements) et toute ligne d'un module qui a besoin de LA MÊME
 *  case ailleurs qu'un `.mvt` (ex. ligne de charge du Budget, ui-mois-charges.js) — une seule
 *  définition, un seul style (.case dans socle.css), jamais deux gabarits qui divergent.
 *  `attr` : nom du data-attribut porteur de l'id (`cocher` par défaut, ex. `charge` ailleurs). */
export function caseACocher({ id, cochee = false, titre, attr = "cocher", classes = "" }) {
  const aria = cochee ? `Annuler la validation de ${titre}` : `Valider ${titre}`;
  return `<span class="case${cochee ? " cochee" : ""}${classes ? ` ${txt(classes)}` : ""}" data-${attr}="${id}"
        role="checkbox" aria-checked="${cochee}" tabindex="0" aria-label="${txt(aria)}">${cochee ? "✓" : ""}</span>`;
}

/**
 * Case à cocher tri-état (D-048) : même forme franche que `caseACocher` (26 px), mais un
 * tap fait tourner rien → moi → l'autre membre → rien au lieu de basculer un simple oui/non —
 * même principe que le cycle de coche des tâches (frontend/taches/ui-taches.js : deux personnes
 * plus « à deux »), ici à deux valeurs seulement (une charge ou un virement se valide par UNE
 * personne, jamais « à deux »). Couleur ET lettre disent qui (jamais la couleur seule) :
 * `case-cycle-vide/p1/p2` (socle.css). Branchée par `brancherCycles` (blocs-cycle.js) via
 * `data-cycle` — pas `data-cocher` : un cycle à N valeurs n'est pas une simple bascule.
 * @param valeur prénom courant, `null` (rien), ou `true` (D-048 : coché mais SANS prénom connu
 *               — coche d'avant D-048, ou posée par le bot) — rendu en case pleine « ✓ » verte,
 *               jamais une case vide qui mentirait sur l'état réel de la ligne. Jamais recalculé
 *               à part, dérivé de l'état réel par le module appelant (coche-ligne.js).
 * @param p1     premier prénom du foyer (initiale + couleur "p1" si `valeur === p1`, "p2" sinon).
 */
export function caseCycle({ id, valeur, p1, titre, attr = "cycle" }) {
  const { libelle, classe } = valeur === null
    ? { libelle: "", classe: "case-cycle-vide" }
    : valeur === true
      ? { libelle: "✓", classe: "case-cycle-fait" }
      : { libelle: valeur[0].toUpperCase(), classe: valeur === p1 ? "case-cycle-p1" : "case-cycle-p2" };
  const aria = valeur === null ? `Valider ${titre}`
    : valeur === true ? `${titre} : validé. Tap pour changer.` : `${titre} : validé par ${valeur}. Tap pour changer.`;
  return `<span class="case ${classe}" data-${attr}="${id}"
        role="button" tabindex="0" aria-label="${txt(aria)}">${txt(libelle)}</span>`;
}

/** Ligne cochable (mouvement, tâche) : case à gauche, corps, colonne de droite.
 *  Variante `compacte` (D-036, fidélité maquette Courses) : 29 px, case 17 px vide, titre
 *  13 px 600, valeur mono 10 px à droite — pas de sous-ligne, pas de concaténation dans le
 *  titre. Sa case peut aussi porter la lettre d'une personne (`caseTexte`, `caseClasse`) au
 *  lieu du ✓, pour le panier (case = qui a pris l'article). N'émet aucune classe `.mvt` :
 *  c'est un gabarit distinct, stylé par le module qui l'utilise (courses.css), pas une
 *  variante du `.mvt` du Budget (D-036 §CSS par module : une règle ne vit qu'à un endroit).
 *  `cycle: { valeur, p1 }` (D-048) remplace la case ✓ binaire par la case tri-état
 *  (`caseCycle`, `data-cycle` au lieu de `data-cocher`) — le mouvement se valide alors « pour
 *  Claudia » / « pour Yann » comme une ligne de charge, pas un simple fait/pas fait. */
export function ligneCoche({ id, titre, sous = "", notes = [], droite = "", pastille = null,
  cochee = false, prioritaire = false, alerte = false, compacte = false, caseTexte = "",
  caseClasse = "", droiteMono = true, cycle = null }) {
  if (compacte) {
    const aria = cochee ? `Annuler la coche de ${titre}` : `Marquer ${titre} comme fait`;
    const classes = ["ligne-compacte", "cliquable", cochee ? "fait" : ""].filter(Boolean).join(" ");
    return `<div class="${classes}" data-id="${id}">
      <span class="case-compacte${cochee ? " cochee" : ""} ${txt(caseClasse)}" data-cocher="${id}"
            role="checkbox" aria-checked="${cochee}" tabindex="0" aria-label="${txt(aria)}">${txt(caseTexte)}</span>
      <span class="titre-compact">${txt(titre)}</span>
      <span class="${droiteMono ? "mono " : ""}valeur-compacte">${droite}</span>
    </div>`;
  }
  const classes = ["mvt", "cliquable", cochee ? "fait" : "", alerte ? "alerte" : ""].filter(Boolean).join(" ");
  return `<div class="${classes}" data-id="${id}">
    ${cycle ? caseCycle({ id, valeur: cycle.valeur, p1: cycle.p1, titre })
      : caseACocher({ id, cochee, titre, classes: prioritaire ? "prioritaire" : "" })}
    <div class="mvt-corps">
      <span class="mvt-titre">${txt(titre)}</span>
      ${sous ? `<span class="mvt-trajet">${txt(sous)}</span>` : ""}
      ${notes.filter(Boolean).map((n) => `<span class="mvt-note">${txt(n)}</span>`).join("")}
    </div>
    <div class="mvt-droite">${droite}${pastille ? `<span class="pastille">${txt(pastille)}</span>` : ""}</div>
  </div>`;
}

/** Enveloppe une liste de lignes, ou affiche le texte « vide ». */
export const carteListe = (lignes, vide) =>
  lignes.length ? `<div class="carte-liste">${lignes.join("")}</div>` : `<p class="vide">${txt(vide)}</p>`;

/** Chiffres d'en-tête : [{ etiquette, valeur, accent }]. */
export const chiffres = (liste) => liste.map(({ etiquette, valeur, accent }) =>
  `<span class="chiffre"><span class="etiquette">${txt(etiquette)}</span>
   <span class="mono valeur${accent ? " accent" : ""}">${txt(valeur)}</span></span>`).join("");

export const titreSection = (t) => `<h2 class="titre-section">${txt(t)}</h2>`;

/** Branche les cases et les lignes d'une racine : `surCoche(id)`, `surLigne(id)`.
 *  `[data-valider]` (charges du Budget, `attr:"valider"` de `caseACocher`) suit la même règle
 *  que `[data-cocher]` : une seule mécanique de bascule + tap-sur-la-ligne pour tout le socle
 *  (D-024), jamais un second branchement dupliqué par module. */
export function brancherCoches(racine, surCoche, surLigne) {
  for (const el of racine.querySelectorAll("[data-cocher], [data-valider]")) {
    const id = Number(el.dataset.cocher ?? el.dataset.valider);
    const agir = (e) => { e.stopPropagation(); surCoche(id); };
    el.addEventListener("click", agir);
    el.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); agir(e); } });
  }
  if (surLigne) {
    for (const el of racine.querySelectorAll(".mvt[data-id], .ligne-compacte[data-id], .mois-charge[data-id]")) {
      el.addEventListener("click", () => surLigne(Number(el.dataset.id)));
    }
  }
}

/** Branche les boutons Modifier / Retirer d'un écran de réglages. */
export function brancherReglages(racine, surModifier, surRetirer) {
  for (const b of racine.querySelectorAll("[data-modifier]")) {
    b.addEventListener("click", () => surModifier(Number(b.dataset.modifier)));
  }
  for (const b of racine.querySelectorAll("[data-retirer]")) {
    b.addEventListener("click", () => surRetirer(Number(b.dataset.retirer)));
  }
}

/**
 * Sérialise les écritures d'un même élément : l'affichage est optimiste, donc deux gestes
 * rapprochés (coche puis décoche) partiraient en parallèle et la base garderait celui qui
 * arrive en dernier, pas le dernier fait. Chaque élément a sa file ; les éléments distincts
 * restent parallèles.
 */
export function creerFileEcritures() {
  const files = new Map();
  return (cle, ecrire) => {
    const suivant = (files.get(cle) ?? Promise.resolve()).catch(() => {}).then(ecrire);
    files.set(cle, suivant);
    suivant.finally(() => { if (files.get(cle) === suivant) files.delete(cle); });
    return suivant;
  };
}

/** Surligne la ligne dont le détail est ouvert (PC). */
export function marquerChoisi(racine, id) {
  for (const el of racine.querySelectorAll(".mvt[data-id]")) el.classList.toggle("choisi", Number(el.dataset.id) === id);
}

/** « De → Vers » d'un mouvement ; invite à définir les comptes tant qu'ils manquent. */
export function trajetComptes(comptes, idDe, idVers) {
  const nom = (id) => comptes.find((c) => c.id === id)?.nom ?? null;
  const de = nom(idDe);
  const vers = nom(idVers);
  if (!de && !vers) return "Comptes à définir";
  return `${de ?? "compte à définir"} → ${vers ?? "compte à définir"}`;
}

/** Ligne d'un écran de réglages (récurrent, tâche récurrente) avec Modifier / Retirer. */
export function ligneReglage({ id, titre, sous = "", consigne = "", droite = "", pastille = null, inactif = false }) {
  return `<div class="rec${inactif ? " inactif" : ""}">
    <div class="rec-corps">
      <span class="rec-titre">${txt(titre)}</span>
      ${sous ? `<span class="rec-trajet">${sous}</span>` : ""}
      ${consigne ? `<span class="rec-consigne">${txt(consigne)}</span>` : ""}
    </div>
    <div class="rec-droite">${droite}${pastille ? `<span class="pastille">${txt(pastille)}</span>` : ""}</div>
    <div class="rec-actions">
      <button class="btn-lien" data-modifier="${id}">Modifier</button>
      <button class="btn-lien" data-retirer="${id}">Retirer</button>
    </div>
  </div>`;
}

export const enteteDetail = (titre, sous) => `<div class="detail-tete">
  <div><h2>${txt(titre)}</h2><span class="sous">${txt(sous)}</span></div>
  <button class="btn-lien" data-fermer-detail>Fermer</button></div>`;

/** Panneau de détail : colonne de droite sur PC, feuille sur mobile. Renvoie la racine DOM. */
export function ouvrirPanneau(selecteurAside, html) {
  if (estPC()) {
    const a = $(selecteurAside);
    a.innerHTML = html;
    a.hidden = false;
    return a;
  }
  ouvrirFeuille(html);
  return $("#feuille-corps");
}
export function fermerPanneau(selecteurAside) {
  if (feuilleOuverte()) fermerFeuille();
  const a = $(selecteurAside);
  a.hidden = true;
  a.innerHTML = "";
}
/** Choix exclusif qui se lit sans légende : chaque option porte un titre et, dessous, ce
 *  qu'elle implique (« Prorata » / « C 47 % · Y 53 % »). L'option choisie est pleine ET
 *  cochée ✓ (socle.css) — jamais la couleur seule. `options` : [{ valeur, titre, detail }] ;
 *  chaque bouton porte `data-<attr>="<valeur>"`. `colonne` : une seule colonne pleine largeur
 *  (socle.css `.choix-detaille.colonne`) au lieu de la grille auto-fit — pour des détails longs
 *  qui ne doivent jamais se retrouver compressés à deux colonnes (ex. une adresse complète,
 *  relecture carnet-voyage §C). */
export const choixDetaille = (options, choisi, { attr = "choix", etiquette = "", colonne = false } = {}) =>
  `<div class="choix-detaille${colonne ? " colonne" : ""}" role="radiogroup"${etiquette ? ` aria-label="${txt(etiquette)}"` : ""}>${options.map(({ valeur, titre, detail = "" }) => {
    const actif = valeur === choisi;
    return `<button type="button" role="radio" aria-checked="${actif}" class="choix-option${actif ? " actif" : ""}" data-${attr}="${txt(valeur)}">
      <span class="choix-titre">${txt(titre)}</span>${detail ? `<span class="choix-detail">${txt(detail)}</span>` : ""}</button>`;
  }).join("")}</div>`;

/** Coche `bouton` dans son `choixDetaille` sans re-rendu (feuille en cours de saisie). */
export function marquerChoix(bouton) {
  for (const b of bouton.closest(".choix-detaille").querySelectorAll(".choix-option")) {
    b.classList.toggle("actif", b === bouton);
    b.setAttribute("aria-checked", String(b === bouton));
  }
}

/** Choix d'une personne : pastilles cliquables, `data-qui`. `extras` : choix en plus des
 *  prénoms, `[[valeur, libellé]]` (ex. « À deux » dans les Tâches). */
export const choixQui = (membres, choisi, extras = []) => `<div class="choix-qui">${[...membres.map((p) => [p, p]), ...extras].map(([v, lib]) =>
  `<button type="button" class="pastille grande${v === choisi ? " bleue" : ""}" data-qui="${txt(v)}">${txt(lib)}</button>`).join("")}</div>`;
