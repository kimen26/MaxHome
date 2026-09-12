# LESSONS
_L-NNN : relire le fichier au moment d'écrire pour prendre le numéro suivant._

## L-001 — `hidden` HTML perdu par un `display:flex` CSS (2026-09-04)
Contexte : nav masquée par l'attribut `hidden`, mais visible sur la capture avant login.
Cause : `nav { display:flex }` a plus de poids que le style UA de `[hidden]`.
Correction : `[hidden] { display:none !important; }` en tête de feuille.
Mnémonique : la capture a vu ce que le log ne voyait pas — toujours ouvrir l'image.

## L-002 — Playwright local doit matcher la version globale (2026-09-04)
`npm i -D playwright` sans version tire une release dont le chromium n'est pas téléchargé ;
aligner sur la version globale puis `npx playwright install chromium`.

## L-003 — api.supabase.com renvoie 403 « error code: 1010 » sans User-Agent (2026-09-05)
Cause : Cloudflare bloque le User-Agent par défaut de urllib. Correction : un User-Agent
explicite sur chaque appel. Mnémonique : 1010 = pas le jeton, le navigateur.

## L-004 — `toLocaleString("fr-FR")` sépare les milliers par une espace fine (U+202F) (2026-09-05)
Un test qui cherche « 5 844,78 » avec une espace normale échoue. Comparer des nombres,
pas des chaînes formatées.

## L-005 — `package.json` en `"type": "commonjs"` cassait l'import ESM de `calc.js` (2026-09-05)
`tests/test_calc.mjs` (extension .mjs, donc ESM) importait `frontend/calc.js` qui utilise
`export`/`import` mais sans extension .mjs — Node applique le `"type"` de package.json à ce
fichier, qui était resté `"commonjs"` depuis la V0 (jamais testé après coup). Corrigé en
`"module"` : sans impact navigateur (index.html charge déjà app.js en `<script type="module">`,
qui ignore package.json). Mnémonique : un test qui n'a jamais tourné n'est pas une porte verte.

## L-006 — `Register-ScheduledTask` refuse sans session PowerShell élevée (2026-09-06)
`scripts/setup_task.ps1` (Lot B bis, bot Telegram) échoue avec « Accès refusé »
(HRESULT 0x80070005) dans une session non élevée, même pour l'utilisateur propriétaire de
la session interactive. `New-ScheduledTaskPrincipal -LogonType Interactive` ne suffit pas
à contourner ça. Un agent ne peut pas s'auto-élever : le script doit être livré prêt, mais
son exécution reste un geste humain (PowerShell "Exécuter en tant qu'administrateur").
Mnémonique : une tâche planifiée Windows se crée les mains sur le clavier, jamais depuis
un shell d'agent.

## L-007 — un cas du brief non testé littéralement est un bug qui dort (2026-09-06)
Le brief listait trois formats de mois : « en août », « août 2026 », « 08/2026 ». Le code
existant ne gérait que le premier (regex `\ben (mois)`) : sans test explicite sur « août
2026 » (sans « en »), ce deuxième format aurait planté silencieusement en prod. Pareil pour
« rembours… » = positif, qui cassait le fuzzy match sur le libellé (le mot restait collé
au texte cherché). Mnémonique : écrire le test AVEC les mots exacts du brief, pas une
paraphrase qui masque l'écart.

## L-008 — figer une valeur : la lire AVANT de changer l'état qui la calcule (2026-09-06)
`basculer()` posait `fait_le` puis appelait `montantAffiche()` pour figer le montant. Or
`montantAffiche()` retourne le montant stocké dès que `fait_le` est renseigné : il figeait
donc l'ancienne valeur, pas le montant théorique du moment. Corrigé en lisant le montant
avant de poser la date. Mnémonique : quand une fonction change de comportement selon un
état, capturer sa valeur avant de muter cet état.

