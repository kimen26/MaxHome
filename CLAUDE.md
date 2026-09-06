# MaxHome — les outils du foyer de Claudia et Yann

Web-app privée qui rend visible et objectif ce que chacun apporte au foyer, pour que la
discussion « c'est toujours moi » n'ait plus lieu d'être. Trois modules, un hub :

| Module | Ce qu'il fait | Écrans |
|---|---|---|
| **Budget** | salaires et charges du mois, qui verse quoi au commun, ce qui reste | Ce mois · Charges · Stats · Récurrents · Comptes · Vue annuelle |
| **Tâches** | qui fait quoi à la maison, en points de pénibilité | Aujourd'hui · Balance · Réglages |
| **Courses** | une liste commune, cochable dans le magasin | Liste |

En prod sur https://kimen26.github.io/MaxHome/ (Supabase `maxhome`), plus un bot Telegram
`@BudgetCYM_bot` qui sert les trois modules. Le budget remplace un classeur Excel de 4 feuilles.

## ACTION OBLIGATOIRE — avant toute réponse

| Mots dans la demande | Pôle | Charger |
|---|---|---|
| charge · règle de répartition · prorata · 50/50 · calcul | MÉTIER | docs/regles-repartition.md |
| écran · page · saisie · affichage · UI | FRONT | frontend/socle/blocs*.js + ui-base.js, puis le ui-*.js du module |
| tâche · ménage · points · pénibilité · balance | TÂCHES | frontend/taches/taches.js + scripts/bot/taches.py |
| courses · liste · rayon | COURSES | frontend/courses/ui-courses.js + scripts/bot/courses.py |
| bot · Telegram · commande · rappel | BOT | scripts/bot/commandes.py + bot.py |
| module · descripteur · nouveau module · arborescence · socle | ARCHI | docs/architecture.md + frontend/modules.js |
| base · auth · Supabase · RLS · partage · sécurité | DATA | docs/architecture.md |
| import · Excel · feuille | IMPORT | inbox/ (fichiers jamais commités) |
| dump · idée brute | INBOX | déposer dans inbox/, demander en texte |

Annoncer avant d'agir : « Mode [X] — je charge [Y] puis j'agis. »

## Invariants (non négociables)

1. **Aucune donnée personnelle dans git** : salaires, montants, noms de charges réels
   vivent en base (ou dans inbox/, ignoré). Le repo public ne contient que du code.
2. Accès restreint aux deux comptes (Claudia, Yann) — vérifié côté serveur (RLS),
   jamais seulement côté client.
3. Les règles de répartition (50/50, prorata salaire) sont des données paramétrables
   par charge, pas du code en dur.
4. Montants en centimes entiers côté base ; jamais de float pour de l'argent.
5. Questions en TEXTE dans la réponse, jamais de formulaire.
6. **Les écrans s'assemblent, ils ne se redessinent pas** : l'affichage vient de
   `frontend/socle/blocs.js`, le comportement de `blocs-checklist.js` / `blocs-reglages.js`,
   les formulaires de `blocs-form.js`. Un écran n'écrit ni HTML équivalent ni cycle
   optimiste/rollback équivalent (D-024).
8. **Un module = un dossier + un descripteur `mod-*.js`** listé dans `frontend/modules.js`.
   `app.js` ne cite aucun module par son nom (D-025).
7. **Une règle métier qui vit en JS et en Python se teste par confrontation**, pas deux
   fois séparément : `tests/bot/test_taches.py` exécute les deux et compare (L-014).

## Workflow

Plan → TodoWrite → Exécution → Vérification → Commit → memory/ gravé

## Portes de vérification

| Commande | Quand |
|---|---|
| `git diff --cached --name-only \| grep -Ei 'xlsx|\.env$'` doit être vide | avant chaque commit |
| `node tests/test_calc.mjs` | tout changement du calcul budgétaire |
| `node tests/test_taches.mjs` | tout changement des tâches (échéances, points, balance) |
| `python -m pytest -q tests/bot/` | tout changement du bot |
| `node tests/recette_visuelle.mjs` puis OUVRIR data/captures/*.png | tout changement UI |
| `node tests/comparer_captures.mjs --attendu <écrans>` (référence : data/captures/avant/) | tout refactor censé ne rien changer |
| `node tests/recette_connectee.mjs` (login réel + RLS) | tout changement schéma/RLS/app.js |

Une capture se REGARDE, un log vert ne prouve rien (L-009). Un chevauchement vu sur une
capture pleine page se confirme par une mesure de géométrie avant d'ouvrir le CSS (L-016).

## Fichiers transversaux

| Fichier | Rôle |
|---|---|
| memory/MEMORY.md | état courant |
| memory/TODO.md | file d'attente (lanes) |
| memory/DECISIONS.md | arbitrages datés D-NNN |
| memory/LESSONS.md | leçons gravées L-NNN |
| memory/CHANGELOG.md | releases |
