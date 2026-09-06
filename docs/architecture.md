# Architecture MaxHome

MaxHome est une application privée à trois modules (Budget, Tâches, Courses) partagée par
Claudia et Yann. Le code est public (dépôt GitHub), les données ne le sont jamais.

## 1. Vue d'ensemble

```
GitHub (repo public, code seul)  --Actions/Pages-->  navigateur (Claudia, Yann)
                                                            |  supabase-js (clé anon)
                                                            v
                          Supabase (projet "maxhome") : Auth · Postgres · RLS · Edge Functions
                                                            ^
                                                            |  REST (clé service_role)
                                          scripts/bot/bot.py (long polling Telegram)
```

Le front est un site statique servi par GitHub Pages, publié depuis `frontend/` par le
workflow `.github/workflows/pages.yml` (`actions/deploy-pages`, déclenché à chaque push sur
`master`). Pas de build : HTML/CSS/JS vanille, modules ES chargés directement par le
navigateur (`<script type="module">`).

Toutes les données vivent dans un projet Supabase dédié (`maxhome`) : authentification par
email/mot de passe (deux comptes, inscription publique désactivée), base Postgres, et des
politiques RLS qui filtrent chaque table par `est_membre()` — une fonction SQL qui vérifie
que l'email du JWT courant figure dans la table `membres`. La clé publiée dans
`frontend/config.js` est la clé *anon* : elle est sans effet sans session valide, donc sans
risque à publier.

Un bot Telegram (`scripts/bot/bot.py`, `@BudgetCYM_bot`) tourne en long polling sur une
tâche planifiée Windows ; il sert les trois modules par commandes texte, avec une allowlist
d'identifiants Telegram (`telegram_membres`) et la clé *service_role* (jamais exposée côté
client).

Deux Edge Functions Deno, planifiées par pg_cron, envoient des rappels Telegram :
`rappel-virements` (mouvements du mois non faits, le 1er et le 5) et `rappel-taches`
(tâches importantes non faites, chaque soir). Elles lisent la base en service_role mais
n'écrivent jamais — la création d'occurrences reste un geste de l'app ou du bot.

## 2. Arborescence du frontend

```
frontend/
  index.html, style.css, config.js, app.js, modules.js
  socle/       comportements et affichages partagés entre modules
  budget/      module Budget
  taches/      module Tâches
  courses/     module Courses
```

### Racine

| Fichier | Rôle |
|---|---|
| `index.html` | squelette de toutes les sections d'écran (`<section id="ecran-...">`), la feuille mobile, le formulaire de login |
| `style.css` | feuille de style unique |
| `config.js` | URL et clé anon du projet Supabase (publiable) |
| `modules.js` | registre des modules, dans l'ordre d'affichage : `export const LISTE = [budget, taches, courses]` |
| `app.js` | orchestrateur : authentification, état partagé, sélecteur de mois, accueil, boucle de chargement sur les modules du registre. Ne cite aucun module par son nom. |

### `frontend/socle/` — ce qui est commun à tous les modules

| Fichier | Nature | Rôle |
|---|---|---|
| `ui-base.js` | socle transverse | helpers DOM (`$`, `txt`), navigation par onglets/feuille mobile, toast, bandeau d'erreur, confirmation, presse-papier ; ne connaît aucun module par son nom (`enregistrerModules` reçoit le registre au démarrage) |
| `api.js` | accès données | toutes les requêtes Supabase, aucune logique d'affichage |
| `blocs.js` | **AFFICHAGE** | fabriques de HTML réutilisables : ligne cochable (`ligneCoche`), carte-liste, chiffres d'en-tête, ligne de réglage, panneau de détail, choix d'une personne |
| `blocs-checklist.js` | **COMPORTEMENT** | cycle complet d'une check-list avec panneau de détail : figer la valeur avant mutation, fermer la feuille mobile, rendre, rouvrir le panneau sur PC, écrire en base, toast, rollback si l'écriture échoue |
| `blocs-reglages.js` | **COMPORTEMENT** | cycle d'un écran CRUD (liste + Modifier/Retirer + formulaire en feuille) : ouvrir, soumettre, écrire, fermer, rendre, toast, confirmation de retrait |
| `blocs-form.js` | formulaire | briques de champs qui échappent leurs valeurs (`champ`, `montant`, `select`, `zone`, `caseACocher`), lecture d'un formulaire en objet (`lire`) |
| `occurrences.js` | synchronisation | une seule boucle générique (`synchroniserOccurrences`) qui crée les occurrences manquantes d'un modèle récurrent puis purge les périmées, pilotée par une « stratégie » que chaque module lui fournit |

