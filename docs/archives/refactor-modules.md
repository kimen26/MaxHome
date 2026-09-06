# Brief — Refactor : modules auto-décrits, blocs de comportement, occurrences uniques

_Brief jetable (convention memory/). À déposer dans `docs/briefs/refactor-modules.md`.
Périmètre : les trois modules (Budget, Tâches, Courses) + la façon dont un 4e se branche.
Zéro changement fonctionnel, zéro migration. Chaque lot laisse les 4 portes vertes._

## Constat (audit du 2026-09-07)

Ce qui tient déjà : `blocs.js` (affichage), `api.js` (accès), `calc.js` / `taches.js`
(métier pur, testés), `MODULES` déclaratif, optimiste + rollback partout. Invariant 6 respecté.

Ce qui reste dupliqué, par ordre de coût :

| # | Duplication | Où | Lignes |
|---|---|---|---|
| 1 | Patron « check-list + panneau de détail » : `detailEnCours`, `basculer` (figer → fermer feuille → rendre → réouvrir PC → rollback), `ouvrirDetail`/`fermerDetail`, auto-ouverture du premier sur PC, `marquerChoisi` | ui-mouvements, ui-taches | ~60 ×2 |
| 2 | Patron « réglages CRUD » : liste + bouton `+ Nouveau` + feuille-formulaire + submit → `maj`/`creer` → `Object.assign`/`push` → fermer → rendre → toast → rafraîchir | ui-recurrents, ui-taches-rec, ui-comptes | ~35 ×3 |
| 3 | `genererOccurrences` en deux versions (mouvements : par mois ; tâches : par jour + purge) | ui-mouvements, ui-taches | ~15 ×2 |
| 4 | `app.js` connaît chaque module par nom : 8 imports, `ui = {…}`, `rendreEcran` en if/else, `chargerMois`/`chargerTaches`/`chargerCourses`, résumé de l'accueil | app.js | ~80 |
| 5 | 6 formulaires en feuille écrits à la main (`<label>… <input class="champ" name=… value="${txt(…)}">`) ; `<option>` sans `value` échappé pour les prénoms | tous les ui-* | ~120 |
| 6 | `rendreAjustements` + bouton dans app.js (appartient à ui-charges) ; `prompt()`/`confirm()` natifs à côté de feuilles maison ; `import("./calc.js")` dynamique inutile | app.js, ui-mouvements, ui-recurrents, ui-comptes, ui-courses | — |

**Ce qu'on ne fait pas.** Pas de micro-services : un couple, deux téléphones, Supabase + RLS
est déjà le backend. La granularité correcte est *module front auto-décrit + table Postgres +
fichier bot Python* (D-007, D-021). Le seul service isolé qui a du sens existe déjà : le bot.
Pas de framework, pas de build (D-001). Pas de `foyer_id` (D-018).

## Cible : arborescence `frontend/`

```
app.js              orchestrateur : auth, état, puces de mois, boucle sur MODULES — ne cite aucun module
ui-base.js          inchangé sauf : MODULES devient un import de modules.js (voir Lot 3)
modules.js          registre : import des 3 (puis N) modules, expose MODULES + ordre
blocs.js            blocs d'AFFICHAGE (inchangé)
blocs-checklist.js  bloc de COMPORTEMENT : check-list + détail                 (Lot 1)
blocs-reglages.js   bloc de COMPORTEMENT : écran de réglages CRUD               (Lot 2)
blocs-form.js       helpers de formulaire : champ / select / options / lire     (Lot 2)
occurrences.js      métier pur : synchroniserOccurrences(api, etat, module)     (Lot 1)
mod-budget.js       descripteur du module Budget (écrans, onglets, charger, résumé)   (Lot 3)
mod-taches.js       idem Tâches
mod-courses.js      idem Courses
ui-*.js             écrans, allégés : ne gardent que le HTML spécifique et les règles d'affichage
```

Un fichier reste < 400 lignes (D-007). Les `ui-*.js` perdent 30–50 % de leur volume.

## Lot 1 — `blocs-checklist.js` + `occurrences.js` (Budget « Ce mois » et Tâches « Aujourd'hui »)

### Signature

