# TODO — lanes
_Une session = une lane. Marquer (en cours) à l'ouverture, libérer à la fin._

## Lane A — Mise en service (Yann)
- [x] Projet Supabase + 2 comptes + schema.sql + import.sql + config.js
- [x] Repo GitHub public + Pages sur frontend/
- [ ] Transmettre son mot de passe à Claudia (canal privé)
- [ ] Recette réelle à deux sur un mois (février 2026 : Yann −3 236,15 / Claudia −2 608,63 attendus)

## Lane A — Lot A : écran mensuel, règles de répartition, virements
- [x] Migration additive 002_lot_a.sql (categorie/regle/cle_pct/payeur/ponctuel, ajustements,
      comptes, virements) — 272 lignes / 38 revenus inchangés après migration.
- [x] Moteur calc.js : 4 règles (egales/proport/cle/perso), ajustements, totaux par catégorie.
- [x] Écran mensuel : bloc « à faire », charges par catégorie repliables, alerte anti-oubli,
      ponctuels, ajustements, copie automatique proposée (mois vide seulement).
- [x] Panneaux Charges (renommer/catégorie/ordre/archiver) et Comptes (CRUD).
- [x] Edge Function rappel-virements versionnée et DÉPLOYÉE ; secrets Telegram configurés
      dans Supabase ; migration 003_cron_rappel appliquée (cron pg_cron actif, 1er et 5).
- [ ] Renseigner un compte commun réel dans le panneau Comptes (aucun compte encore créé,
      le bloc « à faire » affiche "aucun compte commun défini").

## Lane C — Lot B bis : bot Telegram
- [x] scripts/bot/ (bot.py, telegram.py, donnees.py, commandes.py, libre.py, reponses.py,
      calc_cli.mjs), tous < 400 lignes. Grammaire déterministe + repli `claude -p`.
- [x] Migration 004_telegram.sql appliquée (allowlist telegram_membres, Yann inscrit,
      272 lignes / 38 revenus intacts).
- [x] tests/bot/ : 48 cas hors ligne verts (grammaire, fuzzy, formatage, annuler, bornes,
      mois vide), Supabase et Telegram mockés.
- [x] calc_cli.mjs vérifié sur février 2026 (Yann −3 236,15 € ±1 ct).
- [x] Recette réelle (dispatch direct, Supabase + Telegram réels) : bilan, salaire déjà en
      base, annuler — 3 réponses reçues dans le chat Yann, aucune donnée modifiée.
- [x] README.md section « Bot Telegram ».
- [x] **Redémarrage automatique du bot réglé** (2026-09-12, D-031) : la création de tâches
      planifiées est verrouillée sur cette machine, même au niveau utilisateur — l'élévation
      n'y aurait rien changé. Remplacé par un raccourci dans le dossier de démarrage de la
      session (`MaxHome-Bot.lnk`), testé en réel (bot arrêté puis relancé par le raccourci).
      Le bot repart à chaque ouverture de session Windows.
- [ ] Yann : envoyer `aide` au bot pour confirmer la mise en service, puis inscrire Claudia
      (`/start` côté Claudia → `inscrire <id> Claudia` côté Yann).

## Lane D — Refonte design (2026-09-06)
- [x] Migration 005 additive : `mouvements_recurrents` + `mouvements`, `lignes.regle`,
      `charges.montant_defaut`/`defaut_dernier`. 272 lignes / 38 revenus / 16 charges intacts.
- [x] Moteur : `calculer()` lit `ligne.regle ?? charge.regle`, accepte l'ancien et le
      nouveau format de `lignes` (équivalence testée).