La distinction affichage / comportement est structurante : `blocs.js` ne fait que renvoyer
du HTML (aucun accès réseau, aucun état), tandis que `blocs-checklist.js` et
`blocs-reglages.js` portent la mécanique d'écriture (optimiste, avec rollback) qu'un module
ne doit pas réécrire à la main.

### `frontend/budget/` — module Budget

| Fichier | Rôle |
|---|---|
| `mod-budget.js` | descripteur du module (voir section 3) |
| `calc.js` | **moteur de calcul pur**, sans DOM ni réseau — la seule source de vérité du calcul de répartition, réutilisée telle quelle par le bot via `calc_cli.mjs` |
| `ui-mouvements.js` | écran « Ce mois » : revenus, charges, mouvements à faire, utilise `blocs-checklist.js` |
| `ui-charges.js` | panneau de gestion des charges (CRUD), utilise `blocs-reglages.js` |
| `ui-recurrents.js` | panneau des mouvements récurrents (le modèle), utilise `blocs-reglages.js` |
| `ui-comptes.js` | panneau CRUD des comptes bancaires |
| `ui-stats.js` | écran Stats et vue annuelle |

### `frontend/taches/` — module Tâches

| Fichier | Rôle |
|---|---|
| `mod-taches.js` | descripteur du module |
| `taches.js` | règles pures : échéance par fréquence, purge des périmées, points, balance (miroir JS de `scripts/bot/taches.py`) |
| `ui-taches.js` | écran « Aujourd'hui », utilise `blocs-checklist.js` |
| `ui-taches-rec.js` | écran Balance et écran Réglages (tâches récurrentes), utilise `blocs-reglages.js` |

### `frontend/courses/` — module Courses

| Fichier | Rôle |
|---|---|
| `mod-courses.js` | descripteur du module |
| `ui-courses.js` | écran Liste, cases à cocher par rayon |

## 3. Le contrat d'un module (descripteur `mod-*.js`)

`app.js` ne connaît aucun module par son nom : il boucle sur `modules.js::LISTE`, un tableau
de descripteurs qui partagent tous la même forme. Un module s'exporte comme suit :

