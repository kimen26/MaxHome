# MEMORY — MaxBudget
_État courant. Réécrit en fin de session, jamais un journal._

## Où on en est
- 2026-09-05 : **Lot A livré** : écran mensuel refondu en prod (bloc « à faire », charges
  par catégorie, ponctuels, ajustements, panneaux Charges/Comptes). URL inchangée :
  https://kimen26.github.io/MaxBudget/. Supabase projet `maxbudget` (ref gdyekswdxhaqqyjuxiep,
  Paris), migration additive 002_lot_a.sql appliquée (272 lignes / 38 revenus inchangés,
  16 charges catégorisées). Frontend éclaté en modules < 400 lignes : api.js, calc.js,
  ui-mois.js, ui-charges.js, ui-comptes.js, app.js (orchestrateur).
- Rappel Telegram (Edge Function `rappel-virements` + migration 003_cron_rappel.sql) :
  code versionné, PAS déployé — secrets MAXBUDGET_TELEGRAM_BOT_TOKEN et
  MAXBUDGET_TELEGRAM_CHAT_ID absents de .env. À activer : configurer les secrets, déployer
  la fonction, appliquer 003.
- Aucun compte bancaire encore saisi dans le panneau Comptes : le bloc « à faire » affiche
  "aucun compte commun défini" tant que Yann/Claudia n'en créent pas un via le panneau.
- Recette connectée passée (RLS anonyme = 0 ligne ; février 2026 = chiffres Excel ±1 ct ;
  bloc à faire, sections catégories, cocher/décocher un virement testés).
- Mots de passe des comptes : .env (PASS_YANN, PASS_CLAUDIA) — à communiquer à Claudia
  par un canal privé, puis à changer si souhaité.
- Non validé : usage réel par Yann et Claudia sur un mois complet avec le nouvel écran.

- 2026-09-06 : rappel Telegram DÉPLOYÉ (secrets Supabase, Edge Function, cron 1er et 5).
  Test : « aucun virement calculé pour septembre 2026 » = attendu, le mois n'est pas ouvert.

- 2026-09-06 : **Lot B bis livré** — bot Telegram `BudgetCYM_bot` (`scripts/bot/` :
  bot.py, telegram.py, donnees.py, commandes.py, libre.py, reponses.py, calc_cli.mjs,
  tous < 400 lignes). Grammaire déterministe + repli `claude -p --model haiku` (phrases
  libres, relecture avant écriture) ; allowlist `telegram_membres` (migration
  004_telegram.sql, déjà appliquée, Yann 6433455282 inscrit) ; annuler une profondeur ;
  proposition de copie sur mois vide ; bornes 0 < montant ≤ 50 000 €.
  48 tests hors ligne verts (`python -m pytest -q tests/bot/`, Supabase et Telegram
  mockés) : grammaire, fuzzy, formatage, annuler, bornes, mois vide.
  calc_cli.mjs vérifié sur février 2026 : Yann −3 236,15 € (±1 ct, conforme).
  Recette réelle faite : dispatch direct (Supabase + Telegram réels, pas de polling) avec
  l'id Telegram de Yann — `bilan février 2026`, `salaire 6120 en février 2026` (valeur déjà
  en base), `annuler` : les 3 réponses sont arrivées dans le chat Telegram de Yann, aucune
  donnée modifiée (272 lignes / 38 revenus intacts, février 2026 identique avant/après).
  Deux bugs de grammaire trouvés et corrigés en écrivant les tests (voir D-012/L-007) :
  suffixe de mois sans « en », mot « rembours » qui cassait le fuzzy match.
  **Tâche planifiée NON installée** : `scripts/setup_task.ps1` et `scripts/start_bot.ps1`
  sont livrés et corrects (calqués sur MaxVoyage), mais `Register-ScheduledTask` refuse
  l'accès dans une session non élevée (voir D-011/L-006). Yann doit lancer
  `scripts\setup_task.ps1` en PowerShell administrateur, puis
  `Start-ScheduledTask -TaskName MaxBudget-Bot`. En attendant, le bot ne tourne pas en
  continu — aucune écoute active tant que la tâche n'est pas démarrée.

