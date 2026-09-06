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
