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
