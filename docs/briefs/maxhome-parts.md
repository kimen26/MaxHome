# Brief — MaxHome : parts, obligatoire, partage, magasin, repas

_Brief jetable (convention memory/). Source : `inbox/design_handoff_maxhome_taches/`
(README.md = écrans, logique-metier.md = formules et migrations, maquette `.dc.html`).
Périmètre : module Tâches (refonte du barème et des trois écrans), module Courses
(magasin réordonnable, repas, classiques), bot Telegram (vocabulaire et coche à deux).
Budget : inchangé. Chaque lot laisse les portes de vérification vertes._

## Ce que le handoff change vraiment

Trois décisions de fond, tout le reste en découle :

1. **Les parts remplacent la pénibilité.** Échelle non linéaire choisie à la main
   `0,5 · 1 · 2 · 3 · 5 · 8`, stockée en **quarts de part** (entiers : 2, 4, 8, 12, 20, 32),
   comme les centimes pour l'argent. Les minutes restent affichées comme repère, jamais
   dans une formule. La pénibilité 1-5 et son plancher à 1 point disparaissent.
2. **Obligatoire est un axe séparé.** Un booléen qui ne rapporte rien : il affiche un point
   rouge, il trie, et il alimente un KPI hebdomadaire calculé sur les seules tâches
   obligatoires. C'est la réponse mesurée à « untel gère toujours l'incontournable », sans
   créer un second système de points en concurrence avec l'échelle.
3. **Fait à deux, les parts se divisent.** Une occurrence peut porter deux personnes
   (`qui` + `qui2`), chacune crédite `base / 2`. Diviser, jamais multiplier — sinon tout
   faire à deux devient la stratégie gagnante et la balance ne veut plus rien dire.

S'y ajoutent l'**écart par personne** (la même tâche peut coûter un cran de plus à l'un des
deux), la **cartographie du magasin** (ordre de parcours réglable qui pilote la liste de
courses) et une zone **Repas** dans Courses.

Le vocabulaire de l'interface dit **parts**, jamais points — y compris dans le bot.

## Points tranchés à l'ouverture du chantier

Le handoff laisse cinq questions ouvertes (§11 de `logique-metier.md`). Réponses retenues :

| Question | Tranché |
|---|---|
| Le mot | « parts » partout, bot inclus. Un seul mot, cohérent, mesurable. |
| Palier 5 de l'échelle | gardé. Un trou dans l'échelle se remarque, un palier inutilisé non. |
| `importance` | reste en base sans usage, `obligatoire` porte le tri. **Voir le piège ci-dessous.** |
| Ordre du magasin | celui du handoff, Boucherie après Surgelés, « Vêtements, livres, jeux » gardé. Réordonnable de toute façon. |
| Écart à deux crans | non. Un cran, une seule valeur par tâche. |

**Piège trouvé à la cartographie, à ne pas manquer** : `supabase/functions/rappel-taches/index.ts`
filtre les tâches à rappeler sur `importance == 3`. Si `importance` cesse d'être maintenue,
le rappel du soir se vide silencieusement. Le Lot 4 bascule ce filtre sur `obligatoire`.

## Ce qu'on ne fait pas

- Pas de recalcul de l'historique : les parts se figent à la coche (`taches.parts_quart`),
  comme les points aujourd'hui. Changer le barème ne réécrit jamais une semaine passée.
