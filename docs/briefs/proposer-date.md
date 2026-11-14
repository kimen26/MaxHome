# Proposer une date à des proches (module Proches, lot 1)

Demande de Yann (14/11/2026) : pour un petit événement (« Raclette », « on se voit ce
week-end ? »), partager nos jours libres avec des copains ou de la famille, façon Doodle. L'invité
ouvre un lien, voit les jours libres, les fériés et les vacances scolaires, coche ce qui lui va,
écrit son prénom et valide ; nous le recevons sur Telegram. Le sondage est jetable : une fois la
date retenue ou la période passée, il est détruit et le lien meurt.

Lot 2 (plus tard, même module) : « Garder le lien », relances bienveillantes. Hors périmètre ici.

## Principes

1. **Rien de personnel ne sort.** Le lien ne montre qu'une liste de jours `libre` / `pris`, sans
   titre ni motif, plus les fériés et les vacances scolaires de notre zone (données publiques).
   Cette liste est calculée dans l'app à la création puis FIGÉE dans le sondage. La page publique
   ne lit jamais l'agenda Google ni les voyages.
2. **Patron existant du partage de voyage** (migration 033, `partage.html`) : jeton uuid aléatoire,
   page publique sans session, lecture par une fonction SQL `security definer` à liste blanche de
   champs. Supprimer la ligne = le lien meurt.
3. **Le vote passe par une Edge Function** `sondage-voter`, publique (`verify_jwt` désactivé).
   Elle valide, écrit avec la clé service, puis envoie le message Telegram au groupe du foyer
   s'il existe, sinon à chaque membre (D-060, module partagé `_shared/telegram_foyer.ts`, comme
   `rappel-virements` ; secret déjà posé : `MAXHOME_TELEGRAM_BOT_TOKEN`).
   Ça marche même PC éteint, contrairement au bot. Aucune écriture anonyme directe en table.
4. **Validation du vote** : jeton connu et sondage ouvert ; prénom de 1 à 40 caractères, nettoyé
   (espaces repliés, caractères de contrôle retirés) ; jours non vides, tous dans les jours
   `libre` du sondage ; 200 votes au plus par sondage ; un même prénom qui revote remplace son vote
   (comparaison sans casse ni accents). Le message Telegram est du texte brut (pas de parse_mode).
5. **Réponses visibles ou non** : interrupteur du créateur (`reponses_visibles`, faux par défaut).
   Vrai : la page affiche, sous chaque jour, les prénoms qui l'ont coché. Faux : l'invité ne voit
   que son propre vote (gardé en `localStorage` de son navigateur, simple confort).
6. **Jetable** : bouton « Terminer » côté app = suppression de la ligne (votes en cascade).
   Purge automatique par `pg_cron` des sondages dont le dernier jour est passé depuis plus de 7 jours.
   Jeton inconnu ou supprimé : « Ce sondage est terminé. »
7. **Rien de personnel dans le dépôt** : fixtures fictives.

## Données (migration `036_sondages.sql`, additive, idempotente, sans drop : L-056)

- `sondages` : `id` bigint identity, `jeton` uuid unique défaut `gen_random_uuid()`, `titre` text
  (1 à 80), `message` text null (300 au plus, mot d'accompagnement affiché en tête), `jours` jsonb
  (tableau `[{jour:"AAAA-MM-JJ", libre:bool, ferie:text|null, vacances:text|null}]`, 62 jours au
  plus), `reponses_visibles` bool défaut faux, `cree_par` text, `cree_le` timestamptz.
  RLS `est_membre()` en lecture/écriture.
- `sondage_votes` : `id`, `sondage_id` → `sondages` on delete cascade, `prenom` text,
  `prenom_cle` text (normalisé, unique avec `sondage_id`), `jours` text[], `vote_le` timestamptz.
  RLS `est_membre()`.
- `sondage_public(p_jeton uuid) returns jsonb`, `security definer`, liste blanche : titre, message,
  jours, reponses_visibles, et `votes` (prénom + jours) SEULEMENT si `reponses_visibles`.
  Jeton inconnu : null. `grant execute` à `anon`.
- `pg_cron` : purge quotidienne (voir 007 / 034 pour la façon de planifier).

## Écrans

### Module Proches (app, connecté)
- Nouveau module `frontend/proches/` avec `mod-proches.js`, **hors de la barre basse** : il est
  atteint par sa carte sur l'accueil. Le contrat de module gagne un champ `horsBarre: true`,
  respecté par la barre basse et la barre PC.
- Écran « Proposer une date » :
  - **Création** : titre, mot facultatif, période (début et fin, 62 jours au plus ; raccourcis
    « ce week-end », « les 4 prochains week-ends », « ce mois-ci »), case « week-ends seulement ».
  - **Aperçu** : grille des jours calculée par une fonction PURE `joursLibres(debut, fin,
    {google, voyages, vacances, feries, weekendsSeuls})`. Un jour est `pris` s'il porte un
    événement Google ou s'il est couvert par un voyage. Un toucher sur un jour inverse libre/pris
    (le créateur garde la main). Fériés et vacances étiquetés.
  - Interrupteur « Les invités voient les réponses des autres ».
  - « Créer le lien », puis bouton « Copier le lien » et partage natif (`navigator.share`) si présent.
- Liste des sondages en cours : titre, nombre de réponses, et pour chaque jour les prénoms qui l'ont
  coché (le jour le plus coché en tête). Boutons : copier le lien, basculer la visibilité, Terminer
  (confirmation, suppression).
- Écrans assemblés depuis `frontend/socle/blocs*.js` (D-024), 360 px, cibles 48 px.

### Page publique `sondage.html?j=<jeton>`
- Sans session ni service worker, comme `partage.html`. Titre, mot, calendrier des jours :
  libre (touchable, 48 px), pris (grisé, « pris », non touchable), férié et vacances étiquetés
  (texte, pas seulement la couleur). Champ prénom, bouton « Envoyer ». Après envoi : « Merci,
  c'est noté ! » et récap de ses jours. Lisible à 320 px.

## Bot
- Le message vient de l'Edge Function : « Paul est dispo pour « Raclette » : sam. 21 nov.,
  dim. 22 nov. » (ou « Paul a changé son vote … »). Aucun changement de `scripts/bot/`.

## Découpage

1. Données et vote : migration 036, Edge Function `sondage-voter` (validation pure testable),
   script de déploiement calqué sur `scripts/deploy_rappels.py` / `provision.py` (sans verify_jwt).
2. Page publique : `sondage.html`, `sondage.js`, rendu pur `proches/sondage-page.js`, test node.
3. Module Proches : descripteur, `horsBarre`, `joursLibres` pur + test, écran de création et de
   suivi, sections dans `index.html`.

La mise en production (migration, fonction, front) attend l'accord de Yann.
