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
