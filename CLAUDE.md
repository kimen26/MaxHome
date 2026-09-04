# MaxBudget — suivi des budgets familiaux de Claudia et Yann

Petite web-app privée : chaque mois, saisir les deux salaires et les charges du foyer
(logement, vacances, taxes, enfant…), calculer ce que chacun verse sur le compte commun
et ce qui reste à répartir. Remplace un classeur Excel de 4 feuilles.
État : socle posé, données Excel à importer, stack à trancher (voir memory/DECISIONS.md).

## ACTION OBLIGATOIRE — avant toute réponse

| Mots dans la demande | Pôle | Charger |
|---|---|---|
| charge · règle de répartition · prorata · 50/50 · calcul | MÉTIER | docs/regles-repartition.md |
| écran · page · saisie · affichage · UI | FRONT | frontend/ (à créer) |
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

## Workflow

Plan → TodoWrite → Exécution → Vérification → Commit → memory/ gravé

## Portes de vérification

| Commande | Quand |
|---|---|
| `git diff --cached --name-only \| grep -Ei 'xlsx|\.env$'` doit être vide | avant chaque commit |
| tests de calcul de répartition (à créer avec le moteur) | tout changement métier |
| recette visuelle Playwright mobile + desktop (dès le premier écran) | tout changement UI |

## Fichiers transversaux

| Fichier | Rôle |
|---|---|
| memory/MEMORY.md | état courant |
| memory/TODO.md | file d'attente (lanes) |
| memory/DECISIONS.md | arbitrages datés D-NNN |
| memory/LESSONS.md | leçons gravées L-NNN |
| memory/CHANGELOG.md | releases |
