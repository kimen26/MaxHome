# Lot A — Refonte écran mensuel, règles de répartition, virements

_Brief jetable : vit ici tant que le chantier est ouvert, descend dans `docs/archives/` une fois livré._
_Rédigé 2026-09-05. Exécutant : sous-agent. Validé par Yann le 2026-09-05._

## Contexte (lire d'abord)
- `CLAUDE.md` (invariants, portes), `docs/regles-repartition.md`, `docs/architecture.md`, `memory/DECISIONS.md`.
- État : V0 en prod (https://kimen26.github.io/MaxBudget/), Supabase `maxbudget` (ref dans `.env` : `SUPABASE_REF`).
- Stack : HTML/JS vanille sans build (`frontend/`), `calc.js` moteur pur testé, supabase-js UMD, Playwright.
- Données réelles déjà en base (2025 + 2026). **Ne jamais perdre ni réécrire une ligne existante.**

## Objectif
Un écran mensuel qu'on prend en main en 30 secondes sur téléphone, qui accepte les variantes
de chaque mois (règle par charge, ponctuels, ajustements) et qui dit clairement **qui vire combien où**.

## Périmètre — à livrer

### 1. Modèle (migration SQL additive, jamais destructive)
- `charges` : ajouter `categorie text not null default 'Autre'` (valeurs : Logement, Max, Épargne, Alimentation, Impôts, Banque, Autre),
  `regle text not null default 'egales'` check in (`egales`,`proport`,`cle`,`perso`), `cle_pct int` (part du 1er membre en %, utilisé si regle=cle),
  `payeur text references membres(prenom)` (si regle=perso : payée par une seule personne, hors compte commun), `ponctuel boolean default false`.
  Remplir `regle` depuis `type` puis garder `type` en lecture seule (ne pas dropper). Catégoriser les 16 charges existantes :
  Logement = Crédit Immobiliaire, Charges Feuillantines, Taxe foncière, BPCE Assurances, TOTAL Electricité ;
  Max = Crèche Max, Crèche CAF, Ecole, Livret Max ; Épargne = PEL, LDD Solidaire, Livret Vacances ;
  Alimentation = Alimentation ; Impôts = Impots ; Banque = Frais bancaires ; Autre = Extras.
- `ajustements (id, annee, mois, de text, vers text, montant_centimes int, motif text)` : « Yann prend X € de plus ce mois ».
- `comptes (id, nom text, titulaire text, iban_masque text, note text, commun boolean)` : ex. « Boursorama commun », « Bourso Yann ». IBAN masqué seulement (4 derniers chiffres), jamais complet.
- `virements (annee, mois, prenom, montant_centimes, fait_le timestamptz null, primary key(annee,mois,prenom))` : montant figé au moment du calcul + case « fait ».
- RLS identiques aux tables existantes (`est_membre()`). Appliquer via un script `scripts/sql.py <fichier.sql>` (Management API, jeton lu dans `.env`, jamais affiché ; modèle : `scripts/provision.py::sql`). Versionner la migration dans `supabase/migrations/002_lot_a.sql`.

### 2. Moteur `calc.js`
- Étendre `calculer` aux 4 règles. `perso` : n'entre pas dans le commun, s'affiche dans le reste à vivre du payeur.
  `cle` : part du 1er membre = cle_pct %. Ajustements : transfèrent `montant` de `de` vers `vers` dans les parts.
- Sortie enrichie : totaux par catégorie, `aVerser[p]` (part commune + ajustements), `reste[p]`.
- Tests dans `tests/test_calc.mjs` : chaque règle, ajustement, somme des parts = total commun, cas revenus nuls. Février 2026 doit toujours donner Yann −3 236,15 ±1 ct.

### 3. Écran mensuel (mobile d'abord, une page)
Ordre de haut en bas :
1. Barre : ‹ mois ›, déconnexion. Titre du mois en gros.
2. **Bloc « À faire »** : 3 chiffres gros — « Yann verse », « Claudia verse », « reste à vivre chacun ». Sous chacun : compte cible (nom + IBAN masqué), bouton « copier le montant », case « virement fait » (écrit `virements.fait_le`). Si un virement permanent est renseigné sur le compte (`comptes.note`), afficher l'écart à virer en plus.
3. **Revenus** : 2 champs.
4. **Charges par catégorie**, sections repliables (état replié mémorisé en localStorage), sous-total par catégorie. Chaque ligne : libellé, montant inline, pastille de règle (É / % / clé / perso) cliquable pour changer, badge « ≠ mois préc. : ancienne valeur » si différent du mois précédent. Ligne vide alors que le mois précédent avait un montant : fond ambre + mention « habituellement X € ». C'est l'alerte anti-oubli (cf. Impôts 2026 vides).
5. **Ponctuels** : bouton « + ponctuel » → libellé, montant, règle ; crée une charge `ponctuel=true, actif=false` + sa ligne du mois. N'apparaît que dans les mois où elle a une ligne.
6. **Ajustements** : liste + « + ajustement » (de, vers, montant, motif).
7. Pied : total commun, dont égales / prorata / clé, statut d'enregistrement.
- **Copie automatique** : à l'ouverture d'un mois sans aucune ligne ni revenu, proposer en une phrase « Démarrer depuis <mois préc.> ? » avec un bouton ; copie charges (hors ponctuels) et revenus. Plus de bouton permanent « Copier mois préc. ».
- Gestion des charges (renommer, catégorie, ordre par glisser ou ▲▼, archiver) : panneau « Charges » accessible depuis la barre, pas dans l'écran principal.
- Comptes : panneau « Comptes » (CRUD simple).
- Design : sobre, système, chiffres tabulaires, rouge dépense / vert rentrée uniquement, pas de framework CSS. Tap targets ≥ 44 px. Desktop = même page centrée 900 px.

### 4. Rappel Telegram (conditionnel)
- Edge Function Supabase `rappel-virements` + planification `pg_cron` le 1er et le 5 de chaque mois à 09:00 Europe/Paris : lit les virements du mois courant non faits, envoie au chat Telegram « Virements MaxBudget — septembre : Yann → Bourso commun 3 236,16 € (fait ✔ / à faire) … ».
- Secrets `MAXBUDGET_TELEGRAM_BOT_TOKEN` et `MAXBUDGET_TELEGRAM_CHAT_ID` : s'ils sont absents de `.env`, **ne pas déployer**, écrire dans le rapport final « rappel Telegram : à activer, il manque X ». Ne jamais afficher un secret.

## Hors périmètre (ne pas faire)
Vue annuelle, KPIs, objectif vacances (Lot B). Simulateur garde, export (abandonnés). Virement bancaire automatique (D-006 : impossible sans prestataire DSP2, refusé).

## Portes (toutes vertes avant de rendre la main)
- `node tests/test_calc.mjs`
- `node tests/recette_visuelle.mjs` puis **ouvrir** `data/captures/*.png` (mobile ET desktop) et décrire ce qu'on voit.
- `node tests/recette_connectee.mjs` (à étendre : bloc À faire présent, sections catégories, février 2026 = chiffres attendus, cocher un virement puis le décocher).
- Vérifier en SQL que le nombre de lignes/revenus est inchangé après migration (272 / 38).
- Push sur `master` → workflow Pages vert → `curl` de l'URL prod renvoie 200 et le nouveau HTML.

## Règles de travail
- Commits conventionnels petits et fréquents, `git add <chemins>` explicites, jamais `-A`. Ne pas committer `.env`, `data/`, `inbox/`.
- Fichiers < 400 lignes : découper `app.js` (ex. `api.js`, `ui-mois.js`, `ui-charges.js`, `ui-comptes.js`).
- Questions : ne pas bloquer ; trancher, noter l'arbitrage dans `memory/DECISIONS.md` (numéro pris en relisant le fichier), continuer.
- À la fin : `memory/MEMORY.md` (état), `memory/TODO.md` (Lot A coché, Lot B ouvert), `memory/LESSONS.md` si piège payé, puis déplacer ce brief dans `docs/archives/`.
- Rapport final court : ce qui est livré, ce qui n'est pas fait et pourquoi, captures ouvertes, URL prod.
