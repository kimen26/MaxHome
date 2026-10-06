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

## L-026 — un `catch` vide dans une recette transforme un échec en mystère (2026-09-12)
En ajoutant la capture des feuilles à `recette_ecrans.mjs`, la seconde feuille restait
inatteignable : « page.click: Timeout ». Deux hypothèses fausses suivies (transition de sortie,
puis navigation qui repassait par le menu « Plus ») avant de MESURER — et la mesure a dit en une
ligne : `{"dessus":"feuille-fond","feuilleCachee":false}`. Le voile de la feuille précédente
recouvrait le bouton parce que mon `page.click("#feuille-fond").catch(() => {})` échouait sans
rien dire : le `catch` vide, écrit « au cas où », a masqué la cause pendant trois tentatives.
Corrigé : fermeture par `Escape` (branchée sur `document` dans ui-base.js), puis attente de la
PREUVE que le voile est parti (`#feuille-fond[hidden]`), jamais un délai.
Mnémonique : dans un test, on n'avale pas une erreur qu'on n'a pas comprise — et quand deux
hypothèses tombent, on arrête de supposer et on mesure l'état réel du DOM (L-016 appliquée aux
gestes, pas seulement aux chevauchements).

## L-027 — une icône se juge à la taille où elle sera vue, et à ce qu'on y reconnaît (2026-09-12)
Trois dessins successifs pour l'icône PWA. (1) Une maison : propre, mais générique — elle ne
disait rien de l'app. (2) Un panier de courses, que l'agent qui l'avait dessiné jugeait réussi :
regardé, il se lisait comme un SAC À MAIN, son anse pleine formant une masse au lieu d'un arc, et
ses barres internes comme des fentes. (3) Une check-list, trois lignes dont la première cochée :
le geste même de l'app, reconnaissable sans effort.
Un rapport d'agent qui dit « lisible et bien centré » ne remplace pas le fait de l'ouvrir : les
deux défauts des versions 1 et 2 (décentrage, ergots de toit, anse pleine) étaient invisibles dans
le code et évidents à l'image.
Et l'épreuve décisive n'est pas le PNG en 512 px : c'est un rendu à **48 px**, la taille réelle sur
un écran d'accueil, agrandi ensuite sans lissage pour voir ce que l'œil perçoit vraiment.
Mnémonique : une icône se regarde à sa taille d'usage, et se valide sur ce qu'un inconnu y
reconnaît — pas sur ce qu'on a voulu y mettre.