- 2026-09-05 : bot Telegram livré (Lot B bis), tourne en process détaché ; la tâche
  Windows MaxBudget-Bot reste à installer en admin (Register-ScheduledTask refusé).
  Supervision : http://127.0.0.1:8777 (MaxOps) avec liens Site / GitHub / Supabase.

## Pointeurs
- scripts/deploy_rappel.py — rejouable (secrets, fonction, cron)
- docs/regles-repartition.md — règles métier ; docs/architecture.md — stack
- scripts/provision.py — provisionnement initial (idempotent) ; scripts/sql.py — exécute un
  .sql sur le projet (migrations) ; scripts/check_secrets.py — teste la PRÉSENCE d'une clé
  .env sans jamais l'afficher ; scripts/import_excel.py — Excel → SQL
- tests/test_calc.mjs, tests/recette_visuelle.mjs, tests/recette_connectee.mjs — portes
- supabase/migrations/002_lot_a.sql (appliquée), 003_cron_rappel.sql (NON appliquée),
  004_telegram.sql (appliquée : table telegram_membres, allowlist)
- supabase/functions/rappel-virements/ — Edge Function versionnée, NON déployée
- Repo : https://github.com/kimen26/MaxBudget (Pages via .github/workflows/pages.yml)
- scripts/bot/ — bot Telegram (voir README.md « Bot Telegram ») ; tests/bot/ (48 cas,
  Supabase/Telegram mockés) ; scripts/setup_task.ps1 + scripts/start_bot.ps1 — tâche
  planifiée MaxBudget-Bot, à installer par Yann en PowerShell admin (pas encore installée)

- 2026-09-06 : **Refonte design livrée** (handoff `inbox/design_handoff_maxbudget_refonte`,
  fichiers jamais commités). Structure de données changée : `mouvements_recurrents` (le
  modèle : mode fixe / charge / part) + `mouvements` (l'occurrence d'un mois, `fait_le`)
  remplacent `virements`, qui existe encore mais que PLUS RIEN NE LIT. `lignes.regle`
  surcharge la règle d'une charge pour un mois donné ; `charges.montant_defaut` et
  `defaut_dernier` pilotent le montant préaffiché. Migration 005_refonte.sql appliquée.
  Frontend : ui-base.js (navigation, feuille, toast), ui-mouvements.js, ui-charges.js,
  ui-recurrents.js, ui-comptes.js, ui-stats.js, app.js. `ui-mois.js` supprimé.
  Six écrans en mobile (onglets bas) et PC (barre haute, colonne de détail à droite).
  Bot et Edge Function lisent `mouvements` ; le rappel replie sur les récurrents actifs
  quand le mois n'a pas encore été ouvert (cas du 1er, vérifié en réel sur septembre 2026).
  Portes vertes : test_calc, recette visuelle, recette connectée, 60 tests bot.
  Toujours pas fait : aucun compte bancaire saisi, donc « Comptes à définir » partout et
  le bouton Copier ne peut pas calculer le complément du virement permanent.

