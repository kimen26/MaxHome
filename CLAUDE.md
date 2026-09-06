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
| écran · page · saisie · affichage · UI | FRONT | frontend/blocs.js + ui-base.js, puis le ui-*.js du module |
| tâche · ménage · points · pénibilité · balance | TÂCHES | frontend/taches.js + scripts/bot/taches.py |
| courses · liste · rayon | COURSES | frontend/ui-courses.js |
| bot · Telegram · commande · rappel | BOT | scripts/bot/commandes.py + bot.py |
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
6. **Les écrans s'assemblent, ils ne se redessinent pas** : une ligne cochable, une
   carte-liste, un panneau de détail viennent de `frontend/blocs.js`. Un nouveau module
   réutilise ces blocs ou les enrichit — il n'écrit pas son propre HTML équivalent.
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
