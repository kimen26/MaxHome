# Brief — Max Home : de l'app budget à la suite du foyer

_Brief jetable (convention memory/). Idée brute d'origine : inbox/idee-maxhome-2026-09-06.md._

## Intention

MaxBudget devient **Max Home**, une suite d'outils du foyer. Même principe partout : rendre
visible et objectif ce que chacun apporte, pour que la discussion « c'est toujours moi » n'ait
plus lieu d'être. Trois modules : Budget (existant), Tâches, Courses. Un hub les relie.

## Architecture retenue (à confirmer, voir questions)

- **Un seul dépôt, un seul site, un seul projet Supabase, une seule Auth.** Les modules sont des
  écrans de la même app, pas des apps séparées : `membres`, la RLS `est_membre()` et le bot
  Telegram sont partagés tels quels. Rien à réinventer.
- **Navigation à deux niveaux.** Le hub (écran d'accueil) liste les modules. À l'intérieur d'un
  module, la barre d'onglets actuelle (mobile) / barre haute (PC) reste. Les onglets sont
  désormais définis par module.
- **Même patron modèle / occurrence pour les tâches** que pour les mouvements (D-015) :
  `taches_recurrentes` (définies une fois) génèrent des `taches` (une par échéance), cochées
  avec `fait_le` et `qui`. Le code de génération d'occurrences de ui-mouvements.js se
  factorise.
- **Mono-foyer maintenu.** Pas de `foyer_id` tant que l'app sert un seul couple ; passer
  multi-foyer plus tard est une migration additive (colonne + réécriture des policies), pas
  une refonte. Décision à graver (D-018).

## Lot 0 — Renommage (petit, d'abord)

Deux niveaux, parce que « partout » n'a pas le même coût selon l'endroit.

| Niveau | Quoi | Coût / risque |
|---|---|---|
| Produit (à faire) | Titre et logo de l'app, README, CLAUDE.md, texte des rappels Telegram, libellé MaxOps, nom du dépôt GitHub → URL `kimen26.github.io/MaxHome/` | Une heure. **L'ancienne URL Pages ne redirige pas** : mettre à jour favoris et MaxOps. |
| Technique (à ne pas faire) | Dossier local, projet Supabase `maxbudget`, secrets `MAXBUDGET_*`, handle `@BudgetCYM_bot` | Casse la session Claude Code, MaxOps, la tâche planifiée, `.env` ; aucun gain visible. Le bot garde son handle (seul BotFather peut le changer). |

Les archives (`DECISIONS`, `LESSONS`, `MEMORY`, `docs/archives/`) gardent le nom d'époque,
par convention.

## Lot 1 — Hub + module Tâches (le plus demandé)

### Modèle
- `taches_recurrentes` : titre, catégorie (enfant, cuisine, linge, ménage, déchets, courses…),
  `frequence` (`quotidien` / `hebdo` / `mensuel` / `au_besoin`), `fois_par_periode` (le biberon :
  2 par jour), `penibilite` 1–5 (la contrainte : table = 1, poubelle = 3, linge = 4),
  `importance` 1–3 (peut-elle attendre ?), `attribue_a` optionnel, `actif`.
- `taches` : occurrence datée (`echeance`), `recurrent_id`, `qui`, `fait_le`, `points` figés
  à la coche (même règle que le montant d'un mouvement : L-008).
- Points d'une tâche faite = `penibilite`. L'importance ne rapporte pas de points, elle
  ordonne la liste « à faire » et déclenche le rappel ; sinon on récompense l'urgence, pas
  l'effort.

### Écrans
- **Aujourd'hui** : check-list des tâches dues (même composant que « Ce mois »), tri par
  importance puis échéance, coche en un geste avec « moi » par défaut, possibilité de cocher
  pour l'autre.
- **Balance** : points par personne sur 7 et 30 jours glissants, écart, répartition par
  catégorie (même barres que Stats). Le chiffre à regarder : « Claudia 62 % / Yann 38 % ».
- **Tâches récurrentes** : réglages (même écran que Mouvements récurrents).
- **Bot Telegram** : `fait biberon`, `tâches` (restantes du jour), `balance`.

## Lot 2 — Courses

- `courses` : libellé, quantité, rayon, `ajoute_par`, `coche_le`. Une seule liste commune,
  temps réel via Supabase Realtime (deux téléphones au magasin).
- Bot : `ajoute lait`, `courses`. Alexa reste possible en parallèle ; on ne cherche pas à la
  remplacer avant que la liste intégrée ait prouvé son utilité.

## Ordre proposé

Lot 0 (rename) → Lot 1 (hub + tâches) → Lot 2 (courses). Chaque lot a sa migration additive,
ses tests calc (barème de points) et sa recette connectée.

## Questions ouvertes

Voir la réponse du 2026-09-06 dans la conversation ; réponses à reporter ici.