- 2026-09-06 : **MaxBudget devient MaxHome** (D-018). Site : https://kimen26.github.io/MaxHome/
  (l'ancienne URL ne redirige pas), dépôt https://github.com/kimen26/MaxHome, projet Supabase
  `maxhome` (même ref), secrets `MAXHOME_TELEGRAM_*`, tâche `MaxHome-Bot`. Dossier local et
  handle `@BudgetCYM_bot` inchangés. Lot 1 livré : accueil par modules, navigation par module
  (`MODULES` dans ui-base.js), blocs partagés, module Tâches (migration 006, `taches.js`,
  ui-taches.js, ui-taches-rec.js). Points = pénibilité figée à la coche (D-019). Tout vérifié :
  test_calc, test_taches, recette visuelle, recette connectée (RLS sur 7 tables, février 2026
  toujours −5 844,78 €). Bot relancé (PID 51904) mais tâche planifiée toujours pas installée.

- 2026-09-06 (suite) : **lane E terminée**. Trois modules en prod : Budget, Tâches, Courses.
  Migrations 006 (tâches) et 007 (courses) appliquées ; 272 lignes / 38 revenus / 16 charges
  toujours intacts. Bot multi-modules (101 tests hors ligne) : `taches`, `balance`, `ajoute`,
  `courses`, `fait <titre>` qui distingue tâche et virement (D-021). Deux Edge Functions
  planifiées : `rappel-virements` (1er et 5, 09:00 Paris) et `rappel-taches` (chaque soir,
  19:00 Paris), déployées par `scripts/deploy_rappels.py`. Audit de cohérence passé : blocs
  partagés branchés partout, plancher de points aligné entre app et bot (D-022), code mort
  retiré. Bot relancé ; la tâche planifiée Windows reste à installer en admin. `bot.py` avait
  franchi les 400 lignes : le dispatch métier vit désormais dans `scripts/bot/actions.py`
  (une fonction par module), `bot.py` ne garde que la conversation et la boucle.

- 2026-09-07 : **refactor modules livré** (lane F). `frontend/` = `socle/` + un dossier par
  module avec son descripteur `mod-*.js` ; `app.js` ne cite aucun module (D-025). Blocs de
  comportement (D-024), tâches regroupées par ligne (D-023), écritures sérialisées (D-026).
  Recette connectée durcie (persistance après rechargement, attentes sur preuves : L-018) et
  comparaison pixel `tests/comparer_captures.mjs` contre `data/captures/avant/` : tout
  identique hors jour/detail. Trois bugs réels trouvés et corrigés par ces tests. 101 tests bot,
  test_calc (+ montantTheorique), test_taches, recette visuelle : verts.

- 2026-09-12 : **refonte Tâches/Courses livrée en local — PAS ENCORE EN PROD** (lane G, brief
  `docs/briefs/maxhome-parts.md`, handoff `inbox/design_handoff_maxhome_taches` jamais commité).
  Les **parts remplacent la pénibilité** : échelle `0,5 · 1 · 2 · 3 · 5 · 8` choisie à la main,
  stockée en quarts entiers (D-027). `obligatoire` et `partageable` sont des axes séparés —
  l'obligatoire ne rapporte rien mais alimente un KPI hebdomadaire, le « fait à deux » DIVISE les
  parts (`qui` + `qui2`). Écart d'un cran par personne (`ecart_prenom`). Les parts se figent à la
  coche, changer le barème ne réécrit pas l'historique.
  Module Tâches : trois écrans refondus — Jour (bande des 7 jours, cartes, coche tri-état
  Claudia → Yann → les deux → rien), Semaine (grille tâches × jours, KPI Obligatoire, détail par
  catégorie) et Réglages · Parts (tableau de boutons-cycles, effet immédiat). L'ancien écran
  Balance a disparu ; son détail par catégorie vit désormais au bas de Semaine.
  Module Courses : magasin reséquencé selon le parcours réel et réordonnable (nouvel écran
  Réglages · Magasin), zone Repas de la semaine, classiques par fréquence, feuille « On fait le
  tour » dont la logique pure (`courses/tournee.js`) est partagée avec le bot.
  Socle : `blocs-cycle.js` porte le geste « tap = valeur suivante » (7 usages).
  Bot : vocabulaire « parts », `fait <titre> à deux`, ligne obligatoire au bilan, plus aucun
  plancher à 1. **Rappel du soir basculé de `importance == 3` sur `obligatoire`** (D-028) : sans
  ça il se serait vidé en silence.
  Nouvelle porte : `tests/recette_ecrans.mjs` — TOUS les écrans, hors ligne (Supabase bouchonné),
  à 320/360/1200 px, avec détection des débordements par mesure de géométrie (L-024). 36 captures,
  verte. `recette_visuelle.mjs` ne voyait que l'écran de connexion et ne prouvait donc rien.
  Portes vertes : test_calc, test_taches, test_courses, 113 tests bot, recette visuelle,
  recette écrans.
  **EN PROD** : migrations 008, 009 et 010 appliquées le 2026-09-12 (chacune rejouée pour
  prouver son idempotence ; budget intact : 272 lignes / 38 revenus / 16 charges). 010 ajoute
  les 9 tâches que le handoff citait sans qu'elles existent en base et aligne trois valeurs
  (salle de bain à 8 parts ET mensuelle, poubelle et verre à 1 part) — les titres disent
  « le petit », jamais le prénom de l'enfant (invariant 1). 24 tâches récurrentes actives,
  12 obligatoires, 8 partageables.
  Recette connectée verte sur la vraie base ; bot redémarré et vérifié (il dit « parts »,
  affiche la ligne Obligatoire). La tâche planifiée Windows n'est TOUJOURS pas installée :
  le bot tourne en process détaché et ne survivra pas à un redémarrage de la machine (L-006).
  Un bug réel n'a été trouvé que par la recette connectée : `classerCommeClassique` faisait un
  upsert sans `.select()`, renvoyait `null`, et vider le panier tuait l'écran Courses (L-025).
  Ni les tests unitaires ni la recette hors ligne ne pouvaient le voir — son bouchon était plus
  poli que le vrai PostgREST.
  Restent à trancher par Yann : les cartes Matin/Soir (aucune colonne ne porte ce moment) et la
  disparition de l'écran Balance (son détail par catégorie vit au bas de Semaine).

- 2026-09-12 (fin de session) : **tout est EN LIGNE**. https://kimen26.github.io/MaxHome/ sert la
  refonte complète (six commits poussés, `3a7469e..ca045ea`). Migrations 008, 009, 010 et 012
  appliquées ; budget intact du début à la fin (272 lignes / 38 revenus / 16 charges).
  L'app s'**installe sur le téléphone** : manifeste, cinq icônes, service worker calqué sur
  MaxPlay (D-033 révisée par D-034). Le hash de version est calculé DANS le workflow GitHub
  Actions, MaxHome n'ayant pas d'étape de build — vérifié en réel : le hash déployé diffère du
  hash local, donc le workflow le recalcule bien, et le cache s'invalide seul à chaque
  déploiement. Supabase n'est jamais mis en cache (deux téléphones écrivent dans la même base).
  Icône : une check-list, après une maison trop générique et un panier qui se lisait comme un sac
  à main (L-027). Validée à 48 px, la taille réelle sur l'écran d'accueil.
  Le bot redémarre par le dossier de démarrage de Windows (D-031) — la tâche planifiée est
  refusée sur cette machine quel que soit le privilège, ce que D-011 et L-006 attendaient en vain.
  Reste à faire côté humain : installer l'app sur les deux téléphones, et trancher les deux
  points ouverts de `TODO.md` (le moment des tâches faites deux fois par jour, le bloc « Par
  catégorie » de la vue Semaine absent de la maquette).

- 2026-09-14 : **refonte fidélité livrée** (lane H, D-036, brief `docs/briefs/refonte-fidelite.md`,
  audit `inbox/Audit Refonte/` jamais commité). Shell : barre basse globale Tâches · Budget ·
  Courses · Réglages, segmenté d'en-tête par module, Réglages = Parts | Charges | Comptes | Magasin
  assemblé depuis le champ `reglages` des descripteurs (`plus` n'existe plus). CSS éclaté :
  `style.css` + `socle/socle.css` + `budget.css` / `taches.css` / `courses.css`. Budget tient sur UN
  écran Mois ; `ui-charges.js` a disparu (→ `ui-mois-charges.js`, `ui-charges-ref.js`,
  `ui-regularisations.js`). Tâches : `ui-taches-cartes.js` extrait, `JOURS_HISTORIQUE` = 100.
  Migration 014 (`taches_recurrentes.cree_le`) appliquée et rejouée. Tout vert : tests unitaires,
  128 tests bot, recette écrans (45 captures), recette connectée sur la vraie base, 11 planches
  app ↔ maquette regardées (`tests/planche_maquette.mjs`). Deux bugs réels trouvés hors des
  agents : `noteBot` lu avant sa déclaration (TDZ, feuille du tour), et le doublon des quotidiennes
  d'hier sur l'écran Jour (L-030). Sous-agents Sonnet : trois sur quatre ont bloqué sur un
  arrière-plan (L-031). Reste : validation par Yann et Claudia sur le téléphone.

- 2026-09-22 : **Agenda + aide à la saisie livrés** (lane I, D-037). Quatrième module
  `frontend/agenda/` : écran Mois (grille lundi → dimanche, fond ambre = vacances de notre zone,
  trait bleu = voyage, « F » = férié, liste en toutes lettres dessous), écran Vacances (segmenté
  Zone A | B | C, bouton « Passer le foyer en Zone X », fériés à venir), Réglages · Voyages (CRUD).
  Vacances lues sur data.education.gouv.fr depuis le navigateur (cache 7 j, repli hors ligne
  annoncé) ; fériés calculés ; zone du foyer dans `parametres`. Migrations 015 (`dernier_le` sur
  les classiques) et 016 (`voyages`, `parametres`) appliquées ; quatre voyages réels en base
  (Auvergne oct. 2026, Islande nov. 2026, Ski fév. 2027, Malaga avr. 2027) posés depuis `inbox/`.
  Courses : puces des derniers articles achetés sous la ligne d'ajout, filtrées à la frappe ; un
  tap ajoute l'article avec son groupe et sa quantité. Shell : barre basse à 5 entrées, segmenté
  Réglages à 5 entrées, barre PC repliable. Toutes portes vertes ; captures regardées à 320/360/
  1200 (`data/captures/ecrans/agenda-*`, `courses-aide-saisie-*`, `feuille-ajout-voyage-*`).
  Non fait : commandes bot pour l'Agenda ; MaxVoyage reste une app locale séparée.

- 2026-09-24 : **Réglages des tâches refondus** (lane J, D-038). Tableau par thème, colonne
  Rythme (2×/j, 3×/sem., 1×/mois, au besoin), part équiv / part spé par personne, « À 2 » retiré
  des réglages : toute tâche se coche à deux, chacun prend ses parts pleines, réglables à ⅔ ou ⅓
  dans le détail. Intro remplacée par un « ? » qui ouvre l'explication. Migration 017 appliquée ;
  thème Enfant → Max en base. Portes vertes (test_taches, 128 bot, recette écrans 69 captures,
  recette connectée) ; captures regardées à 320/360/1200 (`taches-rec-*`, `feuille-aide-parts-*`,
  `detail-tache-a-deux-*`).

- 2026-09-28 : **Répartition dite en clair, charges lisibles à 360 px** (D-039). Bloc
  `choixDetaille` (actif plein + ✓, part de chacun sous chaque option) sur Réglages · Charges et
  les deux feuilles ; Réglages · Charges empilé avec écart du mois en toutes lettres ; écran Mois
  sur une colonne au téléphone (salaires, chiffres, virements, charges, ce mois seulement).
  Factices réalistes (charges négatives, écart, à saisir, clé fixe, ponctuelle). Portes vertes :
  test_calc, test_taches, recette écrans (72 captures, geste « reglage-charge » ajouté), recette
  connectée (bascule de règle sur la vraie base), recette_token (1 échec isolé sur le résumé
  Agenda puis 3 verts). Captures regardées à 320/360/1200 et sur données réelles. Déployé en prod le
  2026-09-28 ; reste à le voir sur le P30 Pro.

- 2026-09-28 (soir) : **montant habituel et mise à jour sans geste** (D-040). Yann voyait une
  version vieille de deux déploiements (L-038) et un réglage « dernier » sans effet (L-039).
  Chaque charge : « Toujours le même » ou « Change chaque mois » ; bandeau « Remplir avec les
  montants habituels » en tête de l'écran Mois ; Réglages · Charges en liste + feuille ; l'app se
  recharge seule sur une nouvelle version. recette_token : attente d'une preuve au lieu de 300 ms
  (l'Agenda lit une API publique), 5/5 vert. Portes vertes : test_calc (habituel + part affichée),
  test_taches, recette écrans (78 captures), recette_mise_a_jour (6 vérifs, rouge sur l'ancien
  index.html), recette_token, recette connectée (règle changée par la feuille sur la vraie base).

- 2026-09-28 : **Tâches au temps** (lane K, D-041). 1 part = 5 minutes ; la fiche règle le
  temps, le rythme (créneaux matin/midi/soir/nuit, tous les jours / semaine / week-end),
  obligatoire, répétable ; étapes (Lessive, Roborock, Débarrasser) et variantes (Faire à manger,
  Ranger). Liste relue par Yann en base : 26 tâches, 9 étapes. Migration 018 appliquée, rappel du
  soir redéployé. Portes vertes (test_taches, 130 bot, recette écrans 84 captures, recette
  connectée) ; captures regardées (`taches-rec-*`, `fiche-tache-*`, `jour-*`,
  `detail-tache-etapes-*`).

- 2026-09-28 (nuit) : **une charge = une rangée, son argent a un compte, le mois dit ce qui
  manque** (D-042). Réglages · Charges : nom, 50/50 | Prorata en mots, montant éditable, « va
  sur ». Écran Mois : « Septembre 2026 (fin de mois) », statut honnête (salaire → charges →
  virements), note sur un virement coché devenu faux. Les 2 virements de septembre cochés par un
  test le 13/09 ont été décochés en base (L-041). Portes : test_calc, recette écrans (84),
  recette connectée (règle basculée puis remise sur la vraie base). recette_token rouge à cause
  du bouchon `insert` absent côté Tâches (autre session, D-041) — pas du Budget.
- 2026-09-28 (nuit) : **ajouter / terminer une charge** (D-043) dans Réglages · Charges, carte
  « Terminées » repliée en bas. Portes : test_calc, recette écrans (90 captures), recette connectée.
- 2026-09-29 : **le carnet de voyage entre dans MaxHome** (D-045, brief docs/briefs/carnet-voyage.md).
  Migration 020 (`voyage_lieux`, `voyage_resas`, `voyage_pieces`, `voyages.topo`, bucket Storage
  privé `voyages`) appliquée deux fois, anonyme vérifié à vide. Les 4 carnets MaxVoyage convertis
  (inbox/voyages/, ignoré) et importés : 69 lieux, 12 résas, 4 topos. Agenda › Voyages : liste,
  fiche plein écran (résas avec code à copier et billets/QR, carte Leaflet + OSM, lieux par jour,
  topo), ajout de lieu géocodé (Nominatim), pièces copiées hors ligne ≤ 14 j avant départ. Bot :
  `voyages`, `voyage`, `lieu`, `localise`, `topo`, résa en langage libre, photo + légende = billet.
  Portes : test_agenda, recette écrans (114), recette connectée, recette_voyage_reel (lecture
  seule, fiche Malaga réelle regardée), 181 bot. recette_token rouge : bouchon `insert` côté
  Tâches (autre session), pas le carnet.
- 2026-09-30 : **carnet V2** (D-047). Migration 021 (`voyage_blocs`, `voyage_enveloppes`,
  `voyage_resas.poste`, type `repas`) ; topos découpés en blocs (scripts/topo_en_blocs.py) et un
  Résumé rédigé par voyage. Fiche en tableau de bord : bandeau couleur + J-n + 3 pastilles,
  Résumé, Prochaine étape, Budget par poste (barres, « dépassé »), résas = lignes cochables,
  blocs Info/Astuce/Attention éditables en mosaïque ; grille 8/4 sur PC avec colonne droite
  collante, une colonne au téléphone (ordre vérifié par géométrie). Bot : `topo` réécrit le seul
  Résumé. scripts/sql.py décode en UTF-8. Portes : test_agenda, test_calc, 187 bot, recette
  écrans (172, 4 largeurs), recette_voyage_reel (captures Malaga 360/1200 regardées).

