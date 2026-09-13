# Brief — Refonte fidélité à la maquette (2026-09-13)

Source : `inbox/Audit Refonte/design_handoff_maxhome_taches/` (README.md = spec, AUDIT-ecarts.md =
écarts constatés, `MaxHome - Tâches.dc.html` = maquette). Images de référence, un PNG par état de la
maquette : `inbox/Audit Refonte/ref/maquette/*.png` (produites par `tests/outils/capture_maquette.mjs`).
Captures de l'état AVANT : `inbox/Audit Refonte/ref/audit/*.png`.

Ce brief tranche les cinq conflits du Lot 0 de l'audit. Il prime sur les habitudes du dépôt.

## Décisions (D-036, gravée dans memory/DECISIONS.md)

1. **Fidélité > invariant 6.** Pour les écrans couverts par la maquette, l'affichage suit la maquette
   au pixel près (couleurs, tailles, espacements, libellés). Les blocs partagés (`blocs*.js`) restent
   la SEULE source du HTML et du comportement : ils gagnent des variantes compactes, ils ne sont pas
   contournés. On ne garde pas un gabarit « parce qu'il existe ».
2. **Cibles tactiles.** La taille VISUELLE est celle de la maquette (bande 36, Todo 30, lignes 27-29,
   cellules 25×22, cycles 30, flèches 28…). La zone tapable est portée à 44 px minimum par un
   `::before` invisible (`position:absolute; inset:50% auto auto 50%; transform:translate(-50%,-50%);
   width:max(100%,44px); height:max(100%,44px)`) sur tout élément interactif plus petit que 44 px.
   Aucune hauteur de ligne ne grandit pour ça. Une classe utilitaire unique `.cible44` porte ce
   `::before` (l'élément doit être `position:relative`).
3. **Shell.** Barre basse GLOBALE à 4 entrées, dans cet ordre : **Tâches · Budget · Courses · Réglages**.
   Chaque module garde ses écrans dans un segmenté d'en-tête (Tâches : Jour | Semaine ; Budget :
   Mois | Stats | Année ; Courses : aucun). **Réglages** est un module synthétique assemblé par le socle
   à partir du champ `reglages` de chaque descripteur, dans l'ordre des modules :
   **Parts | Charges | Comptes | Magasin**. Son en-tête est le segmenté seul, pleine largeur (pas de
   titre : la barre basse dit déjà « Réglages »). Le menu « Plus » disparaît. Déconnexion et Accueil
   vivent en pied des écrans Réglages (mobile) et dans la barre haute (PC).
4. **Budget compact.** L'écran Budget suit la maquette : UN écran « Mois » (bande de mois plate dans
   l'en-tête, carte Salaires Y/C + clé, trois chiffres, À faire / Fait, charges par catégorie en deux
   colonnes avec champ montant et pastille ambre, carte « Ce mois seulement », FAB « + Ajouter » qui
   ouvre la feuille « Ligne de ce mois »). L'ancien écran « Charges » fusionne dedans. La valeur de
   référence par charge (montant_defaut, règle, « ≠ » pour aligner) devient **Réglages · Charges**.
   Récurrents et Comptes deviennent **Réglages · Comptes** (deux cartes sur un écran). Stats et Vue
   annuelle restent des écrans du module Budget (segmenté).
5. **Blocs hérités retirés.** Le bloc « Par catégorie » sous la grille Semaine et la liste
   « Catégorie / consigne / attribution » sous le tableau Parts disparaissent. Modifier / Retirer /
   consigne / catégorie d'une tâche récurrente : tap sur le TITRE d'une ligne du tableau Parts ouvre
   la feuille existante (formulaire de `creerReglages`), qui porte le bouton Retirer.

## Tokens (style.css `:root`) — valeurs de la maquette, à fusionner

| token | valeur |
|---|---|
| `--fond` | `#f5f7fa` |
| `--fond-bandeau` | `#eef1f4` |
| `--vert-clair` | `#f2f8f4` (+ `--vert-bordure:#cfe3d6`) |
| `--ambre-ligne` (ligne à faire) | `#fffdf5` |
| `--ambre-fond` | `#f6efdf` |
| `--separateur` | `#f2f4f7` ; `--separateur-2` `#e6eaef` |
| body font-size | 13 px ; titres d'écran 15 px 600 ; méta 11-12 ; étiquettes 9-10 majuscules |