- [x] Six écrans mobile + PC : Ce mois (check-list cochable, détail, consigne, complément
      du permanent), Charges (segment de règle du mois, préaffichage, repères, alerte
      d'oubli), Réglages d'une charge, Stats, Récurrents, Comptes, Vue annuelle.
- [x] Bot et Edge Function bascules sur `mouvements` ; `fait <titre>`, bilan des restants ;
      repli du rappel sur les récurrents quand le mois n'a pas encore été ouvert.
- [x] Recettes : test_calc, recette visuelle, recette connectée, 60 tests bot — toutes vertes.
- [ ] **Yann : créer le compte commun** dans l'écran Comptes. Tant qu'il manque, les
      mouvements affichent « Comptes à définir » et le bouton Copier ne peut pas proposer
      le complément du virement permanent.
- [ ] Décider : polices Google Fonts (actuel) ou auto-hébergées dans `frontend/`.
- [ ] Dropper `virements` quand plus rien ne la lit (plus aucune référence au 2026-09-06).
- [ ] `libre.py` peut produire `mouvement_fait` mais `_traduire_action_libre` ne le traduit
      pas : le langage libre ne sait pas cocher (déjà vrai avant la refonte, à trancher).

## Lane E — MaxHome : suite du foyer (2026-09-06)
- [x] Lot 0 : renommage MaxBudget → MaxHome (dépôt GitHub + Pages /MaxHome/, projet Supabase,
      secrets, tâche planifiée, MaxOps, textes). Bot redémarré avec les nouveaux noms.
- [x] Lot 1 : hub d'accueil (une carte par module avec son résumé), navigation par module,
      blocs partagés (`blocs.js`), module Tâches : migration 006 (15 tâches de départ),
      `taches.js` testé (`tests/test_taches.mjs`), écrans Aujourd'hui / Balance / Réglages.
      Recette connectée étendue (7 tables RLS, coche d'une tâche, 9 captures). 
- [x] Bot Telegram multi-modules : `taches`, `balance [<jours>]`, `ajoute <article>`,
      `courses` ; `fait <titre>` vise une tâche ou un mouvement (D-021). Annulation étendue.
- [x] Rappel du soir (`rappel-taches`, 19:00 Paris) des tâches « le jour même » non faites ;
      `deploy_rappels.py` déploie et planifie les deux rappels.
- [x] Lot 2 : Courses — migration 007, écran (ajout rapide, rayons ordonnés, panier
      repliable), bot, recette. Alexa reste utilisable en parallèle.
- [x] Audit refonte : duplication descendue dans `blocs.js` (panneau, trajet, ligne de
      réglage, branchement des réglages), divergences frontend/bot corrigées (D-022), code
      mort retiré, promesses flottantes attrapées. 101 tests bot, 4 portes vertes.
- [ ] Yann et Claudia : ajuster les tâches de départ (fréquence, pénibilité, importance) —
      elles sont génériques, pas les vôtres.
- [ ] Yann : renseigner les rayons des articles récurrents au fil de l'eau (défaut « Autre »).

## Lane F — Refactor modules (brief inbox du 2026-09-07, exécuté le jour même)
- [x] Lot 1 : `socle/blocs-checklist.js` + `socle/occurrences.js` ; `montantTheorique` dans
      calc.js (testé) ; Ce mois et Aujourd'hui assemblés dessus.
- [x] Lot 2 : `socle/blocs-reglages.js` + `socle/blocs-form.js` ; Récurrents, Tâches
      récurrentes, Comptes assemblés dessus ; `confirmer()` en feuille remplace `confirm()`.
- [x] Lot 3 : un dossier par module (`budget/`, `taches/`, `courses/`), descripteurs
      `mod-*.js`, `modules.js`, `app.js` générique (128 lignes), socle injecté.
- [x] Lot 4 : ajustements dans ui-charges (formulaire en feuille), tâches regroupées
      (D-023), `tests/comparer_captures.mjs` (pixel, sans dépendance), `scripts/bot/courses.py`.
- [x] Trois bugs trouvés par la recette durcie : course d'écritures (D-026), double
      démarrage (L-017), rendu avant données (L-019).
- [ ] Bot : `mouvements.py` porte encore un miroir manuel de `montantTheorique` ; passer par
      `calc_cli.mjs` si le miroir diverge une fois de plus (L-014).

## Lane G — Refonte Tâches/Courses : parts, obligatoire, magasin, repas (2026-09-12)
_Brief : docs/briefs/maxhome-parts.md (handoff inbox/design_handoff_maxhome_taches, jamais commité)._
- [x] Lot 1 : métier des parts dans `taches.js` (échelle en quarts, `partsDe`, `creditDe`,
      `balance` avec `obligatoireSeul`, `trier` sur obligatoire) + migration 008. `pointsDe`
      et son plancher supprimés (D-027, D-022 caduque).
- [x] Lot 2 : `socle/blocs-cycle.js` — le geste « tap = valeur suivante », 7 usages du handoff.
- [x] Lot 3 : écrans Jour (bande 7 jours, cartes, coche tri-état), Semaine (grille tâches × jours,
      KPI Obligatoire, détail par catégorie) et Réglages · Parts (tableau de boutons-cycles).
- [x] Lot 4 : bot — `parts_de`/`credit_de`, vocabulaire « parts », `fait <titre> à deux`,
      ligne obligatoire au bilan ; rappel du soir basculé sur `obligatoire` (D-028).
- [x] Lot 5 : migration 009 (magasin reséquencé, repas, classiques), écrans Courses et
      Réglages · Magasin, `tournee.js` (logique pure partagée avec le bot).
- [x] `tests/recette_ecrans.mjs` : recette hors ligne de TOUS les écrans à 320/360/1200 px,
      avec détection des débordements par géométrie (L-024). 36 captures, verte.

### Reste à faire — bloqué sur Yann
- [x] **Appliquer les migrations 008, 009 et 010** : 008 (15 tâches récurrentes, 40
      occurrences, 8 obligatoires, 3 partageables), 009 (10 rayons, 3 repas, 9 ingrédients,
      table courses vide), 010 (9 tâches ajoutées, 3 mises à jour, 24 tâches actives, 12
      obligatoires, 8 partageables, 40 occurrences). Données budget intactes (272/38/16).
      Migrations rejouées deux fois, idempotence vérifiée.
- [x] `node tests/recette_connectee.mjs` verte : RLS sur 9 tables, février 2026 toujours
      −5 844,78 €, coche d'une tâche avec persistance après rechargement, panier vidé et
      liste revenue à son état d'origine, écrans Semaine et Magasin rendus (mobile + PC).
      Ses sélecteurs ont dû être repris (l'écran Tâches a changé) — elle visite désormais
      `semaine` et `magasin`, plus `balance` qui n'existe plus.
- [x] Bot redémarré et vérifié sur la vraie base : il dit « parts » avec le bon accord
      (« 1 part » / « 2 parts ») et affiche la ligne « Obligatoire · … en assure N % ».
- [x] **Redémarrage automatique du bot** : raccourci dans le dossier de démarrage (D-031),
      vérifié en réel. La tâche planifiée était impossible sur cette machine, pas seulement
      sans droits admin.

- [x] **Fidélité au design** (2026-09-12, demande de Yann : « garde l'affichage de ce qui est
      donné, c'est la cible ») : écrans Tâches et Courses repris contre la maquette — en-tête
      fixe, densité des cartes, « Liste commune », bouton « On fait le tour » compact, ligne
      d'ajout sur une ligne, FAB « + Ajouter », ordre groupes → repas → panier → classiques.
      Les cibles tactiles de la maquette (26-29 px) sont conservées VISUELLEMENT mais leur zone
      tapable est portée à 44 px (rules/mobile-parents.md prime).
- [x] **Matin / Soir** : migration 012 appliquée (`taches_recurrentes.moment`, nullable, D-029).
      12 quotidiennes réparties : 7 matin, 5 soir, 0 sans moment. Deux cartes côte à côte sur
      l'écran Jour, cycle Matin/Soir/— dans Réglages · Parts.
- [x] **Prénom de l'enfant** : les titres le portent en base ; le dépôt reste générique
      (`scripts/renommer_enfant.py` + PRENOM_ENFANT dans .env, D-030).

### À trancher par Yann
- [ ] Trois tâches à `fois: 2` (biberons, dents, table) se font matin ET soir mais n'ont qu'un
      moment en base : elles sont au matin, à rebasculer d'un tap si besoin (D-029).
- [ ] **Écran Balance retiré** : le handoff ne prévoit que Jour/Semaine/Réglages. Le détail par
      catégorie a été remis en bas de l'écran Semaine ; le choix de période (7/30 j) est perdu.
      Ce bloc n'est PAS dans la maquette : le garder (fonctionnalité utile) ou s'aligner ?
- [x] **Formulaire « Ajouter une tâche » (§8) livré** : `frontend/taches/ui-taches-ajout.js`.
      Quand (Ce jour / Semaine / Mois / En attente) · Fait par (Claudia / Yann / À deux, qui
      active `partageable`) · les 6 crans de l'échelle · bascules Obligatoire et Faisable à
      deux · bouton qui change de libellé et de couleur selon l'état. « En attente » crée une
      récurrente `au_besoin` (taches.echeance est NOT NULL, une occurrence sans date est
      impossible). Bug trouvé au passage : une tâche ponctuelle n'apparaissait dans AUCUNE
      carte de l'écran Jour — créée puis invisible. Corrigé.
- [x] **Bot : liste groupée par moment et par occurrence** (D-032). 12 lignes pour 12 tâches
      au lieu de 16, blocs Matin / Soir, compteur `(0/2)` seulement si prévu plusieurs fois.
      Le rappel de 19h sépare « à faire avant ce soir » d'un constat neutre « Pas fait ce
      matin » : réclamer le matin à 19h est un reproche creux.

## Lane B — V1 (après recette)
- [x] Vue annuelle (tableau 12 mois comme l'Excel)
- [ ] Importer les feuilles 2023 et « Garde Max » si utile

## Écran Tâches — reste à trancher (2026-09-13)
- Les trois tâches faites deux fois par jour (Biberons, Dents, Table) ne portent qu'un
  `moment` (matin). Un tap dans Réglages · Parts les bascule au soir si besoin.
- Le bloc « Par catégorie » sous la grille Semaine n'est pas dans la maquette. Gardé faute
  de remplaçant : à supprimer si Yann le juge inutile.
- Titres raccourcis en base par 013_titres_courts.sql (« Petit déjeuner de … » → « Petit déj … »).
  Si un libellé gêne, il se change dans Réglages · Parts, pas dans une migration.

## Lane H — Fidélité à la maquette (audit inbox/Audit Refonte, 2026-09-13 → 14)
_Brief : docs/briefs/refonte-fidelite.md (D-036). Quatre lots Sonnet en parallèle, un CSS par module._
- [x] Lot 0 : shell (barre basse globale à 4 entrées, segmenté d'en-tête, module Réglages
      synthétique, plus de « Plus »), tokens de la maquette, `style.css` + `socle.css` + un CSS
      par module, `sw-precache`, `recette_ecrans` lit `onglets` + `reglages`.
- [x] Lot 1 : Tâches Jour/Semaine/feuilles — sous-titre relatif, avancement `n/N` et dernier
      passage, pastilles-lettres, bande 36 px, cellules 25×22, « Par catégorie » retiré, feuille
      d'ajout présélectionne la personne connectée, méta Todo « ajouté il y a N j » (migration 014
      `taches_recurrentes.cree_le`, APPLIQUÉE, idempotente).
- [x] Lot 2 : Courses (ligne d'ajout dans l'en-tête, groupes en cartes compactes, quantité mono à
      droite, repas en texte-action + note bot, panier avec lettre, classiques en carte) et
      Réglages · Magasin (carte d'explication, nombre seul, légende).
- [x] Lot 3 : Budget compact (un écran Mois), Réglages · Charges (référence, règle, ≠ pour
      aligner), Réglages · Comptes (comptes + récurrents), régularisations réintégrées.
- [x] Lot 4 : Réglages · Parts (carte d'explication en texte, tableau par cadence, tap sur le
      titre → feuille avec Retirer, liste héritée retirée).
- [x] Porte : `tests/planche_maquette.mjs` (app ↔ maquette côte à côte, 11 planches) ;
      `tests/outils/capture_maquette.mjs` (références depuis la maquette, réseau requis).
- [x] Portes vertes : test_taches, test_calc, test_courses, 128 tests bot, recette écrans (45
      captures), recette connectée (février 2026 = −5 844,78 €, RLS 9 tables).
- [ ] Yann et Claudia : regarder sur le téléphone. Points ouverts : les tâches quotidiennes non
      faites la veille ne s'affichent plus sur le jour courant (elles restent sur l'onglet de la
      veille) ; « habit. » (jour habituel d'une hebdo) n'existe pas en base.
- [ ] Nettoyer `docs/briefs/refonte-fidelite.md` → `docs/archives/` quand Yann aura validé.

## Lane I — Agenda + aide à la saisie des courses (2026-09-22)
_Demande de Yann : « ajouter les voyages (MaxVoyage), calendrier, vacances scolaires par zone » et
« pour les courses, la liste des derniers aliments en aide à l'écriture ». Arbitrages : D-037._
- [x] Courses : puces des derniers articles achetés sous la ligne d'ajout, filtrées à la frappe
      (`courses/suggestions.js`, pur, testé) ; un libellé connu reprend son groupe ; migration
      015 (`courses_classiques.dernier_le`) appliquée.
- [x] Module Agenda : `frontend/agenda/` (calendrier.js, vacances.js, mod, trois écrans, CSS),
      migration 016 (`voyages`, `parametres`) appliquée et rejouée, RLS vérifiée par la recette
      connectée, quatre voyages réels posés en base depuis `inbox/seed_voyages.sql`.
- [x] Portes : test_agenda (nouveau), test_courses, test_taches, test_calc, 128 tests bot,
      recette écrans (63 captures, dont trois gestes : mois +2, aide à la saisie, feuille voyage),
      recette connectée (Agenda et Voyages rendus sur la vraie base, vacances Zone C en ligne).
- [ ] Bot Telegram : aucune commande Agenda (`voyages`, `vacances`) — à ajouter si Yann ou
      Claudia les demandent ; `scripts/bot/courses.py` ne connaît pas non plus les classiques
      (l'article ajouté par le bot reste en « Autre »).
- [ ] Yann : vérifier la zone du foyer (Zone C posée par défaut, écran Agenda · Vacances) et
      compléter les notes des quatre voyages si utile (Réglages · Voyages).
- [ ] Yann et Claudia : regarder l'Agenda sur le téléphone ; dire si la grille doit aussi
      porter les tâches ou les mouvements du Budget (non fait, volontairement : D-037).

## Lane J — Réglages des tâches refondus (2026-09-24)
_Demande de Yann : regrouper par thème, fréquence minimale, part spé pour la dépose, à deux
pour tout avec ⅓ · ⅔ · plein, intro courte avec une icône d'aide. Arbitrages : D-038._
- [x] Migration 017 (`parts_spe`, `parts_quart2`, `tiers`, `tiers2`) appliquée et rejouée.
- [x] partsDe / creditDe en JS et Python, confrontation L-014 à jour ; bot fige la part spé.
- [x] Réglages · Tâches par thème, colonne Rythme, part spé, aide en feuille ; « À deux » dans
      le détail et au cycle de toute tâche ; part de chacun réglable au tiers.
- [x] Thème « Enfant » renommé « Max » en base (inbox/theme_max.sql, jamais commité).
- [ ] Yann : Dépose école est reprise avec Yann 3 / Claudia 2 ; il dit que ça coûte plus à
      Claudia — inverser dans Réglages · Tâches si c'est le cas.
- [ ] Yann : ranger Linge et Déchets dans Ménage ? (champ Thème de la fiche, ou une requête).
- [ ] Yann : « Nourrir Max » matin/midi/soir — une ligne 3×/j suffit-elle, ou faut-il un moment
      par fois (et une carte Midi sur l'écran Jour) ?

## Lane K — Budget lisible à 360 px (2026-09-28)
_Retour de Yann : bouton 50/50 | Prorata pas clair, charges écrasées. Arbitrages : D-039._
- [x] Bloc `choixDetaille`, Réglages · Charges empilé, écran Mois sur une colonne.
- [x] Poussé et déployé le 2026-09-28 (run Pages 32321a6 vert, fichiers neufs servis en prod).
- [ ] Yann : le voir sur le P30 Pro (police système agrandie comprise).
- [x] `recette_token.mjs` : échec intermittent (300 ms fixes, l'Agenda lit une API publique) —
      attend désormais la preuve, 5/5 vert.
- [x] Montant habituel + « Remplir », Réglages · Charges en liste, mise à jour sans geste (D-040).
- [ ] Déployer D-040 + D-042 après accord de Yann.
- [ ] Yann : créer les comptes (commun, livrets) dans Réglages · Comptes, puis choisir « va sur »
      pour les charges d'épargne (PEL, LDD, Livret Vacances, Livret Max).
- [ ] Rappel Telegram : quand tout est coché, la requête revient vide et il renvoie la liste des
      récurrents comme « à faire » (supabase/functions/rappel-virements/index.ts, l.44).
- [ ] Mouvement mode `charge` affiché en négatif (« −100,00 € ») alors qu'un virement au commun
      est positif : signe à unifier (calc JS + bot Python, confrontation L-014).
- [ ] Yann : passer en « Toujours le même » les charges qui ne bougent pas (crédit, assurances…).
- [ ] Segmenté de Réglages (Tâches | Charges | Comptes | Magasin | Voyages) serré à 320 px.

## Lane K — Tâches au temps, créneaux, étapes (2026-09-28)
_Demande de Yann : régler le temps plutôt que les points, matin/midi/soir dans le rythme,
répétable oui/non, sa liste de tâches découpée. Arbitrages : D-041._
- [x] Migration 018 (créneaux, étapes, variantes, répétable, moment et variante sur l'occurrence).
- [x] Génération JS et Python confrontées (L-014) ; bot et rappel du soir lisent le moment de
      l'occurrence ; rappel redéployé (sans message de test).
- [x] Réglages · Tâches en liste + fiche ; écran Jour : cartes Midi/Nuit, tâches à étapes sur
      une ligne, variantes et +1 dans le détail ; feuille d'ajout en temps.
- [x] Liste réelle en base (inbox/taches_liste_2026-09-28.sql).
- [ ] Yann et Claudia : relire la liste sur le téléphone ; « Lever Max la nuit » est en
      « au besoin » (Todo) — le dire si une carte Nuit quotidienne convient mieux.
- [ ] Étagère, garage, cadres désactivés (absents de la liste relue) : les recréer si oubli.
- [ ] Bot Telegram : ne sait pas choisir une variante ni faire « +1 » (défaut : première variante).

## Lane J — Carnet de voyage (2026-09-29, D-045)
- [x] Base (020), import des 4 carnets, écrans Agenda › Voyages, bot, recettes.
- [ ] Déployer (push) et redémarrer la tâche planifiée du bot, après accord de Yann.
- [ ] Yann : renseigner « payé par » sur les résas importées (toutes « pas encore payé »).
- [ ] Connexion bloquée sur « Connexion en cours de validation… » (vu 2026-09-30 par
      recette_voyage_reel, ~1 run sur 3) : le JWT juste émis est refusé « issued at future » par
      l'API données, l'horloge du PC est pourtant à l'heure (−1 s vs serveur) → décalage interne
      Supabase auth/REST. L'app attend TOKEN_REFRESHED, qui n'arrive pas en 20 s. Vrai risque
      pour Yann au login : relancer la requête après 2-3 s au lieu d'attendre le rafraîchissement.
- [ ] Déconnexion : vider le cache `maxhome-pieces` (billets restés sur l'appareil).
- [ ] Plus tard, si demandé : une résa payée → « ajouter au mois » dans le Budget.

## Lane L — Onglet Voyages + veille vols MaxVoyage (2026-10-07, D-055)
- [x] Roue crantée, module Voyages (Nos voyages · Pépites), table veille_vols (029),
      scripts/publier_pepites.py, export côté MaxVoyage, recettes.
- [ ] Vérifier le premier relevé automatique du matin (07h15) arrivé dans l'app sans geste.
- [ ] Plus tard, si demandé : bouton « En faire un voyage » sur une pépite.
- [x] Alertes gérées depuis l'app (D-056) : table veille_alertes (030), écran Voyages › Alertes,
      synchro au début de la collecte MaxVoyage.
- [ ] Vérifier au relevé du matin le log « Alertes relevées dans MaxHome » (data/collect.log).

## Lane M — Fiche voyage V3 (2026-10-14, D-058)
- [x] Lot 1 : planning.js, meteo.js, voyage_todos (032), tests/test_planning.mjs.
- [x] Lot 2 : fiche en onglets, feuille de route, activités dépliables, carte par statut, à faire.
- [x] Lot 3 : partage par lien (033, RPC anon), page partage.html, télécharger la page.
- [x] Poser les 5 « à faire » de l'Auvergne en base une fois 032 appliquée.
- [ ] Marquer un lieu « Fait » pendant le séjour : plus de bouton depuis la V3 (à rajouter si Yann le demande).
- [ ] Les trajets (catégorie transport) apparaissent dans Activités « Acté » : à sortir si ça gêne.

## Lane N — Ouverture à Claudia (2026-10-31, D-059) (en cours)
_Demande de Yann : donner l'accès app + bot à Claudia, couper les alertes inutiles ; priorité
Budget, puis Agenda branché sur un compte Google commun (détails à venir de Yann)._
- [x] Bot relancé (mort entre 16h18 et 18h16 le 31/10 avec son superviseur, PC non redémarré,
      cause non prouvée).
- [x] Rappel des tâches du soir coupé (034 appliquée et rejouée, seul `rappel-virements` reste
      planifié) ; rappel des virements à chaque inscrit (déployé, test « envoyé à 1 membre(s) ») ;
      l'inconnu reçoit son identifiant (bot redémarré) ; reprise auto sur « JWT issued at future »
      (recette_token, scénario `horloge` rouge avant, vert après : reprise en ~3 s).
- [ ] Yann : transmettre son mot de passe à Claudia ; Claudia installe l'app et écrit au bot ;
      Yann tape `inscrire <numéro> Claudia`.
- [ ] Agenda ↔ Google : attendre les précisions de Yann (sens de la synchro, compte commun).
- [ ] Rien ne prévient quand le bot meurt (dette connue depuis le 01/10).
- [x] **Bot = interface du foyer**, Lot 1 (D-060, L-057) : phrase libre conversationnelle, récap
      en clair, demandes d'évolution dans inbox/demandes_bot.md ; `claude -p` sans outils ni MCP.
- [x] « à virer » plantait en prod (récurrent mode part sans `resultat`) : corrigé, test rouge→vert.
- [x] Lot 2 : groupe « Maison » (filtre mention / réponse / question en cours, enregistrement auto
      du groupe, départ si ajouté par un inconnu, rappels au groupe avec repli privé). Bot relancé.
- [x] Yann : BotFather Group Privacy off (getMe `can_read_all_group_messages` = true) ; groupe
      « ClaudYannHome » créé, bot ajouté, id enregistré dans `parametres.telegram_groupe`.
- [ ] Claudia rejoint le groupe ClaudYannHome (2 membres le 31/10 : Yann + bot).
- [ ] Latence du modèle : 4-8 s d'habitude, 51 s vu sur un premier appel réel (à surveiller).
- [x] Agenda Google (D-060) : projet Cloud `maxhome-513321` (compte claudyann.home), API Google
      Calendar activée, compte de service `bot-agenda@maxhome-513321.iam.gserviceaccount.com`,
      agenda « ClaudYann Home » partagé avec lui en « modifier et voir tous les détails ».
- [x] Clé JSON du compte de service créée et rangée sans affichage (`MAXHOME_GOOGLE_CLE`, 03/11).
- [x] Fuseau principal de claudyann.home et agenda « ClaudYann Home » passés à Paris (01/11,
      accord de Yann). Langue et pays du compte restent anglais / États-Unis.
- [ ] Le bot lit `.env`, la clé Google sera une variable utilisateur Windows : le Lot 3 la lit
      dans l'environnement, et le superviseur du bot doit être relancé pour en hériter.
- [ ] Mails et Drive de claudyann.home (demande de Yann, 01/11) : le compte de service ne lit
      pas un Gmail perso ; il faut un consentement « Se connecter avec Google » en lecture seule.
      Fait le 02/11 (Brave dédié, CDP 9225, profil %LOCALAPPDATA%\socle\brave-maxhome, seul
      claudyann.home connecté) : API Gmail et Drive activées, écran de consentement « MaxHome »
      (External, Testing), claudyann.home utilisatrice de test. Bloquant pour publier (sinon
      jeton coupé tous les 7 jours) : page d'accueil + page confidentialité publiques + domaine
      autorisé. Reste : client OAuth « Desktop », consentement par Yann, jeton en variable.
      02-03/11 : page frontend/confidentialite.html en ligne, Branding complété (accueil,
      confidentialité, domaine kimen26.github.io), appli « In production » ; variables posées
      sans affichage : MAXHOME_GOOGLE_CLE (compte de service), MAXHOME_GOOGLE_OAUTH_CLIENT.
      Reste : clic « Autoriser » de Yann (script de consentement en attente, port 8765), qui pose
      MAXHOME_GOOGLE_JETON après avoir vérifié que le compte est claudyann.home.
- [x] (13/11, D-068 : lecture, photos, tours, inscriptions et messages après « OK ? » ; envoi des photos sur
      Telegram vérifié par Yann le 13/11 ; non vérifié en vrai : formulaire d'inscription aux fleurs jamais observé, réponse du site
      à un POST) Espace parent de l'école de Max (événements, photos, documents, calendriers fleurs/fruits) :
      D-061. Variables posées le 02/11, connexion par programme réussie au premier coup.
      Ce qu'on y trouve : Messagerie, Cantine, Documents (tableau, liens Télécharger), Photos/Vidéos
      (tableau date + titre + Voir), RDV bilans, Fleurs du lundi (tableau HTML Date | Nom, case
      « Inscription » = libre), Encas du matin (FullCalendar : `events` en JS dans la page, un
      en-tête aliment par créneau puis le prénom inscrit, « Inscription » en vert = libre,
      « Se désinscrire » en rouge = notre tour), Facturation. Scripts d'essai dans le scratchpad
      de la session du 02/11 (jetables). Lot École : lire, prévenir des tours, jamais s'inscrire
      sans « oui ».
- [ ] Yann : règle de transfert des mails de l'école vers claudyann.home@gmail.com.
- [x] Lot 3 : outils Agenda dans le bot (13/11, D-068) : lire, créer, modifier, supprimer après « OK ? ».
      Non vérifié en vrai : une écriture d'agenda faite par le bot.
- [x] Accès Google complet le 03/11 : jeton Gmail/Drive (`MAXHOME_GOOGLE_JETON`, compte vérifié
      claudyann.home, 8 mails de l'école déjà là), agenda lu par le compte de service (droit
      writer, Europe/Paris, rien écrit). Le bot ne lit pas encore ces variables : il lit `.env`.
- [x] Bot : phrases longues et liens vers le langage libre, action `recherche` notée (D-062) ;
      journal sans contenu des messages reçus/ignorés/modifiés. Relancé le 03/11 à 8h26.
- [x] Recherche ski février 2027 (Sowell, 6→13 ou 13→20/02, Max 4 ans) : 14 fiches sourcées dans
      inbox/recherche_ski_fevrier_2027.md ; comparatif et 3 options envoyés au groupe le 03/11.
      Non vérifié : code PREMIUM (moteur de réservation anti-robot DataDome), places en école de ski.
- [x] Recherche ski élargie hors Sowell : 15 fiches et grille de prix de février des Villages Clubs
      du Soleil dans inbox/recherche_ski_fevrier_2027_autres.md, résumé envoyé au groupe le 03/11.
      Sowell n'est plus seul en tête (Superbagnères, Orcières). Non lu : prix de Max chez VCS.
- [ ] Lire `inbox/demandes_bot.md` à l'ouverture de chaque session (D-062).
- [ ] **PRIORITÉ** Garde côté serveur « le bot ne répond plus » (trois morts, la dernière vue
      cinq jours après, L-058, L-059). Bot relancé le 08/11 à 20h19.
- [x] Première écriture dans l'agenda du foyer (03/11, demande de Yann) : qui garde Max les
      mercredis de novembre, en journée entière (4 et 11 Yann, 18 et 25 Claudia), marqués
      `maxhome_type=garde_mercredi` en propriété privée (relance sans doublon, vérifiée).
      L'écran Agenda de l'app ne lit pas encore Google : ces gardes n'y apparaissent pas.
      Le tableau blanc du foyer se reporte dans le même agenda (photo de Yann, 05/11) : bleu Max,
      vert Yann, violet Claudia, rouge famille ; le pictogramme maison violet = Claudia en
      télétravail ; le « 1 » manuscrit ressemble à un « 4 », un vrai 4 a sa barre horizontale.
- [ ] Une relance écrite dans le groupe sans mention ni « Répondre » est ignorée par le bot
      (03/11 09:23, Yann attendait une réponse sur le ski). Comportement voulu (conversation
      entre eux), mais deux fois surprenant. À trancher : rappeler la règle dans les messages
      du bot qui invitent à une suite, ou traiter une question qui suit de près un message du bot.
      08/11 : troisième fois, juste après la relance du bot. Question posée à Yann : le bot
      répond-il à tous les messages du groupe, ou seulement quand on l'appelle ?
- [x] Écran Agenda · Mois branché sur l'agenda Google (D-063, 08/11) : Edge Function
      `agenda-google` déployée, recette connectée verte (30 événements réels), en ligne.
- [x] Écran Agenda : ajouter, modifier, supprimer un événement Google depuis l'app ; le télétravail
      reste dans la liste, pas dans les cases (08/11, cycle réel vérifié par recette_connectee).
- [ ] Ina samedi 28/11 : raclette confirmée (agenda à jour). Yann redemande aux parents fromages,
      charcuterie et intolérances (message préparé le 08/11).
- [ ] Briefing du matin lu par Alexa (agenda, MaxVoyage, météo, actu Brésil) : fichier à adresse
      fixe et longue sur Supabase, régénéré chaque matin ; GitLab écarté (public, mise à jour à la
      main). Oui de Yann le 08/11. Essai en ligne : seau public `briefing` (liste fermée aux inconnus,
      vérifié), nom aléatoire dans `parametres.briefing_fichier`, faux briefing sans donnée du foyer.
      Attend : Yann crée le skill Flash Briefing (même compte Amazon que l'Echo) et dit si Alexa lit
      l'essai. Ensuite : générateur du matin (pg_cron + Edge Function).
- [ ] **Alerte « cochon » des tâches du mois en retard** (demande de Yann, 08/11) : la carte
      « Ce mois » montre un simple trait pour une mensuelle jamais faite (« +3 mois » prenait toute
      la largeur). Quand une tâche a vraiment pris du retard, une alerte visible et drôle remplacera
      le trait. Seuil et forme à proposer à Yann.
- [x] (13/11, D-069) Bot : documents de voyage lus (PDF, photo) et résa proposée ; lien d'offre lu
      et rangé comme idée ; recherche web rapide. Non vérifié en vrai : un vrai PDF de compagnie, une
      vraie photo Telegram, le filtre de groupe sur un vrai message, le routage réel vers la recherche.
- [ ] Bot : message « Je cherche… » avant une recherche web (jusqu'à 180 s de silence, boucle bloquée).
- [x] (14/11, D-071) Proposer une date (module Proches, lot 1) : en ligne. Vérifié en vrai : migration 036, lecture anonyme, table fermée à l'anonyme, votes refusés (jour pris, prénom vide), vote et revote, page en ligne à 360 px, sondage de test supprimé. Message Telegram reçu (vote et revote, confirmé par Yann). Non vérifié : rappel-virements redéployé non rejoué (prochain : le 1er), copier/partager sur téléphone, création depuis l'app réelle.
- [x] (14/11, D-072) Module Proches lot 2 « Garder le lien » : EN LIGNE le 14/11 (migration 037, RLS vérifiée, front, bot redémarré, tâche MaxHome-Proches 09:00). Relance de test reçue par Yann en privé et jugée bonne (15/11) ; passage automatique du 15/11 09:00 parti. Proche fictif supprimé, tables vides. Non testé en vrai : noter un échange par le bot (« vu … »).
- [ ] (28/11, D-073) Veille de l'école INSTALLÉE le 28/11 à 00 h 15 : tâche MaxHome-VeilleEcole (8 h 30, 12 h 30,
      18 h 30), 16 tests verts. Passage à blanc réel (aucun envoi, état dans le scratchpad) : mails lus, espace parent
      lu, 47 éléments, 3 nouveautés de la semaine, 1 message pour le groupe. Le premier vrai passage (28/11 8 h 30)
      postera ces 3 nouveautés. À vérifier : `data/veille_ecole.log` après 8 h 30 et le message reçu dans le groupe
      (photos comprises). 28/11 ~01 h, à la demande de Yann : résumé complet (7 mails, 9 messages, 5 documents,
      30 photos) envoyé à Yann en PRIVÉ avec les 10 photos les plus récentes (texte et album partis sans erreur),
      état de la veille non touché. Reste non vu en vrai : un passage de la tâche qui poste dans le groupe.
- [x] (27/11, D-073) veille de l'école codée, fusionnée dans `master` (800dc2c), PAS ENCORE
      INSTALLÉE sur le PC. `scripts/bot/veille_ecole.py` : 8 h 30, 12 h 30, 18 h 30, mails de l'école +
      messages/documents/photos de l'espace parent, seul le nouveau posté dans le groupe (repli Yann).
      Yann dit n'avoir « toujours rien vu sur Telegram ». Prochaine session, si un dossier du PC est partagé
      (Remote Control), le faire soi-même ; sinon lui redonner le bloc :
      `git pull; powershell -ExecutionPolicy Bypass -File scripts\setup_task_ecole.ps1;
      Start-ScheduledTask -TaskName MaxHome-VeilleEcole; Start-Sleep 90; Get-Content data\veille_ecole.log -Tail 15`
      Lire le journal : « nouveautés : N » sans message = envoi ; « expéditeurs non posés » = demander
      les adresses/domaine de l'école (parametres.ecole_expediteurs) ; « espace parent illisible » = connexion.
      Vérifier aussi que le bot tourne (L-059 : mort 3 fois) — le groupe ne répondait pas le 22/11 non plus.
      Non vérifié en vrai : lecture réelle mails + espace parent, envoi des photos dans le groupe.
      Yann veut tout sur `master` directement, pas de branche (27/11).
- [ ] (21/11) Bot muet du 18/11 ~20 h au 21/11 10 h 32 : le journal du processus finit par « ^C », la boucle `start_bot.ps1` est morte avec bot.py (PC non redémarré depuis le 12/11, donc le raccourci de démarrage D-031 n'a rien relancé). Relancé à la main le 21/11. Cause du ^C inconnue. Piste proposée à Yann : une vérification toutes les 15 min qui relance `start_bot.ps1` (le verrou `data/bot.lock` empêche les doublons).
      21/11 15 h 50, Yann « le chatbot semble ENCORE ne pas fonctionner » : bot.py vivant (relancé
      à 10 h 32), getMe ok, file Telegram vide (pending 0), un seul message reçu depuis 10 h 32 (privé,
      traité). Rien d'autre n'est arrivé au bot : aucun « message ignoré » au journal. Réseau
      instable (RemoteDisconnected/Timeout toutes les 1-2 h), toujours rattrapé. À rejouer avec
      Yann : un message au bot en privé et un dans le groupe, puis lire `data/bot.log`.
      28/11 00 h 14 : bot de nouveau mort depuis le 23/11 18 h 51 (aucun processus, 4e mort, L-059) ;
      relancé par explorer sur `MaxHome-Bot.lnk`. Garde installé le 28/11 (D-074) : relance à 8 h et 18 h,
      testé en vrai (bot arrêté, relancé par la tâche). Cause du ^C toujours inconnue.
- [ ] (21/11) Vacances de février 2027 : choix ski / Guadeloupe / Sénégal à Yann et Claudia.
      Fiche Guadeloupe complète (vols vérifiés, activités, faune, carnaval, budget, bloc « Autres
      destinations » Sénégal et Nosy Be). Dates de la fiche restées 7 → 15 : la recaler au choix
      (7 → 19 conseillé, 1 995 € le 14/11). Relevés et pages dans `inbox/voyage_fevrier_2027/`.
- [x] (14/11, D-070) Veille des RDV bilans semestriels de l'école : tâche MaxHome-VeilleBilans
      (9 h, 14 h, 19 h), lecture réelle « fermé » vérifiée, tâche lancée une fois (résultat 0).
      Non vérifié en vrai : la page ouverte (jamais vue), le message Telegram d'ouverture.

## Lane V — Nouvel An 2026-27 : vol sec pour 2 (Yann) — EN COURS
Besoin : 2 adultes, départ CDG ou ORY uniquement, **direct**, aller 29, 30 ou 31/12,
retour du 1er au 4/01 (si retour le 1/01 : vol après 10h). Rien réservé à ce jour.
Méthode : `scripts/vols_flex.py` (provider MaxVoyage = Google Flights, `www.google.com` autorisé
dans l'environnement cloud). Une ligne `ORIGINE DEST` par process, en parallèle ; garder
`max_stops=0` (avec 1 escale, les directs sont masqués par le top 3). Réponses vides fréquentes → 6 essais.
Relevé du 27/11 (Black Friday, aucune baisse), meilleur direct, total pour 2 :
- Islande KEF : ORY 31/12→4/01 Transavia 736 € · CDG 31/12→4/01 Icelandair 983 €
  (Icelandair retour 1/01 = 07h30, hors règle ; Transavia 1/01 = 10h35 ok)
- Laponie RVN : 29/12→1/01 easyJet 1 340 € (heure retour à vérifier) · rien le 31/12
- New York EWR : 29/12→4/01 United 1 450 € · ORY French Bee →4/01 1 647 € · JFK ≥ 2 155 €
- Pétra AMM : Royal Jordanian ≥ 2 011 € (retour 1/01 = 02h05 ou 10h45)
- Asie (KUL, HAN, SGN, BKK) : 2 819 € à 3 700 €, trop long pour 4-6 jours
Historique : 06/11, 22/11, 24/11, 27/11, 28/11 — prix stables ou en hausse depuis le 24/11.
Relevé du 28/11 : tous les prix identiques au 27/11 au centime. Vu en plus : ORY→KEF 31/12→1/01
Transavia 780 € (aller 08h30, retour 1/01 10h35, conforme). Laponie : l'heure du retour easyJet
du 1/01 reste inconnue (l'aller simple du 1/01 ne montre que Finnair 20h05 et Air France 15h25).
ORY→RVN : 12 réponses vides sur 12, ORY→KEF : 9 sur 12 ; vide = échec de lecture, pas « aucun vol ».
- [ ] Choisir et réserver (Yann + Claudia) ; puis créer le voyage dans le carnet.

## Lane V bis — Grotte de Volvic (voyage Auvergne)
- [ ] Résa payée (n° 70138, 19/10/2026 10h15, 32 €, payée par Yann) jamais enregistrée en base :
      saisir dans la fiche voyage Auvergne ou appliquer le SQL préparé (session cloud sans `.env`).

## Parking
- Scan Google Flights headless (`inbox/voyage_fevrier_2027/outils/` : tfs_sn.py + scan_sn.mjs, L-062)
  servi trois fois (Guadeloupe, Sénégal, Nosy Be) : candidat à rejoindre MaxVoyage à la place des
  listes incomplètes de fast-flights.
- Le carnet de voyage (ui-fiche-*, carnet.js, carte.js, geocode.js, topo.js, ui-voyages-liste.js)
  vit encore dans frontend/agenda/ alors qu'il appartient au module Voyages (D-055).