## L-009 — un écran affiché n'est pas un écran prêt (2026-09-06)
`demarrer()` appelait `montrerEcran("mois")` (qui déclenche le rendu) avant `chargerMois()`
(qui peuple l'état) : plantage sur `etat.resultat` undefined, écran vide et bandeau d'erreur.
`montrerEcran` a reçu une option `{ rendre: false }` pour afficher sans rendre. Mnémonique :
séparer « montrer » de « rendre » quand les données arrivent en asynchrone.

## L-010 — la CLI Supabase met l'erreur de compilation sur stdout (2026-09-06)
`supabase functions deploy` échouait ; le script n'affichait que `stderr`, qui ne contenait
que « WARNING: Docker is not running » — inoffensif mais trompeur, il a fait chercher du
côté de Docker. La vraie cause (erreur de parsing du TypeScript, ligne et colonne) était sur
`stdout`, en JSON. Mnémonique : quand un outil échoue, afficher les DEUX flux avant de
diagnostiquer ; un avertissement bien visible n'est pas l'erreur.

## L-011 — ne pas réécrire du code par script Python (2026-09-06)
Deux substitutions Python sur un fichier TypeScript : la première a transformé les `\n`
d'un template literal en vrais retours à la ligne (fichier invalide), la seconde a échoué
silencieusement en laissant un appel à une fonction jamais créée. Le déploiement a échoué,
et l'appel manquant n'a été vu qu'en relisant le fichier. Mnémonique : pour éditer du code,
utiliser l'outil d'édition qui échoue bruyamment sur motif absent, pas un `str.replace`
Python qui accepte n'importe quoi — et surtout pas pour du contenu à échappements.

## L-012 — un run GitHub Actions « waiting » peut rester bloqué indéfiniment (2026-09-06)
Après le push de la refonte, le workflow Pages est resté en `status: waiting` plus de
20 minutes, job sans aucune étape. Ni approbation en attente (`current_user_can_approve:
false` même authentifié), ni minuterie, ni relecteur : une file d'exécution coincée côté
GitHub. Pendant ce temps le site servait un `index.html` neuf avec les anciens modules,
donc cassé. Débloqué en annulant le run puis en relançant via `workflow_dispatch` (le
workflow doit déclarer ce déclencheur) : parti immédiatement, site à jour en 30 s.
Mnémonique : après un push qui change les noms de fichiers servis, vérifier que le site
sert bien les NOUVEAUX fichiers (un 404 sur un module et un 200 sur un module supprimé
sont le signe d'un déploiement qui n'a pas eu lieu), pas seulement que le push est passé.


## L-013 — une assertion absolue sur un état partagé masque le bug qu'elle devrait voir
La recette cochait une tâche puis vérifiait « zéro tâche faite » pour prouver l'annulation.
Une tâche cochée par ailleurs (script de débogage, autre session) faisait passer le test à
tort, et une ligne est restée cochée en base une demi-journée sans que rien ne le signale.
Corrigé en relatif : on mémorise la liste des ids faits AVANT, on coche et décoche la ligne
identifiée par son propre id, on vérifie que la liste est revenue à l'identique.
Mnémonique : sur un état partagé, une recette compare un avant et un après, jamais un absolu.

## L-014 — deux implémentations de la même règle divergent sur le cas limite, pas sur le cas normal
`pointsDe` (JS) et `points_de` (Python) faisaient la même chose sur toutes les valeurs
utiles, et divergeaient sur 0 : `??` ne se déclenche que sur null, `or` traite 0 comme faux.
Les tests de chaque côté passaient. Ce qui a trouvé la faute, c'est un test qui EXÉCUTE les
deux et compare le résultat, pas deux tests parallèles écrits séparément.
Mnémonique : quand une règle vit dans deux langages, tester chacun ne suffit pas ; il faut un
test qui les confronte sur les mêmes entrées, cas limites compris.

## L-015 — un module à un seul onglet enferme la navigation
Le module Courses n'ayant qu'un écran, la barre mobile n'affichait qu'un onglet et le menu
« Plus » ne proposait que l'écran par défaut des autres modules : depuis Courses, l'écran
Balance devenait inatteignable sans passer par l'accueil. Trouvé par la recette, pas à l'œil.
Corrigé : « Plus » est toujours présent dans un module et liste TOUS les écrans de l'app,
groupés par module.
Mnémonique : une navigation se teste en essayant d'aller de n'importe où à n'importe où, pas
en vérifiant que chaque écran s'affiche.

## L-016 — la capture pleine page invente des chevauchements
Sur `recurrents-pc.png`, deux textes semblaient se superposer. Mesure des boîtes réelles via
`getBoundingClientRect` : aucune intersection, artefact du rendu `fullPage` de Playwright sur
une page courte. Une demi-heure perdue à chercher une cause CSS inexistante.
Mnémonique : un chevauchement vu sur une capture se confirme par une mesure de géométrie
avant d'ouvrir le CSS.


## L-017 — Supabase notifie une même session plusieurs fois : le démarrage doit être idempotent
Au rechargement, `onAuthStateChange` émet `INITIAL_SESSION` puis `SIGNED_IN` : `demarrer()`
tournait deux fois, chaque bouton statique recevait ses écouteurs en double et le formulaire
des courses créait deux articles à 4 ms d'intervalle. Invisible tant que la recette ne
rechargeait jamais la page. Corrigé par un verrou (`demarre`) levé à la déconnexion.
Mnémonique : tout ce qui branche des écouteurs sur du DOM statique ne doit pouvoir s'exécuter
qu'une fois par session ; et une recette qui ne recharge jamais ne teste pas le rechargement.

## L-018 — trois attentes de recette qui mentent
(1) Attendre un élément statique (`#form-course`) ne prouve pas que les données sont là :
attendre la liste rendue (`.mvt, .vide`). (2) Attendre le DOM après un geste ne prouve pas que
l'écriture est partie : le DOM est optimiste ; attendre la RÉPONSE du PATCH
(`page.waitForResponse`). (3) `waitForLoadState("networkidle")` répond immédiatement sur une
page déjà chargée : recharger juste après annule les requêtes en vol. Deux heures perdues à
soupçonner l'app pour trois faiblesses du test.
Mnémonique : une recette attend des preuves (données rendues, réponse réseau), pas des signes.

## L-019 — un rendu avant les données est un bug d'UX, pas un détail de test
La liste des courses affichait « Liste vide » une seconde avant de se remplir, et la recette
comptait zéro. Le squelette statique doit rester jusqu'au premier chargement du module
(`prets` dans app.js) ; l'accueil dit « Chargement… » tant que le résumé n'est pas fiable.

## L-020 — un module du socle qui touche le DOM à l'import rend tout le socle intestable (2026-09-12)
`ui-base.js` branchait `document.addEventListener("keydown", …)` et le clic du fond de feuille au
NIVEAU MODULE, pas dans une fonction. Conséquence invisible pendant des mois : tout module qui
importe `ui-base.js` — donc `blocs.js`, `blocs-cycle.js`, tout le socle — lève
`document is not defined` dès qu'on l'importe en Node. Un agent a « corrigé » en dupliquant `txt()`
dans son fichier plutôt qu'en cherchant pourquoi l'import échouait : le contournement marche et
cache la cause, et la duplication viole l'invariant 6.
Corrigé : le branchement vit dans `brancherFeuille()`, appelée par `ouvrirFeuille()`, idempotente
(L-017). Le socle s'importe à nouveau en Node, donc se teste.
Mnémonique : un fichier du socle n'exécute rien à l'import — il expose des fonctions, on l'appelle.
Et un `import` qui échoue se diagnostique, il ne se contourne pas en recopiant le symbole manquant.

## L-021 — un garde d'idempotence posé sur une valeur métier écrase les réglages de l'utilisateur (2026-09-12)
La migration 008 reprenait l'ancien barème avec `where parts_quart = 4`, en croyant que 4 = « pas
encore repris » (la valeur par défaut). Mais 4 est AUSSI la valeur légitime d'une tâche à 1 part :
rejouer la migration aurait réécrit `obligatoire` et `parts_quart` de toutes les tâches réglées à
1 part, effaçant un décochage fait à la main par Claudia ou Yann. Même piège sur les
`update … where titre in (…)` qui rétablissaient des drapeaux retirés depuis.
Corrigé par une colonne témoin `parts_reprises`, posée EN DERNIER une fois les trois `update`
passés, tous gardés sur `not parts_reprises`.
Mnémonique : l'idempotence se marque avec un témoin dédié, jamais en devinant l'état depuis une
valeur métier — une valeur par défaut est toujours aussi une valeur légitime.

## L-022 — le pluriel français ne commence pas à 1 (2026-09-12)
`parts(q)` accordait sur `q > 4` (en quarts), donc affichait « 1,5 parts ». En français le pluriel
commence à 2 : « 0,5 part », « 1 part », « 1,5 part », « 2 parts ». Le test écrit en même temps que
le code gravait l'erreur au lieu de l'attraper — il avait été écrit pour confirmer le code, pas
pour dire la règle.
Mnémonique : un test d'affichage se rédige depuis la règle de langue, pas depuis ce que le code
produit déjà.

## L-023 — le test de confrontation JS/Python compare des valeurs, pas des types (2026-09-12)
`credit_de` divisait avec `/` côté Python : `8 / 2` rend `4.0` (float) là où le JS rend `4`. Le test
croisé passait — `4.0 == 4` est vrai en Python — et un flottant serait parti dans `taches.parts_quart`,
colonne `int`. Même famille de piège que les centimes : la division des quarts doit rester entière
(`//`). Second écart trouvé au même endroit : sur une base hors échelle, `list.index()` LÈVE quand
`indexOf` rend -1, donc le bot plantait là où le navigateur dégradait.
Les deux sont invisibles pour une comparaison d'égalité : le test vérifie désormais aussi le TYPE
du crédit, et un cas « hors échelle » a été ajouté.
Mnémonique : deux implémentations d'une même règle divergent sur le type et sur le chemin d'erreur,
pas seulement sur la valeur du cas nominal — un test croisé qui ne compare que des valeurs égales
laisse passer les deux.

## L-024 — la recette visuelle ne prouvait rien : elle ne voyait que l'écran de connexion (2026-09-12)
`recette_visuelle.mjs` charge la page sans session Supabase : elle ne capture donc QUE le login.
Pendant des mois, « recette visuelle OK » a été lu comme « les écrans vont bien », alors que la
commande ne prouvait que l'absence d'erreur console au chargement. `recette_connectee.mjs`, elle,
voit tout mais exige un vrai login et ÉCRIT dans la base de prod — inutilisable en boucle.
Comblé par `tests/recette_ecrans.mjs` : Supabase bouchonné dans la page (`addInitScript`), tous les
écrans énumérés depuis les descripteurs `mod-*.js` (pas de liste en dur qui se périme), capture à
320 / 360 / 1200 px, et surtout DÉTECTION des débordements par mesure de géométrie plutôt qu'à l'œil.
Deux pièges rencontrés en l'écrivant : un port en dur (une recette interrompue laisse son serveur
quelques secondes et la relance échoue sur EADDRINUSE — port éphémère `listen(0)`), et le bruit
réseau attendu (Google Fonts, CDN Supabase coupés) qu'il faut filtrer, sinon la recette crie au loup
et finit ignorée.
Mnémonique : une recette qui « passe » doit dire CE QU'ELLE A VU ; si elle ne visite pas l'écran,
son vert ne parle pas de l'écran.

## L-025 — un upsert sans `.select()` renvoie null, et ce null finit dans l'état (2026-09-12)
`api.classerCommeClassique` faisait `sb.from(...).upsert({...}).then(rendre)` : PostgREST ne
renvoie rien par défaut sur une écriture, donc la fonction rendait `null`. « Vider le panier »
poussait ce `null` dans `etat.classiques`, et le rendu suivant mourait sur `c.libelle` — l'écran
Courses restait mort jusqu'au rechargement. Invisible aux tests unitaires (qui n'appellent pas
l'API) comme à la recette hors ligne (dont le bouchon, lui, renvoyait bien la ligne) : il a fallu
la recette CONNECTÉE, sur la vraie base, pour le voir.
Corrigé à la source (`.select().single()`), et `tournee.js` écarte désormais les entrées vides :
une fonction pure ne doit pas mourir parce qu'un appelant lui a passé un trou.
Mnémonique : toute écriture dont on réutilise le résultat doit le demander explicitement — et un
bouchon de test plus poli que le vrai serveur cache exactement cette classe de bug.