Polices : IBM Plex Sans + JetBrains Mono pour TOUS les nombres. Pas d'ombre sauf le FAB.
Rayons : 5 cases/cellules, 6-7 boutons de réglage, 8 champs/segments, 10-11 cartes, 13 FAB, 18 feuilles.

## Gabarits communs (socle, style.css)

- **En-tête d'écran** `.tete-ecran` : fond #fff, bordure basse 1 px `--bordure`, padding 8×12,
  `display:flex; flex-direction:column; gap:7px`, **sticky en haut** (`position:sticky; top:0; z-index:10`).
  Première ligne `.tete-ligne` : flex, align center, gap 7. Titre de module `.tete-titre` 15 px 600 bleu.
- **Segmenté** `.segment` : conteneur `--fond-bandeau` radius 8 padding 2 ; bouton 26 px, padding 0 12,
  radius 6, 13 px 600, `--texte-2` ; actif fond #fff texte bleu. Variante `.segment.large` : flex:1,
  boutons flex:1. (Remplace l'ancien segmenté bordé bleu plein PARTOUT, y compris Stats 6/12 mois.)
- **Barre basse** `#onglets` : 4 colonnes en grille, fond #fff, bordure haute, padding `4px 0 9px`
  (+ safe-area), libellé 11 px, actif bleu 600 avec trait 22×3 au-dessus.
- **FAB** `.fab-ajouter` : 44 px de haut, radius 13, fond bleu, ombre `0 4px 14px rgba(31,78,121,.35)`,
  `bottom: calc(barre + 8px) ; right 12px`.
- **Contenu** `main` : padding `8px 12px 92px` (le 92 laisse la place au FAB et à la barre).
- **Carte** `.carte` : fond #fff, bordure 1 px, radius 11, overflow hidden. Tête de carte `.carte-tete` :
  padding 3px 9px, titre 10 px 700 bleu majuscules letter-spacing .05em, compteur mono 10 px à droite
  (ambre ; vert + fond `--vert-clair` quand complet). Grille deux colonnes `.deux-cartes` : `1fr 1fr`,
  gap 7, align-items start.
- **Ligne compacte** `.ligne` : min-height 27-28 px, padding 0 8, séparateur `--separateur`, fond
  `--ambre-ligne` si à faire / #fff si fait. Case 17 px radius 5 ; point 4 px ; titre 13 px ;
  valeur mono 10 px à droite.
- **Feuille** : radius 18, pas de poignée, padding `15px 13px 18px`, gap 10-12, titre 17 px. États
  sélectionnés des choix (Quand, Fait par, Parts, Prorata|50/50) : bleu plein `#1f4e79` texte blanc.
- **Carte d'explication** `.carte-explication` : titre 14 px 600, paragraphes 12-13 px `--texte-2`,
  mots-clés en 600 (bleu / rouge / olive selon le sens). Texte, jamais des boutons.
- **Légende de pied** `.legende` : 12 px `--texte-2`, `padding-right:130px` quand un FAB est présent.

## CSS par module

`style.css` ne garde que le socle (tokens, shell, gabarits ci-dessus, feuille, toast, login, tableaux).
Chaque module a SA feuille : `frontend/budget/budget.css`, `frontend/taches/taches.css`,
`frontend/courses/courses.css`, liées dans `index.html` et précachées par `sw-precache.js`.
Une règle ne vit qu'à un endroit ; un écran ne surcharge pas un gabarit du socle par un `#id`.

## Ce que le modèle ne portait pas (C5)

- `depuis` (dernier passage d'une mensuelle) : se calcule depuis l'historique chargé
  (`JOURS_HISTORIQUE` passe à 100 jours) ; aucune occurrence faite → « +3 mois » (jamais « jamais »
  quand on ne sait pas).
- Date d'ajout d'un travail Todo : colonne `taches.cree_le timestamptz default now()` (migration 014,
  additive, idempotente). Méta : « ajouté il y a N j » / « ajouté hier » / « ajouté aujourd'hui ».
- `habit.` (jour habituel d'une hebdo) : pas en base, pas dans ce brief. La valeur de droite d'une
  hebdo est `n/N` ambre, ou le jour de la coche (« jeu. ») en vert quand complet.

## Portes

`node tests/test_taches.mjs` · `node tests/test_calc.mjs` · `node tests/test_courses.mjs` ·
`python -m pytest -q tests/bot/` · `node tests/recette_ecrans.mjs` puis **regarder** chaque capture
à côté de son image de référence (`node tests/planche_maquette.mjs` produit la planche
`data/captures/planche/*.png`) · `node tests/recette_connectee.mjs` avant de pousser.