| Champ | Type | Rôle |
|---|---|---|
| `cle` | string | identifiant interne du module (`"budget"`, `"taches"`, `"courses"`) |
| `nom` | string | libellé affiché (carte d'accueil, en-tête d'onglets) |
| `defaut` | string | écran ouvert quand on entre dans le module depuis l'accueil |
| `avecMois` | boolean | le module utilise le sélecteur de mois partagé (Budget seul, pour l'instant) |
| `onglets` | `[cle_ecran, libellé][]` | onglets visibles en permanence (barre PC, barre mobile) |
| `plus` | `[cle_ecran, libellé][]` | écrans accessibles via le menu « Plus » (mobile) ou le sous-menu (PC) |
| `etatInitial` | objet | portion de l'état global que ce module possède ; fusionnée dans `etat` au démarrage |
| `referentiels(api)` | fonction | `{ cle: Promise }` — données de référence à charger une fois, avant `creer()` |
| `creer(api, etat, cb)` | fonction | fabrique l'instance du module ; `cb` porte `{ echec, rafraichir }` |

`creer()` renvoie un objet avec quatre membres :

| Membre | Rôle |
|---|---|
| `ecrans` | `{ cle_ecran: fonction_de_rendu }` — appelée par `app.js` quand cet écran est affiché |
| `avantChargement()` | optionnel, appelé juste avant un rechargement (ex. fermer un panneau de détail ouvert) |
| `charger()` | async, peuple `etat` depuis l'API ; c'est ici que `synchroniserOccurrences` est typiquement appelée |
| `resume()` | renvoie le texte affiché sur la carte du module à l'accueil |

### Ajouter un quatrième module

1. Créer `frontend/<module>/` avec un `mod-<module>.js` respectant le contrat ci-dessus, et
   ses écrans (`ui-*.js`), assemblés à partir des blocs de `frontend/socle/` plutôt que d'un
   HTML équivalent réécrit à la main.
2. Ajouter dans `frontend/index.html` une `<section id="ecran-...">` par écran déclaré dans
   `onglets` et `plus`.
3. Ajouter une ligne dans `frontend/modules.js` (import + entrée dans `LISTE`).
4. Créer les tables Postgres du module et leurs politiques RLS (`for all using (est_membre())
   with check (est_membre())`, comme toutes les tables existantes) dans un nouveau fichier
   `supabase/migrations/0NN_<module>.sql`, additif et idempotent.
5. Si le module doit être servi par le bot : un fichier `scripts/bot/<module>.py` miroir des
   règles JS, un groupe de fonctions dans `actions.py`, et les commandes correspondantes dans
   `commandes.py`.

## 4. Le patron modèle / occurrence

Deux modules distinguent un **modèle récurrent** (défini une fois, par exemple « ménage de la
salle de bain, hebdomadaire ») et ses **occurrences** (une ligne par période, avec sa propre
coche) :

| Modèle | Occurrence | Module |
|---|---|---|
| `mouvements_recurrents` | `mouvements` | Budget |
| `taches_recurrentes` | `taches` | Tâches |

Le module Courses n'a volontairement pas ce patron (voir D-020) : un article est ajouté,
coché, puis vidé — le cycle est trop court pour qu'un modèle apporte quelque chose.

`frontend/socle/occurrences.js` porte la boucle commune : créer les occurrences manquantes
puis purger les périmées (dans cet ordre, pour ne jamais perdre une ligne). Chaque module lui
fournit une « stratégie » — quatre fonctions pures qui savent lire son état et parler à son
API — sans que la boucle elle-même connaisse le module.

**Règle de la valeur figée à la coche** : tant qu'une occurrence n'est pas cochée, sa valeur
(montant d'un mouvement, points d'une tâche) est recalculée à l'affichage depuis le modèle et
les données du moment. Dès qu'elle est cochée (`fait_le` renseigné), cette valeur est écrite
en base et n'est plus jamais recalculée — un changement ultérieur de la charge ou de la
pénibilité du modèle ne doit pas réécrire un virement déjà parti ou une pénibilité déjà comptée
dans la balance. Cette règle est appliquée identiquement des deux côtés : `frontend/budget/
ui-mouvements.js` / `scripts/bot/mouvements.py`, et `frontend/taches/taches.js` /
`scripts/bot/taches.py`.

## 5. Modèle de données

| Table | Colonnes clés | Rôle |
|---|---|---|
| `membres` | `prenom` (PK), `email`, `ordre` | les deux comptes autorisés ; base de `est_membre()` |
| `telegram_membres` | `telegram_id` (PK), `prenom` | allowlist du bot Telegram |
| `charges` | `id`, `libelle`, `categorie`, `type`, `regle`, `cle_pct`, `payeur`, `ponctuel`, `montant_defaut`, `defaut_dernier`, `actif`, `ordre` | catalogue des charges régulières et ponctuelles, avec leur règle de répartition par défaut |
| `revenus` | `annee`, `mois`, `prenom`, `montant_centimes` | salaire déclaré par personne et par mois |
| `lignes` | `annee`, `mois`, `charge_id`, `montant_centimes`, `regle` (nullable) | montant d'une charge pour un mois donné ; `regle` surcharge celle de la charge si renseignée |
| `ajustements` | `id`, `annee`, `mois`, `de`, `vers`, `montant_centimes`, `motif` | rééquilibrage ponctuel entre les deux comptes (« X prend N ») |
| `comptes` | `id`, `nom`, `titulaire`, `iban_masque`, `note`, `commun` | comptes bancaires affichés (jamais l'IBAN complet) |
| `mouvements_recurrents` | `id`, `titre`, `compte_de`, `compte_vers`, `mode` (`fixe`\|`charge`\|`part`), `montant_centimes`, `charge_id`, `prenom_part`, `qui`, `jour`, `actif`, `ordre` | modèle d'un mouvement mensuel ; le mode détermine comment son montant théorique se calcule |
| `mouvements` | `id`, `annee`, `mois`, `recurrent_id`, `titre`, `compte_de`, `compte_vers`, `montant_centimes`, `qui`, `fait_le` | occurrence mensuelle d'un mouvement, montant figé à la coche |
| `taches_recurrentes` | `id`, `titre`, `categorie`, `frequence`, `fois`, `penibilite`, `importance`, `attribue_a`, `actif`, `ordre` | modèle d'une tâche ; `penibilite` donne les points, `importance` ne fait que trier la liste |
| `taches` | `id`, `recurrent_id`, `titre`, `categorie`, `echeance`, `rang`, `qui`, `fait_le`, `points` | occurrence datée d'une tâche, points figés à la coche |
| `courses` | `id`, `libelle`, `quantite`, `rayon`, `ajoute_par`, `ajoute_le`, `coche_le`, `coche_par` | articles de la liste commune |
| `courses_rayons` | `nom` (PK), `ordre` | rayons dans l'ordre de parcours du magasin, pas alphabétique |
| `virements` | `annee`, `mois`, `prenom`, `montant_centimes`, `fait_le` | ancienne table, conservée par la migration 005 le temps de la bascule vers `mouvements` ; à retirer quand plus rien ne la lit |

Toutes les tables ont `alter table ... enable row level security` et une politique
`for all using (est_membre()) with check (est_membre())` (ou `for select` pour `membres`
seule) : la fonction `est_membre()` (schéma principal) vérifie que l'email du JWT figure dans
`membres`. Les montants sont systématiquement des entiers en centimes.

## 6. Le bot Telegram

| Fichier | Rôle |
|---|---|
| `bot.py` | boucle de long polling, journalisation, aiguillage haut niveau (annulation, confirmation de langage libre, proposition de copie d'un mois vide), bascule `fait <titre>` entre tâche et mouvement |
| `commandes.py` | grammaire déterministe : reconnaît un message et retourne une action structurée, sans aucun accès réseau ; fuzzy matching (`meilleur_flou`) pour les libellés de charges et les titres |
| `actions.py` | dispatch métier, un groupe de fonctions par module (`budget`, `taches`, `courses`) ; chaque fonction retourne le texte à envoyer ou `None` si l'action ne la concerne pas |
| `mouvements.py` | métier miroir de `frontend/budget/ui-mouvements.js` : montant théorique selon le mode du récurrent, ciblage d'un mouvement, coche avec figeage du montant |
| `taches.py` | métier miroir de `frontend/taches/taches.js` : échéance par fréquence, purge des périmées, points figés à la coche (plancher à 1), balance |
| `courses.py` | miroir simple de `frontend/courses/` : ajout d'un article, liste des restants |
| `libre.py` | repli en langage naturel quand la grammaire ne matche rien : appelle `claude -p --model haiku` en local (abonnement, pas de clé API), avec un timeout et une confirmation obligatoire avant toute écriture |
| `donnees.py` | accès Supabase REST en clé *service_role* (contourne la RLS ; l'allowlist Telegram est le seul garde-fou côté bot) |
| `telegram.py` | client Telegram minimal (`getUpdates`, `sendMessage`), stdlib seule |
| `reponses.py` | formatage des réponses (aucune logique métier) |
| `calc_cli.mjs` | pont Node : lit un JSON sur stdin, appelle `frontend/budget/calc.js` (le même moteur que le front), écrit le résultat en JSON — le bot ne réimplémente jamais les règles de calcul |

## 7. Sécurité

| Mesure | Détail |
|---|---|
| RLS | chaque table est filtrée par `est_membre()` ; aucune n'est accessible sans un JWT valide dont l'email figure dans `membres` |
| Clé anon publique | sans effet sans session ; c'est la clé destinée à être publiée dans `frontend/config.js` |
| Allowlist Telegram | `telegram_membres` : un identifiant Telegram inconnu ne déclenche jamais d'écriture, vérifié avant tout accès Supabase dans `bot.py` |
| service_role | utilisée uniquement côté serveur (bot, scripts d'import/migration) ; jamais dans le code servi au navigateur |
| Secrets | vivent dans `.env` local (jamais commité) ou dans les secrets Supabase Edge Functions ; jamais affichés en clair par les scripts (`provision.py`, `sql.py`, `check_secrets.py`) |
| Portée du bot | ne modifie jamais `membres`, `comptes`, ni la structure des charges régulières — réservé à l'app web |

## 8. Portes de vérification

| Commande | Vérifie |
|---|---|
| `node tests/test_calc.mjs` | moteur de répartition budgétaire (`frontend/budget/calc.js`) |
| `node tests/test_taches.mjs` | échéances, points, balance du module Tâches |
| `python -m pytest -q tests/bot/` | grammaire (`commandes.py`), formatage (`reponses.py`), dispatch (`actions.py`, `test_dispatch_modules.py`), comportement global (`test_bot.py`) |
| `tests/bot/test_taches.py` | **confrontation** : exécute la règle de points côté JS et côté Python sur les mêmes cas et compare, pour qu'une règle dupliquée ne diverge jamais silencieusement (L-014) |
| `node tests/recette_visuelle.mjs` puis ouverture de `data/captures/*.png` | rendu visuel après tout changement d'UI — une capture se regarde, un log vert ne prouve rien |
| `node tests/recette_connectee.mjs` | login réel et RLS, après tout changement de schéma ou de `app.js` |
| `node tests/comparer_captures.mjs` | diff visuel entre deux jeux de captures |

Un chevauchement repéré sur une capture pleine page se confirme par une mesure de géométrie
avant de toucher au CSS.
