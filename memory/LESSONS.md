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
