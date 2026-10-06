# Brief — Réserve : une charge mise de côté puis payée (D-054)

## Le besoin
Certaines charges ne partent pas directement du compte commun vers le destinataire :
1. **Mettre de côté** : chaque mois, le compte commun vire la part du mois vers un compte
   tampon (épargne commune). C'est CETTE étape qui est la dépense (déjà le cas : la ligne
   de la charge, comptée dans totalCommun et la répartition — rien ne change au calcul).
2. **Payer** : à son rythme (tous les mois, ou tous les 3 mois), le tampon vire la somme
   accumulée vers l'IBAN final. Ce n'est PAS une dépense : un simple déplacement, jamais
   compté dans calc.js.

L'utilisateur doit voir **une seule ligne** (pas deux dépenses), avec les deux étapes.

## Données (migration `supabase/migrations/027_reserve_relais.sql`)
Sur `mouvements_recurrents` (le virement habituel d'une charge, `mode = 'charge'`) :
- `relais_vers bigint null references comptes(id)` — destinataire final. NULL = pas de réserve,
  comportement actuel inchangé.
- `relais_tous_les int not null default 1 check (relais_tous_les in (1,2,3,6,12))` — mois.
- `relais_depart int null check (relais_depart between 1 and 12)` — un mois où le paiement tombe.
Le `compte_vers` existant reste le compte tampon (étape 1).

Mois de paiement : `(mois - relais_depart) mod relais_tous_les == 0`.
Montant à payer ce mois-là = somme des |montant_centimes| des lignes de la charge sur les
`relais_tous_les` mois se terminant par ce mois (inclus). Fonction pure, testée dans
`tests/test_reserve.mjs` (mois de paiement, passage d'année, montant cumulé, mois sans ligne = 0).
Mettre cette logique dans un petit module pur `frontend/budget/reserve.js`.

Étape 2 faite = une ligne `mouvements` (annee, mois, recurrent_id, compte_de = tampon,
compte_vers = relais_vers, montant_centimes, fait_le, fait_par, titre). Ce couple
recurrent_id + compte_de = tampon l'identifie ; vérifier dans coche-ligne.js / ui-mouvements.js
que rien d'existant n'utilise déjà un mouvement de ce recurrent_id avec ce compte_de, sinon
ajouter une colonne `etape text` plutôt que deviner.

## Écran Mois (ui-mois-liste.js, vue Destinataires et Catégories)
La ligne de la charge reste UNE ligne. Sous le libellé, un repère :
- mois sans paiement : « Mis de côté sur <tampon> · réserve X € / Y € · payé en <mois> »
  (X = cumul depuis le dernier paiement, ce mois inclus ; Y = montant du cycle complet estimé
  = part du mois × tous_les).
- mois de paiement : une deuxième case cochable sous la première, « Payer Y € → <relais_vers> »
  avec IBAN + libellé virement du compte final (bloc-libelle-virement.js existant), dans le même
  item. La ligne passe en « Fait » seulement quand les deux cases sont cochées.
Le groupement par destinataire reste sur le tampon pour l'étape 1. Pas de nouveau HTML
hors socle (CLAUDE.md invariant 6) : réutiliser caseCycle / ligneCoche.
Montants affichés en positif (D-053). 360 px, cibles 48 px.

## Écran Récurrents (ui-recurrents.js)
Dans la feuille d'un virement de charge : « Passe par une réserve » → choix du compte final,
du rythme (Chaque mois / Tous les 3 mois) et du mois de paiement. Formulaire via blocs-form.js.

## Interdits
- Aucune vraie donnée (montant, nom de compte, IBAN) dans le code, les tests ou ce brief :
  tests avec des valeurs inventées (L-049). Les données réelles sont posées en base par le
  coordinateur, pas par toi.
- Ne pas toucher calc.js (l'étape 2 n'est jamais une dépense).
- Ne pas appliquer la migration en base : écris le fichier, le coordinateur l'applique.

## Portes
`node tests/test_reserve.mjs`, `node tests/test_calc.mjs`, `node tests/test_libelles.mjs`,
`node tests/recette_ecrans.mjs` puis OUVRIR les captures du mois. Commit `feat:` sans push.