- Pas de nouveau système de couleurs : `style.css` porte déjà tous les tokens du handoff
  (`--bleu` #1f4e79, `--ambre-texte` #8a6d3b, `--mono` JetBrains). On étend, on ne refait pas.
- Pas de framework, pas de build, pas de `foyer_id` (D-001, D-018). Fichiers < 400 lignes.
- Pas de suppression de `penibilite` / `importance` dans cette migration : colonnes laissées
  en place, retirées plus tard une fois le barème validé à l'usage.

---

## Lot 1 — Le métier des parts (`taches.js` + migration 008)

Fondation de tout le reste. Aucun écran ne bouge dans ce lot.

### Migration `008_parts.sql` (additive, idempotente)

```sql
alter table taches_recurrentes add column if not exists parts_quart int not null default 4
  check (parts_quart in (2, 4, 8, 12, 20, 32));
alter table taches_recurrentes add column if not exists obligatoire boolean not null default false;
alter table taches_recurrentes add column if not exists partageable boolean not null default false;
alter table taches_recurrentes add column if not exists ecart_prenom text references membres(prenom);
alter table taches_recurrentes add column if not exists minutes int;   -- repère, hors calcul

alter table taches add column if not exists qui2 text references membres(prenom);
alter table taches add column if not exists parts_quart int not null default 0;  -- figé à la coche
-- contrainte ajoutée seulement si absente (add constraint n'a pas de if not exists)
```

Reprise de l'existant, dans la même migration :
`parts_quart = penibilite 1→4, 2→8, 3→12, 4→20, 5→32` ; `obligatoire = (importance = 3)` ;
`taches.parts_quart = points * 4`. Les tâches obligatoires de départ et les partageables sont
listées dans `logique-metier.md` §3 et §4 — les appliquer par `update ... where titre in (...)`.

Le fichier se termine par un `select` de contrôle (patron des migrations 006/007) qui compte
les lignes et vérifie qu'aucune n'a été perdue.

### `frontend/taches/taches.js`

Ajouts :

```js
export const ECHELLE_QUART = [2, 4, 8, 12, 20, 32];
/** « 0,5 » « 1,5 » « 8 » — virgule française, pas de zéro inutile. */
export const partsTexte = (q) => String(q / 4).replace(".", ",");
/** « 1 part » / « 2 parts » — un seul endroit, l'accord se fait ici (remplace pts()). */
export const parts = (q) => `${partsTexte(q)} part${q > 4 ? "s" : ""}`;

/** Parts d'une tâche pour la personne qui la fait. `qui` : prénom ou null. */
export function partsDe(recurrent, qui) { /* cf. logique-metier.md §2 */ }

/** Crédit d'une occurrence cochée : { Yann: q, Claudia: q } en quarts. */
export function creditDe(recurrent, tache) { /* cf. logique-metier.md §4 */ }
```

Modifications :

- `pointsDe()` **disparaît** (et son plancher à 1, D-022 devient caduc — le graver).
- `balance(taches, recurrents, membres, depuis, jusqu, { obligatoireSeul = false })` :
  la signature gagne `recurrents` (nécessaire pour lire `obligatoire`) et un objet d'options.
  Les crédits viennent de `creditDe()`, donc une occurrence peut créditer deux personnes.
  Les valeurs retournées sont en **quarts** (entiers). `points` est renommé `parts`.
- `trier()` : `obligatoire` non fait passe avant, à cadence égale. `importance` n'est plus lu.

### Tests — `tests/test_taches.mjs`

Les dix cas du tableau `logique-metier.md` §10, littéralement (L-007 : un cas du brief non
testé littéralement est un bug qui dort). Plus :

- `creditDe` sur une tâche non cochée (`qui` null) → objet vide.
- `balance` avec une occurrence à deux : les deux personnes créditées, total conservé.
- `balance({obligatoireSeul: true})` sur un jeu mixte → n'agrège que les obligatoires.
- Une occurrence cochée puis le barème changé → `taches.parts_quart` inchangé.

**Porte** : `node tests/test_taches.mjs` vert.

---

## Lot 2 — Le bloc « bouton-cycle » (socle)

La maquette est bâtie sur un geste unique : **tap = valeur suivante**. Il apparaît sept fois
(parts, oblig., à 2, fois par période, minutes, écart, et la coche tri-état `C → Y → CY → rien`).
Sans brique partagée, chaque écran réécrirait le même cycle — exactement ce que l'invariant 6
et D-024 interdisent.

Nouveau fichier `frontend/socle/blocs-cycle.js` :

```js
/** Bouton dont chaque tap avance d'un cran dans `valeurs`. Rend le HTML ; ne branche rien. */
export function boutonCycle({ cle, valeurs, valeur, rendu, classe = "" }) { /* ... */ }

/** Branche tous les [data-cycle] d'une racine : appelle surChangement(cle, valeurSuivante). */
export function brancherCycles(racine, surChangement) { /* ... */ }

/** Valeur suivante dans une liste, en boucle. `null` accepté comme valeur (cycle de l'écart). */
export const suivante = (valeurs, valeur) => valeurs[(valeurs.indexOf(valeur) + 1) % valeurs.length];
```

Règle d'accessibilité (non négociable, cf. `rules/mobile-parents.md`) : un bouton-cycle porte
un `aria-label` qui dit l'état **et** ce que fera le tap (« Parts : 2. Tap pour passer à 3 »),
jamais une information portée par la seule couleur. Les cycles de réglage font 30 px (usage
rare, à deux mains, accepté par le handoff) mais les cibles de l'écran Jour restent à 44 px.

**Porte** : `node tests/test_taches.mjs` (ajouter les cas de `suivante`, y compris le cycle
qui contient `null`).

---

## Lot 3 — Les trois écrans Tâches

### 3a. Jour (`ui-taches.js`, refonte)

Segmenté Jour | Semaine, bande des 7 jours (barre partagée Claudia/Yann au prorata des parts
du jour), deux colonnes de cartes (Matin / Soir, puis Cette semaine / Ce mois), barre « Fait · N »
repliable, légende. Détails de rendu : `README.md` §1 du handoff, fidélité haute.

Le cycle de coche devient tri-état (`Claudia → Yann → les deux → rien` si `partageable`) : il
passe par `creerCheckList` de `blocs-checklist.js` avec `basculer(id, options)` — le bloc
accepte déjà des options, le `figer → appliquer → écrire → rollback` ne se réécrit pas.

Un écran dépassera 400 lignes s'il porte les deux vues : **Semaine part dans
`frontend/taches/ui-taches-semaine.js`**.

### 3b. Semaine (`ui-taches-semaine.js`, nouveau)

Grille tâches × jours, bandeaux de cadence, carte KPI Obligatoire (`balance` avec
`obligatoireSeul: true`). Tap sur une cellule = même cycle que le jour ; tap sur la lettre du
jour = ouvre le jour.

### 3c. Réglages · Parts (`ui-taches-rec.js`, refonte)

Le tableau par cadence remplace le formulaire en feuille : chaque colonne est un bouton-cycle,
l'effet est immédiat et se propage partout. La carte d'explication (« On compte en parts de la
maison, pas en points de match ») est **de la pédagogie du système, à reprendre telle quelle**.
Le formulaire en feuille reste pour créer une tâche et pour les champs longs (titre, consigne).

Les écritures passent par `creerFileEcritures()` (D-026) : un tap répété sur un cycle ne doit
pas laisser la base sur un état antérieur au dernier geste.

**Portes** : `node tests/recette_visuelle.mjs` **puis ouvrir `data/captures/*.png`** (L-009 :
un log vert ne prouve rien) ; vérifier 360 px et 320 px sans débordement (les parents, P30 Pro),
pas de `height` fixe sur un conteneur de texte.

---

## Lot 4 — Le bot et le rappel du soir

`scripts/bot/taches.py` est le miroir Python ; il suit les mêmes règles, pas les mêmes lignes.

- `points_de()` → `parts_de(recurrent, qui)` et `credit_de(recurrent, tache)`, mêmes formules
  que le JS. **Les deux `max(1, ...)` de `taches.py:72-73` disparaissent** : 0,5 est une valeur
  légitime.
- `balance()` : mêmes paramètres qu'en JS (`recurrents`, `obligatoire_seul`).
- `scripts/bot/reponses.py` — trois messages à reformuler (`:89`, `:102`, `:109`) :
  « pt/pts » devient « part/parts », avec l'accord au pluriel qui tient compte des demis
  (« 0,5 part », « 1 part », « 1,5 part », « 2 parts » : pluriel au-delà de 1).
- `fait <titre> à deux` : la grammaire de `commandes.py` accepte le suffixe, `basculer()` écrit
  `qui` + `qui2` et la moitié chacun.
- `bilan` / `balance` affiche la ligne obligatoire (« Claudia en assure 58 % »).
- **`supabase/functions/rappel-taches/index.ts` : filtrer sur `obligatoire`, plus sur
  `importance == 3`.** Sans ça le rappel du soir se vide en silence.

### Test de confrontation (L-014)

`tests/bot/test_taches.py` porte déjà le mécanisme : il exécute le vrai module JS via
`node --input-type=module -e "import('file:///…/taches.js').then(…)"` et compare au résultat
Python. **Étendre cette confrontation à `partsDe` et `creditDe`**, sur les cas limites du
tableau §10 (plafond de l'échelle, écart à deux qui ne s'applique pas, 0,5 divisé en quarts) :
c'est précisément là que deux implémentations divergent, jamais sur le cas normal.

**Porte** : `python -m pytest -q tests/bot/`.

---

## Lot 5 — Courses : magasin, repas, classiques

### Migration `009_magasin_repas.sql`

Reséquencer `courses_rayons` selon le parcours réel (les dix groupes de `logique-metier.md` §6),
remapper `courses.rayon` selon la table de correspondance des anciens rayons, créer `repas`,
`repas_ingredients` et `courses_classiques` (schémas en §7).

### Écrans

- **Réglages · Magasin** (nouvel écran) : la liste des groupes, `↑` / `↓` échangent deux `ordre`,
  la liste de courses se réordonne aussitôt. Un groupe vide ne s'affiche pas.
- **Courses** : groupes en deux colonnes, zone « Repas de la semaine » (tap = verse les
  ingrédients manquants), panier (vider = sort de la liste et alimente les classiques,
  `fois + 1`), puces des classiques triées par fréquence.
- **Feuille « On fait le tour »** : égrène les classiques absents, puis les menus, puis un bilan.
  Le bot pose les mêmes questions le soir — **une question, une réponse courte, deux surfaces** :
  la logique de la tournée vit dans un module pur partagé, pas deux fois.

Attention L-015 : Courses gagne un écran de réglages, donc la navigation « Plus » doit continuer
à lister TOUS les écrans de l'app. Se teste en allant de n'importe où à n'importe où.

**Portes** : recette visuelle **regardée**, puis `node tests/recette_connectee.mjs` (schéma
touché : RLS des trois nouvelles tables à vérifier, anonyme = 0 ligne).

---

## Ordre et dépendances

```
Lot 1 (métier + migration 008)  ──┬─→ Lot 3 (écrans Tâches)  ──→ recette visuelle
                                  ├─→ Lot 4 (bot + rappel)   ──→ pytest
Lot 2 (bloc cycle) ───────────────┘
Lot 5 (Courses + migration 009) — indépendant des lots 1-4
```

Lot 1 et Lot 2 peuvent se faire en parallèle ; Lot 5 aussi. Lot 3 attend 1 et 2. Lot 4 attend 1.

## Portes de vérification (rappel)

| Commande | Quand |
|---|---|
| `node tests/test_taches.mjs` | Lots 1, 2 |
| `python -m pytest -q tests/bot/` | Lot 4 |
| `node tests/recette_visuelle.mjs` **puis ouvrir les captures** | Lots 3, 5 |
| `node tests/recette_connectee.mjs` | Lot 5 (schéma et RLS touchés) |
| `git diff --cached --name-only \| grep -Ei 'xlsx\|\.env$'` vide | avant chaque commit |

Aucune donnée personnelle dans le brief ni dans les migrations : les tâches et les repas de
départ sont génériques, les montants ne bougent pas.
