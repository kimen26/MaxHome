# Brief — Virement automatique : rien à cocher (D-055)

## Le besoin
Certains virements habituels sont des virements permanents programmés à la banque : ils partent
seuls chaque mois. Les afficher dans « À faire » avec une case à cocher est faux : personne n'a
rien à faire. Ils doivent rester visibles et comptés (la charge reste une dépense, calc.js
inchangé), mais sans case, directement dans « Fait », avec la mention « Automatique ».

## Données (migration `supabase/migrations/029_virement_automatique.sql`, non appliquée)
`alter table mouvements_recurrents add column if not exists automatique boolean not null default false;`

## Comportement
- Un élément de la liste (ligne de charge mode "charge" ou mouvement) dont le récurrent est
  `automatique` est considéré FAIT pour l'affichage et le regroupement : il va dans « Fait »,
  sans case cochable, avec un repère « Automatique » à la place de « ✓ prénom · date ».
  Aucune écriture en base au chargement : c'est un état dérivé, pas une coche simulée.
- Un groupe Destinataires entièrement automatique va dans « Fait » ; un groupe mixte reste
  « À faire » pour ses éléments non automatiques (le total à faire n'inclut pas l'automatique).
- Le bandeau / compteur « à valider » ne compte pas les éléments automatiques.
- Écran Récurrents (ui-recurrents.js) : une option « Virement automatique (rien à cocher) »
  dans la feuille du récurrent, via blocs-form.js.
- Bot Telegram : si scripts/bot liste les virements à faire, exclure les automatiques (lire
  d'abord ; si le bot ne liste pas ces virements, ne rien toucher et le dire).

## Où regarder
frontend/budget/groupes-virements.js, groupes-categories.js, ui-mois-liste.js, coche-ligne.js
(valeurCourante), etat-mois.js (compteurs), ui-recurrents.js, mod-budget.js. Réutiliser le
socle (frontend/socle/blocs*.js), pas de HTML équivalent nouveau.

## Interdits
- Aucune vraie donnée dans le code, les tests, ce brief (L-049) : valeurs inventées.
- Ne pas appliquer la migration, ne pas pousser.
- Ne pas toucher calc.js.

## Portes
Un test pur sur le classement fait/à faire avec un récurrent automatique (étendre un test
existant ou `tests/test_automatique.mjs`), `node tests/test_calc.mjs`, `node tests/test_reserve.mjs`,
`node tests/recette_ecrans.mjs` avec un récurrent automatique fictif dans
tests/donnees_factices.mjs, puis OUVRIR la capture du mois à 360 px.
Commit `feat:` par chemins listés (jamais add -A), sans push.