## L-028 — une capture produite n'est pas une capture regardée (2026-09-13)
La refonte de l'écran Tâches a été livrée, poussée en production et annoncée finie. Yann a
comparé la maquette et le résultat : titres qui passent sur deux lignes, cases de coche trois fois
trop grosses, fond ambre sur toutes les lignes, sous-titre qui déborde sur huit lignes et écrase
le haut de l'écran. Un écart massif, visible au premier coup d'œil.
Or `data/captures/ecrans/jour-360.png` existait, produite par `recette_ecrans.mjs`, et montrait
EXACTEMENT ces quatre défauts. Elle était sur le disque avant le commit. Personne ne l'a ouverte.
J'ai lu « recette écrans OK » et « 39 captures produites » dans un log, et j'ai conclu que l'écran
était conforme — alors que le script ne vérifie que l'absence de débordement géométrique, jamais
la ressemblance à la maquette. Le chantier précédent (L-024) avait justement construit cette
recette parce que l'ancienne ne capturait que l'écran de login : j'ai corrigé l'outil, puis commis
sur le résultat de l'outil la faute même qu'il existait pour rendre impossible.
CLAUDE.md dit « puis OUVRIR data/captures/ecrans/*.png ». C'était écrit. Je ne l'ai pas fait.
Mnémonique : « captures produites » est un résultat de script, « écran conforme » est un jugement
humain sur une image — et quand une maquette existe, la porte de sortie n'est pas « ça ne déborde
pas », c'est la capture et la maquette côte à côte. Un outil de vérification qu'on ne regarde pas
ne vérifie rien : il déplace seulement l'endroit où l'on se ment.

## L-029 — Un garde anti-double-démarrage fige aussi les reprises

Symptôme rapporté : après le login, bandeau rouge « Erreur : JWT issued at future », et seul un
Ctrl+F5 en sortait. Le réflexe naturel — accuser l'horloge du téléphone, puisque c'est la cause
classique de ce message — était faux ici : l'horloge du poste était juste à 1 seconde près, et
surtout un décalage d'horloge ne se répare pas en rechargeant la page. C'est le Ctrl+F5 qui
guérissait qui désignait le vrai coupable, pas le libellé de l'erreur.

Cause réelle, dans `app.js` : `onAuthStateChange` émet `INITIAL_SESSION` avec la session telle
qu'elle dort dans `localStorage`, token périmé compris. `demarrer()` partait sur ce token et
échouait dès le `Promise.all` des référentiels — donc AVANT de construire les instances de
modules et de brancher la navigation. supabase-js émettait un token neuf quelques instants plus
tard via `TOKEN_REFRESHED`, mais le drapeau `demarre` (posé pour éviter le double démarrage,
commentaire d'origine ligne 47) valait déjà `true` : plus rien ne repartait. L'app restait sur son
bandeau alors que la session était redevenue bonne.

La leçon n'est pas « gérer TOKEN_REFRESHED ». Elle est : **un drapeau qui protège contre la
répétition d'une réussite empêche aussi la reprise après un échec.** `demarre = true` était posé
avant de savoir si `demarrer()` allait aboutir. Deux états distincts étaient confondus sous un
seul booléen — « démarrage lancé » et « démarrage abouti ». D'où `socleEnPlace`, posé seulement
après `brancherNavigation` : sans lui, la reprise appelait `rafraichir()` sur des instances
inexistantes, qui sortait aussitôt sur `if (!instance) return` et laissait un écran VIDE — un
second bug que le test a révélé et qu'une lecture du code n'avait pas vu.

Piège de méthode qui a failli passer : la première version du test affichait
`Résumés : []` et concluait « recette token OK ». L'assertion était
`resumes.some((r) => r === "Chargement…")` — toujours fausse sur un tableau vide. Un test vert sur
une page blanche. C'est l'ouverture de la capture (L-009, L-028) qui a montré l'écran vide, et
l'ajout de `if (resumes.length === 0)` qui a rendu l'échec visible. **Une assertion sur le contenu
d'une collection doit d'abord exiger que la collection ne soit pas vide.**

## L-030 — Les données factices n'ont pas de passé ; la vraie base, si (2026-09-14)

L'écran Jour était parfait sur la recette hors ligne et doublait chaque ligne quotidienne
(« Biberons » deux fois, 0/14) sur la recette connectée. Cause : `duJour()` incluait le groupe
« retard » (l'occurrence d'hier non faite, que `perimees()` garde un jour), et les données factices
n'ont jamais d'hier non fait. Avec une bande des 7 jours, l'occurrence d'hier a son onglet : un jour
ne montre que SES occurrences. **Quand un écran dépend du temps, la recette connectée est la seule
qui voit le passé accumulé** ; la recette hors ligne prouve le rendu, pas l'état réel.

## L-031 — Un sous-agent qui lance sa recette en arrière-plan ne rend jamais son rapport (2026-09-14)

Trois agents Sonnet sur quatre ont lancé `recette_ecrans.mjs` avec `run_in_background`, puis se
sont arrêtés « en attendant la notification » — qui ne leur arrive pas. Chaque fois il a fallu les
relancer par message avec « exécute en avant-plan, timeout 300000 ». Le lot Courses a même rendu un
rapport partiel (feuille + magasin faits, écran principal intact) qu'une planche a démasqué. **Dans
un brief de sous-agent : interdire explicitement l'arrière-plan et exiger que le rapport final
liste les captures regardées ; puis regarder soi-même la planche, jamais se fier au « fidèle ».**

## L-032 — Un script Python qui écrit du JavaScript avale les `\n` (2026-09-22)

Contexte : `tests/recette_ecrans.mjs` patché par un script Python en heredoc. La chaîne Python
contenait `split("\n")` : Python a produit un vrai retour à la ligne au milieu du littéral JS,
et Node a répondu `SyntaxError: Invalid or unexpected token` sur une ligne qui semblait
anodine. Quatre tentatives de réparation ont échoué pour la même raison (la réparation aussi
passait par une chaîne Python). **Pour insérer du JS qui contient des séquences d'échappement,
l'outil Edit (correspondance exacte) plutôt qu'un patch Python ; et quand Node dit « unexpected
token » sur une ligne saine, regarder les octets (`cat -A`), pas le rendu.**

## L-033 — Une attente de test écrite de tête est fausse une fois sur trois (2026-09-22)

Contexte : trois assertions de `test_agenda.mjs` / `test_courses.mjs` ont échoué alors que le
code était juste — « lait » matche aussi « Laitue » ; un voyage qui commence le 11 novembre
passe avant le férié du même jour ; février 2027 tient sur quatre semaines. Chaque fois, c'est
l'attente que j'ai corrigée, pas le code, après avoir vérifié à la main que le résultat obtenu
était le bon. **Quand un test neuf échoue, refaire le calcul à la main avant de toucher au code :
un test écrit de tête vérifie surtout l'auteur du test.**

## L-034 — Le heredoc Bash casse sur ce poste, même entre apostrophes (2026-09-24)

Contexte : trois scripts Python passés par `cat > f <<'EOF'` ont échoué avec « unexpected EOF
while looking for matching `'` », sans rien écrire (déjà vu le 2026-09-22). **Écrire le script
avec l'outil Write dans le dossier temporaire, puis le lancer ; ne pas retenter le heredoc.**

## L-035 — Un geste de recette qui ouvre une feuille doit la refermer (2026-09-24)

Contexte : la capture « détail d'une tâche à deux » ouvrait la feuille de détail sur mobile ;
le voile restait et le geste suivant (aide à la saisie des Courses) échouait en timeout à 320
et 360 px, pas à 1200 (aside, pas de feuille). **La boucle GESTES referme toute feuille ouverte
après capture, comme la boucle FEUILLES (L-018).**

## L-036 — Conforme à la maquette ne veut pas dire lisible à 360 px (2026-09-28)

Contexte : Réglages · Charges et l'écran Mois ressemblaient à la maquette (planches regardées,
D-036) et Yann les a trouvés illisibles : libellés rognés, choix 50/50 | Prorata dont on ne voit
pas lequel est actif. La planche compare deux images, elle ne dit pas si un œil lit la page ; la
recette ne mesure que le débordement horizontal, pas un texte coupé. **À chaque capture 360,
chercher un mot tronqué et un état porté par une nuance : c'est un défaut, même si la maquette
fait pareil.** Un choix exclusif montre ce qu'il implique, et son actif est plein + ✓.

## L-037 — Des données factices trop sages cachent des écrans entiers (2026-09-28)

Contexte : les charges factices étaient positives (restes supérieurs aux salaires), toutes en
« dernier montant », aucune à saisir ni différente de sa référence ; la catégorie « Léo » hors
de `CATEGORIES` faisait disparaître la Crèche sans que personne le voie. Trois états d'écran
n'avaient jamais été capturés. **Les factices portent un exemple de chaque état que l'écran sait
dire, avec le signe et la forme réels des données.**

## L-038 — Un déploiement n'est livré que quand l'appareil l'affiche (2026-09-28)

Contexte : D-039 déployé, « au prochain lancement les téléphones prennent la nouvelle version »
annoncé sans l'avoir vérifié ; Yann a jugé une capture vieille de deux déploiements et conclu
que rien n'avait changé. Coquille cache-first = version N−1 à la première ouverture, et une PWA
gardée en mémoire ne revérifiait jamais. **Avant de dire « c'est en ligne », prouver qu'un
client déjà installé bascule seul (recette_mise_a_jour.mjs), et devant une capture d'utilisateur,
vérifier d'abord QUELLE version elle montre (un libellé qui a changé depuis suffit).**

## L-039 — Tracer qui lit un réglage avant de le redessiner (2026-09-28)

Contexte : D-039 a joliment affiché « dernier montant saisi » sans que personne vérifie ce que
ce réglage faisait : rien, sa seule lectrice (`prefixe`) n'était jamais appelée. Yann : « à quoi
sert le champ Dernier, on ne peut rien en faire ». **Pour chaque réglage montré, grep de ses
lecteurs jusqu'à un effet visible à l'écran ; un réglage sans effet se corrige ou se retire, il
ne se décore pas.**

## L-040 — Un téléphone resté ouvert recrée les occurrences d'avant la migration de données (2026-09-28)

Contexte : la nouvelle liste des tâches posée en base, les occurrences non faites du jour
supprimées pour qu'elles renaissent avec leur créneau. Une heure plus tard, la base en
contenait de nouveau sous les ANCIENS titres (« Biberons », « Cuisine »), sans moment : un
client encore sur l'ancienne version, avec l'ancienne liste en mémoire, les avait recréées. Elles
bloquaient les nouvelles (même clé récurrent + échéance + rang). **Une migration de données qui
touche la génération d'occurrences se fait APRÈS le déploiement du code, puis se vérifie par une
requête sur les occurrences du jour — et se rejoue si un vieux client a repeuplé.**

## L-041 — Un test qui écrit dans la vraie base se défait, et jamais sur le mois en cours (2026-09-28)

Contexte : les 2 virements au commun de septembre 2026 ont été cochés le 13/09 à 22:56 (1 s
d'écart, 3 min avant un commit de correctif du jeton) et jamais décochés : leurs montants se
sont figés à 50/50, salaires encore vides. Deux semaines plus tard Yann saisit ses salaires et
l'app lui dit « tout est viré ». **Une écriture de recette sur la base réelle se fait sur un mois
passé (février 2026 pour recette_connectee), se défait dans le même script, et toute session qui
coche à la main pour tester décoche avant de clore.**

## L-042 — Un repli Claude sur un géocodage raté peut localiser un lieu inventé sur le centre-ville (2026-09-29)

Contexte : preuve en direct de `localise` (bot voyages, D-045) sur un lieu totalement bidon
(« Zzqx introuvable ») : Nominatim échoue, Claude (haiku) propose alors « Lyon, France » (repli
sur la destination du voyage faute de nom reconnaissable) et Nominatim la géocode aussitôt — le
lieu se retrouve avec une position au centre-ville plutôt que resté « à localiser ». Comportement
conforme au brief (une seule tentative de repli) mais résultat trompeur pour l'utilisateur : rien
ne distingue un lieu vraiment trouvé d'un lieu retombé sur la ville entière. **Un repli LLM sur
un géocodage raté doit pouvoir répondre « je ne sais pas », pas seulement une meilleure requête ;
si la coordonnée retournée est proche du centroïde de la destination du voyage, la traiter comme
un échec plutôt qu'un succès.** Non corrigé ici (hors lot bot D, écran de revue humaine à
prévoir côté app) — à reprendre si les lieux « localisés à tort » deviennent visibles en usage.
Corrigé : un résultat Nominatim trop vague (addresstype ville/région/pays ou place_rank < 20,
sauf si le nom cherché désigne cette ville) est rejeté comme un échec ; le prompt Claude répond
vide plutôt que la ville de repli ; le message le dit (« trouvé seulement la ville »).

## L-043 — Une case qui ne se voit pas est une case absente ; jamais `git stash` dans l'arbre partagé (2026-09-29)

1. Yann : « pas de case pour valider les virements ». La case existait (17 px, bord #9aa6b4,
   ~2,5:1 sur blanc) : sur téléphone elle passait pour absente. Une commande tactile se
   vérifie à 360 px contre la règle parents (≥ 24 px visible, 48 px de tap, bord ≥ 3:1), pas
   en constatant qu'elle est dans le DOM. Corrigé : 26 px, bord --texte-2, ::before à 48 px.
2. Pour comparer une recette « avant/après », j'ai fait `git stash` / `git stash pop` : ça a
   retiré un instant le travail en cours d'une AUTRE session (carnet de voyage) et aussi ma
   propre modif — la série de captures produite ne montrait donc pas mon changement. Le pop
   est passé sans conflit, par chance. Même famille que L-038 : dans l'arbre partagé, aucune
   commande qui touche aux fichiers des autres (stash, checkout ., reset). Pour un « avant »,
   `git worktree add` dans un dossier à part.

3. Récidive 2026-09-30 par un SOUS-AGENT (lot E carnet V2) : `git stash` pour prouver qu'un
   échec venait de l'autre session. Une leçon lue par la session principale n'atteint pas ses
   agents : l'interdit (stash, checkout ., reset) s'écrit dans CHAQUE brief d'agent.

## L-044 — Un service worker va chercher le réseau dans le dos de `page.route()` (2026-09-29)

Contexte : le geste « carte hors ligne » bloquait cdnjs avec `page.route()` et attendait le
message « Carte indisponible » : timeout à chaque largeur. Le service worker de l'app met
cdnjs en stale-while-revalidate (D-045) ; ses requêtes partent du contexte worker, que
`page.route()` n'intercepte pas — Leaflet arrivait quand même. **Un test qui simule une panne
réseau neutralise d'abord le service worker (page isolée, SW désenregistré par
`addInitScript`), sinon il teste le cache, pas la panne.**


## L-045 — La session principale conçoit, Sonnet code : même les « petits » correctifs (2026-09-30)

Yann, deux fois le même jour : « délègue en sous-agent Sonnet, t'es juste le cerveau ». J'avais
codé moi-même (Opus) la case 26 px, le trajet « Compte de Claudia », l'icône, puis commencé
l'enquête détaillée du menu disparu. Règle : la session principale lit juste assez pour écrire
la spec, puis délègue le code ET les tests (`model: "sonnet"` explicite) ; elle garde la
vérification finale (captures 360/320, portes) et la livraison (commit, push, mémoire).
Enquête d'un bug : aussi déléguée, avec les hypothèses dans la spec.

## L-046 — Un sous-agent ne relance pas d'agent en arrière-plan : il rend son rapport (2026-09-30)

L'agent d'audit du bot a lancé l'audit « en arrière-plan » puis a terminé son tour avec
« je reviens dès qu'il a terminé » : rapport vide, relance nécessaire. Toute spec de sous-agent
se termine par « fais-le toi-même, sans agent ni tâche d'arrière-plan, et rends le rapport ».

## L-047 — Le bot a été muet 14 jours sans que personne le voie (2026-09-30)

Du 16/09 au 30/09 le bot ne tournait pas : le PowerShell racine (start_bot.ps1, lancé par le
raccourci de session) a été interrompu (^C dans data/bot_process.log) ; sa boucle de relance
ne peut rien contre sa propre mort, et la tâche planifiée est interdite sur cette machine
(D-031). Découvert par hasard en voulant le redémarrer. Désormais : avant de livrer un
changement du bot, vérifier qu'un python bot.py tourne ; le polling survit aux coupures
réseau (backoff 5 → 60 s). Reste ouvert : aucune alerte quand le bot est mort.

## L-048 — Un groupe de virement en mode "charge" n'a pas de ligne `type: "mouvement"` (2026-10-01)

En ajoutant le libellé de virement (D-050), premier jet : chercher le mouvement d'un groupe via
`g.lignes.find((l) => l.type === "mouvement")`. Marchait pour les virements au commun (mode
"part") mais jamais pour une charge envoyée vers un autre compte (mode "charge", D-042) — ce
groupe n'a qu'un élément `type: "ligne"` (groupes-virements.js : la charge est représentée par sa
ligne, pas par son mouvement, parce que D-046 a mis la validation visible sur `lignes.fait_le`).
Le mouvement existe pourtant bien en base (il se coche en parallèle de la ligne,
budget_lignes.py::valider_ligne) et porte le libellé du mois. Testé « à vide » (compte fixe, mode
"part") le bug ne se voyait pas ; c'est l'exemple même demandé par Yann (école, mode "charge")
qui l'a révélé en confrontation JS (L-014, tests/bot/test_virements_cli.py). Leçon : un trajet de
groupe et les TYPES d'éléments qu'il contient (`ligne` vs `mouvement`) ne se recouvrent pas —
chercher « le mouvement d'un groupe » doit toujours passer par le trajet (`compte_vers` +
`compte_de`/`qui`) directement dans `etat.mouvements`, jamais en supposant qu'un élément du
groupe EST ce mouvement. Tester avec le cas qui a motivé la demande, pas seulement le plus simple.

**Récidive** le même jour dans `supabase/functions/rappel-virements/index.ts` : en y ajoutant
`libelleACompleterPourGroupe`, le code pour une charge mode "charge" appelait `ajouter(null,
vers, montant, null)` — copié tel quel du commentaire « mode "charge" : pas de mouvement propre
ici », qui dit vrai pour le TOTAL/nLignes (pas de double-comptage) mais pas pour le LIBELLÉ : le
mouvement existe bien en base et faut le chercher par `recurrent_id`. Piège trouvé par un test
Deno écrit en confrontation (`npx --yes deno test`), pas par relecture — deux implémentations
dupliquées du même algorithme (JS app + TS Edge Function, D-049 §4) reproduisent le même bug
séparément si on ne les TESTE pas séparément avec le même cas.

## L-049 — Une vraie donnée donnée en EXEMPLE à un sous-agent finit dans git (2026-10-01)

Pour expliquer `libellé <cible> <texte>`, j'ai cité au sous-agent le vrai libellé de Yann (nom
de famille + numéro de facture). Il l'a recopié dans un commentaire et un test, poussé dans le
repo public (8b62bcd), retiré au commit suivant mais resté dans l'historique. La consigne
« jamais de vraie donnée » ne pèse rien face à un exemple concret. Règle : dans une spec de
sous-agent, n'écrire QUE des exemples fictifs (DUPONT, 1234-56) ; les vraies valeurs vont
directement en base, par une tâche de données à part. Et grep les vraies valeurs dans le diff
indexé AVANT le commit, pas après le push.

## L-050 — un `page.mouse.click(x,y)` qui touche le FAB plutôt que la ligne échoue en silence (2026-10-02)

En réécrivant un geste `recette_ecrans.mjs` pour la nouvelle liste unifiée de l'écran Mois
(D-052), un clic à coordonnées calculées (`boundingBox()` puis `page.mouse.click(x,y)`) tombait
sur le FAB « + Ajouter » (`position:fixed`, toujours au même endroit à l'écran) au lieu de la
ligne visée, qui avait glissé dessous après un défilement. Aucune erreur : le FAB absorbe le tap,
la feuille attendue n'ouvre jamais, et `page.waitForSelector(..., {timeout})` échoue après coup
sans dire pourquoi — 20 minutes perdues à soupçonner un blocage infini côté app avant de
redécouvrir la vraie cause avec `document.elementFromPoint(x, y)`. Règle : dans un geste
Playwright, `locator.click()` sur l'élément réel (il vérifie lui-même qu'aucun élément ne
l'intercepte, et lève une erreur PARLANTE sinon) — jamais des coordonnées recalculées à la main,
qui ne détectent rien et font échouer un `waitForSelector` sans piste.

## L-051 — un seul pli par catégorie, jamais un par section À faire/Fait (2026-10-02)

Première version de la liste unifiée (D-052) : une clé de pli (`deplies`) par section, genre
`"false:Logement"` (à faire) et `"true:Logement"` (fait). Valider une ligne dépliée dans « à
faire » la fait basculer dans « fait » — qui restait replié, puisque sa propre clé n'avait jamais
été ouverte. La ligne validée disparaissait de l'écran sans message d'erreur ; trouvé seulement
par `recette_connectee.mjs` sur la vraie base (un `waitForSelector` sur l'élément attendu
n'aboutissait jamais). Correctif : une seule clé par catégorie (`"cat:Logement"`), partagée par
les deux variantes de rendu — déplier une catégorie montre ses lignes à faire ET ses lignes
faites ensemble.

## L-052 — livré = poussé : vérifier origin/master avant de dire « publié » (2026-10-04)

Trois commits de la refonte de l'écran Mois sont restés en local ; on a annoncé « publié »,
le téléphone montrait l'ancien écran. Avant de dire qu'une chose est en ligne :
`git log origin/master -1` doit montrer le commit. Et une recette sur maquette ne suffit pas
pour l'écran Mois : `node tests/recette_mois_reel.mjs` (vraies données, lecture seule) a révélé
la charge « montant habituel 0 » prise pour une charge à remplir.

## L-053 — La base MaxHome se lit par `scripts/sql.py`, pas par les serveurs MCP Supabase (2026-10-06)

On a cherché les données Auvergne via les serveurs MCP : `supabase-maxvoyage` est le projet
de la migration v3 abandonnée de MaxVoyage (tables vides, MaxVoyage est revenu à SQLite le
19/08), `supabase` est MaxPlay. Une demi-session perdue en « timeout » et en fausses pistes.
La base MaxHome se lit et s'écrit par `python scripts/sql.py <fichier.sql>` (Management API,
`.env`) ; une requête de lecture va dans un fichier hors du repo.

## L-054 — Une spec qui ajoute une ligne en base vérifie d'abord les index uniques (2026-10-06)

Le brief réserve disait « vérifier que rien n'empêche un second mouvement du même récurrent ».
L'agent a vérifié le code, pas la base : l'index unique `mouvements_recurrent_mois`
(annee, mois, recurrent_id) refusait toute création, et seule l'écriture sur les données réelles
l'a montré. Avant de concevoir une nouvelle ligne dans une table existante, lister ses index
(`pg_indexes`) ; et la recette simulée ne prouve rien sur les contraintes de la base.