```js
// blocs-checklist.js
/**
 * Fabrique une check-list avec panneau de détail (aside sur PC, feuille sur mobile).
 * Le module fournit les données et le HTML ; le bloc porte le comportement.
 */
export function creerCheckList({
  ecran,        // "#ecran-mois"          racine DOM de l'écran (pour brancherCoches / marquerChoisi)
  aside,        // "#detail-pc"           colonne de détail PC
  trouver,      // (id) => element        l'objet métier depuis l'état
  premier,      // () => element|null     celui à ouvrir d'office sur PC quand rien n'est ouvert
  htmlDetail,   // (el) => string         HTML du panneau (le module l'écrit, avec enteteDetail)
  brancherDetail, // (el, racine, { basculer, fermer }) => void   listeners spécifiques (copier, consigne, data-pour…)
  basculer: {
    figer,      // (el) => valeur         lue AVANT la date (L-008) : montant ou points
    appliquer,  // (el, figee, options) => champsEcrits   mute `el`, renvoie l'objet passé à `ecrire`
    ecrire,     // (id, champs) => Promise                api.majX
    message,    // (el, avant) => string                  texte du toast
    apres,      // () => void                             cb.surTaches?.(), recalcul…
  },
  rendre,       // () => void             le rendu de l'écran (fourni par le module, appelé par le bloc)
}) → { ouvrirDetail(id), fermerDetail(), basculer(id, options), apresRendu() }
```

`apresRendu()` remplace les 6 lignes de fin de `rendre()` des deux modules :
`brancherCoches` + auto-ouverture du premier sur PC (respecte `detailEnCours`) + `marquerChoisi`.

`basculer(id, options)` porte l'unique copie de : sauvegarde `avant` (les clés renvoyées par
`appliquer`), `figer` avant date, fermer feuille si mobile, `detailEnCours` pendant le rendu,
réouverture PC, `ecrire` puis toast, rollback `Object.assign(el, avant)` + re-rendu + `cb.echec`.

### Usage Tâches (extrait)

```js
const liste = creerCheckList({
  ecran: "#ecran-jour", aside: "#detail-tache-pc",
  trouver: (id) => etat.taches.find((t) => t.id === id),
  premier: () => duJour()[0] ?? faitesAujourdhui()[0],
  htmlDetail, rendre,
  brancherDetail: (t, racine, { basculer }) => {
    for (const b of racine.querySelectorAll("[data-pour]")) b.addEventListener("click", () => basculer(t.id, { pour: b.dataset.pour }));
    for (const b of racine.querySelectorAll("[data-qui]")) b.addEventListener("click", () => attribuer(t, b.dataset.qui));
    racine.querySelector("[data-vers-reglages]")?.addEventListener("click", () => { liste.fermerDetail(); montrerEcran("taches-rec"); });
  },
  basculer: {
    figer: (t) => pointsDe(recDe(t), t),
    appliquer: (t, figes, { pour = etat.prenom } = {}) => {
      if (t.fait_le) Object.assign(t, { fait_le: null, points: 0, qui: recDe(t)?.attribue_a ?? null });
      else Object.assign(t, { fait_le: new Date().toISOString(), qui: pour, points: figes });
      return { fait_le: t.fait_le, qui: t.qui, points: t.points };
    },
    ecrire: api.majTache,
    message: (t, avant) => avant.fait_le ? "Coche annulée." : `Fait. +${pts(t.points)} pour ${t.qui}.`,
    apres: () => cb.surTaches?.(),
  },
});
```

Le bouton `[data-basculer]` et `[data-fermer-detail]` sont branchés par le bloc lui-même ;
`brancherDetail` ne s'occupe que du reste.

Courses n'a pas de détail : elle garde `brancherCoches` direct. Ne pas forcer.

### `occurrences.js`

```js
/**
 * Purge les occurrences périmées et crée les manquantes. Une seule boucle, deux stratégies.
 * `strategie` = { existantes(etat), perimees(existantes), manquantes(etat, existantes),
 *                 supprimer(api, ids), creer(api, lignes), poser(etat, restantes, creees) }
 */
export async function synchroniserOccurrences(api, etat, strategie)
export const STRATEGIE_MOUVEMENTS  // perimees: () => [] ; manquantes: récurrents actifs absents du mois, montantTheorique
export const STRATEGIE_TACHES      // perimees: taches.perimees ; manquantes: taches.occurrencesManquantes
```

`montantTheorique` déménage de ui-mouvements.js vers calc.js (il est pur, le bot en a le miroir
`mouvements.py`) ; `test_calc.mjs` gagne 3 cas (fixe / charge / part). Les `manquantes` des deux
stratégies sont déjà testées (`test_taches.mjs`) ou le deviennent.

### Porte de sortie du lot
`node tests/test_calc.mjs`, `test_taches.mjs`, recette visuelle : captures `jour-*` et
`accueil/mois-*` identiques au pixel près (comparer aux captures actuelles avant de commencer :
les copier dans `data/captures/avant/`). Recette connectée (coche d'une tâche).

## Lot 2 — `blocs-reglages.js` + `blocs-form.js` (Récurrents, Tâches récurrentes, Comptes)

### `blocs-form.js` — helpers HTML, échappement garanti

```js
export const champ = (name, label, { type = "text", valeur = "", attrs = "" } = {}) =>
  `<label>${txt(label)} <input class="champ" name="${name}" type="${type}" value="${txt(valeur)}" ${attrs}></label>`;
export const zone  = (name, label, valeur = "", lignes = 2) => …textarea…;
export const select = (name, label, options, choisi, { vide = null } = {}) =>
  // options : [[valeur, libellé]] ; `vide` = libellé de l'option "" en tête (« — », « Personne en particulier »)
export const caseACocher = (name, label, coche) => …;
export const membresOptions = (etat) => etat.membres.map((m) => [m.prenom, m.prenom]);
export const comptesOptions = (etat) => etat.comptes.map((c) => [String(c.id), c.nom]);
/** Lit un FormData en objet : trim des chaînes, "" → null, Number() sur les clés listées. */
export const lire = (form, { nombres = [], booleens = [] } = {}) => …;
```

Corrige au passage les `<option>` prénom sans `value` (le libellé sert de valeur : fragile si un
prénom contient un `&`).

### `blocs-reglages.js`

```js
/**
 * Écran de réglages : une liste d'éléments avec Modifier / Retirer, un bouton « + Nouveau »,
 * un formulaire en feuille. Le module fournit le HTML de la liste et du formulaire, les
 * champs à lire, et l'appel API. Le bloc porte le cycle ouvrir → soumettre → écrire → fermer
 * → rendre → toast → rafraîchir, et le rollback.
 */
export function creerReglages({
  liste,          // "#liste-recurrents"    conteneur de la liste
  bouton,         // "#form-recurrent"      conteneur du bouton « + Nouveau »
  libelleNouveau, // "+ Nouveau mouvement récurrent"
  elements,       // () => array           depuis l'état
  htmlListe,      // (elements) => string  carteListe(… ligneReglage …) ou cartes maison (Comptes)
  htmlForm,       // (el|null) => string   corps du <form> (sans la balise form ni le bouton submit)
  apresOuverture, // (form, el) => void    visibilité conditionnelle (data-si), optionnel
  champs,         // (form, el) => objet   lecture du formulaire → colonnes
  api: { creer, maj, retirer },  // retirer : (el) => Promise ; le module choisit désactiver ou supprimer
  apresEcriture,  // () => Promise         cb.rafraichirMois / rafraichirTaches
  confirmerRetrait, // (el) => string      texte de confirmation
  messageRetrait,   // "Mouvement retiré."
}) → { rendre(), formulaire(el|null) }
```

La confirmation passe par une feuille maison `confirmer(texte) → Promise<boolean>` ajoutée à
ui-base.js (remplace les 4 `confirm()` natifs ; `prompt()` des ajustements passe en formulaire
en feuille dans ui-charges, voir Lot 4).

Comptes garde ses cartes (pas `ligneReglage`) : `htmlListe` le permet, `brancherReglages` marche
déjà avec ses `data-modifier` / `data-retirer`.

### Porte de sortie
Recette visuelle : `recurrents-*`, `taches-rec-*`, `comptes-*` identiques. Recette connectée.

## Lot 3 — `modules.js` + `mod-*.js` : app.js ne cite plus aucun module

### Descripteur

```js
// mod-taches.js
export default {
  cle: "taches", nom: "Tâches", defaut: "jour", avecMois: false,
  onglets: [["jour", "Aujourd’hui"], ["balance", "Balance"], ["taches-rec", "Réglages"]],
  plus: [],
  etatInitial: { tachesRec: [], taches: [] },
  /** Références chargées une fois au démarrage (en parallèle des autres modules). */
  referentiels: (api) => ({ tachesRec: api.tachesRec() }),
  /** Fabrique les écrans. Renvoie { [nomEcran]: () => void } et les hooks. */
  creer(api, etat, cb) {
    const jour = creerUiTaches(api, etat, cb);
    const rec = creerUiTachesRec(api, etat, cb);
    return {
      ecrans: { jour: jour.rendre, balance: rec.rendreBalance, "taches-rec": rec.rendre },
      avantChargement: () => jour.fermerDetail(),
      async charger() {
        etat.taches = await api.taches(decalerJours(jourIso(new Date()), -35));
        await synchroniserOccurrences(api, etat, STRATEGIE_TACHES);
      },
      surMois: null,                 // Budget : () => charger() ; Tâches et Courses : rien
      resume: () => "…",             // texte de la carte d'accueil
    };
  },
};
```

```js
// modules.js
import budget from "./mod-budget.js";
import taches from "./mod-taches.js";
import courses from "./mod-courses.js";
export const LISTE = [budget, taches, courses];
export const MODULES = Object.fromEntries(LISTE.map((m) => [m.cle, m]));
```

`ui-base.js` importe `MODULES` depuis modules.js au lieu de le définir (ses helpers
`moduleDe`, `rendreOnglets`, `menuPlus` ne changent pas). `app.js` :

```js
for (const m of LISTE) Object.assign(etat, m.etatInitial);
const refs = await Promise.all(LISTE.map((m) => Object.entries(m.referentiels(api))…));
const instances = Object.fromEntries(LISTE.map((m) => [m.cle, m.creer(api, etat, cb)]));
const rendreEcran = (nom) => nom === "accueil" ? rendreAccueil()
  : instances[moduleDe(nom)].ecrans[nom]();
const charger = (cle) => …instances[cle].avantChargement?.(); await instances[cle].charger(); rendreSi(cle)…
window.addEventListener("hashchange", () => charger("budget"));  // seul module avecMois
```

`cb` s'uniformise : `{ echec, recalculer, rafraichir(cle) }` — plus de `rafraichirMois` /
`rafraichirTaches` / `surTaches` distincts. `rendreAccueil` boucle sur `LISTE` et appelle
`instances[cle].resume()`.

`index.html` : les `<section class="ecran" id="ecran-…">` restent statiques (le HTML ne se
génère pas, invariant de lisibilité). Ajouter un module = un `mod-x.js`, ses `ui-x.js`, ses
sections dans index.html, une ligne dans modules.js, ses tables, son `x.py` côté bot.

### Porte de sortie
Toutes les captures identiques. Recette connectée (login + RLS + coche). `app.js` < 150 lignes.

## Lot 4 — Nettoyage (petit)

- `rendreAjustements` + bouton → `ui-charges.js`, formulaire en feuille (montant, motif) via
  `blocs-form.js`, plus de `prompt()`.
- `import("./calc.js")` dynamique → import statique (ui-mouvements, app).
- `ui-taches.js` : grouper les occurrences d'un même récurrent (biberon 1/2 et 2/2) sous une
  ligne « Biberon · 0/2 » avec deux cases. Rendu seulement, `taches.js` inchangé — le bot
  liste toujours par occurrence. Décision UI à graver (D-023) car ça touche la lecture de la
  liste sur les deux canaux.
- Recette visuelle : ajouter une comparaison pixel avec `data/captures/avant/` (playwright
  `toHaveScreenshot` ou `pixelmatch`) pour que les Lots 1–3 soient vérifiables sans œil humain
  sur le « rien n'a bougé » — l'œil reste obligatoire sur ce qui a bougé (L-009).

## Côté bot (rien de structurel)

Le bot est déjà découpé par module (`mouvements.py`, `taches.py`, + courses dans `actions.py`).
Deux alignements seulement :
- `montantTheorique` déménageant vers calc.js, `calc_cli.mjs` l'expose ; `mouvements.py` peut
  cesser d'en porter un miroir manuel et passer par le CLI comme `calc` (L-014 : confrontation,
  pas duplication). À faire si le miroir a déjà divergé une fois (D-022 suggère oui).
- Sortir les commandes courses de `actions.py` vers `courses.py` pour que le découpage bot
  soit le miroir exact du découpage front : un module = un `.py`.

## Ordre et effort

Lot 1 (½ journée) → Lot 2 (½ journée) → Lot 3 (½ journée) → Lot 4 (2 h). Chaque lot = un commit,
4 portes vertes, captures comparées. Lots indépendants : le 3 peut passer avant le 2 si le
besoin d'un 4e module arrive plus tôt.

## Décisions à graver

- D-0xx — Blocs de comportement (`blocs-checklist`, `blocs-reglages`) à côté des blocs
  d'affichage : un écran assemble les deux, il n'écrit ni HTML équivalent ni cycle
  optimiste/rollback équivalent. Étend l'invariant 6.
- D-0xx — Module auto-décrit (`mod-*.js`) : app.js ne connaît que `LISTE`. Un module = un
  descripteur + ses écrans + ses tables + son `.py`.
- D-0xx — Pas de micro-services ni de backend dédié tant que l'app sert un foyer. Reconsidérer
  seulement avec `foyer_id` (D-018), et alors côté Postgres/RLS, pas côté services.
