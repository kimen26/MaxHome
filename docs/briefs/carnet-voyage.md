# Brief — Le carnet de voyage dans MaxHome

_Brief jetable (convention memory/). Décision de fond : D-045. Remplace l'arbitrage de D-037
« les carnets restent dans MaxVoyage » : ils entrent en base, derrière la connexion, jamais
dans git._

## Ce que Yann veut

Une fiche de voyage « utile pour tout », sur le téléphone, protégée :
- ce qu'on va voir, **sur une carte** ;
- ajouter un lieu depuis l'appli **ou depuis le bot**, et laisser une IA le localiser ;
- un **topo** (résumé) du voyage, que l'IA peut réécrire ;
- les **réservations** : quoi, quand, chez qui, code, prix, payé par qui ;
- les **billets / QR codes** hébergés, lisibles à l'aéroport même sans réseau.

## Le modèle : trois listes typées + un texte, pas un document HTML

Un carnet HTML mélange trois choses qui vivent différemment. On les sépare :

| Quoi | Où | Pourquoi |
|---|---|---|
| Le récit (alertes, accès, à savoir, budget estimé, comparatifs) | `voyages.topo` — markdown léger | Prose libre : l'IA la réécrit d'un bloc, l'humain la corrige. |
| Les lieux (à voir, activités, logements, restos) | `voyage_lieux` — une ligne par lieu | La carte, le jour par jour et le bot en ont besoin **ligne par ligne**. |
| Les réservations | `voyage_resas` — une ligne par résa | Code, prix, payeur, dates : de la donnée, pas du texte. |
| Billets, QR codes, PDF | `voyage_pieces` + bucket Storage privé `voyages` | Des fichiers, pas des lignes. |

La carte, le jour par jour et le budget ne sont **pas stockés** : ils se déduisent des lieux
(lat/lng, jour, catégorie) et des résas (prix). Une seule vérité, trois vues.

Écarté : un JSONB par voyage (le bot et l'appli écriraient le même document en même temps ;
impossible de demander « la prochaine résa ») ; garder le HTML en base (pas éditable sur
téléphone, la carte redevient du code).

## Schéma — `supabase/migrations/020_carnet_voyage.sql` (additif, idempotent)

```
voyages       + topo text, + topo_le timestamptz
voyage_lieux  id, voyage_id → voyages (cascade), nom text not null,
              categorie text  ∈ a_voir | activite | logement | resto | transport | autre  (défaut a_voir)
              statut    text  ∈ idee | prevu | fait | ecarte                              (défaut idee)
              jour date null (jour prévu), ordre int default 0,
              lat double precision null, lng double precision null  -- null = « à localiser »
              adresse text, note text, lien text, cree_par text, cree_le timestamptz default now()
              check ((lat is null) = (lng is null)), bornes lat/lng
voyage_resas  id, voyage_id → voyages (cascade),
              type text ∈ vol | train | logement | voiture | activite | autre, titre text not null,
              debut timestamp null, fin timestamp null   -- heure LOCALE du lieu, sans fuseau
              prestataire text, code text, prix_centimes integer check >= 0 null,
              paye_par text null (prénom d'un membre), statut ∈ a_reserver | reserve | annule (défaut reserve),
              lieu_id → voyage_lieux (set null), note text, cree_par, cree_le
voyage_pieces id, voyage_id → voyages (cascade), resa_id → voyage_resas (cascade) null,
              nom text not null, chemin text not null unique, type_mime text, taille integer,
              cree_par, cree_le
```

RLS `est_membre()` sur les trois tables, comme partout. Bucket Storage `voyages` **privé**,
10 Mo max, `image/*` et `application/pdf` ; politiques sur `storage.objects` limitées à
`bucket_id = 'voyages' and public.est_membre()`. Lecture par URL signée courte, jamais
d'URL publique. Chemin d'un fichier : `<voyage_id>/<uuid>.<ext>`.

Argent en centimes entiers (invariant 4). Les résas ne touchent pas au Budget (plus tard,
peut-être : « ajouter au mois »).

## Écrans (module Agenda)

Onglet **Voyages** ajouté (Mois · Vacances · Voyages). Réglages · Voyages reste pour créer /
dater un voyage.

**Liste** : une carte par voyage, à venir d'abord (« dans 18 jours »), passés repliés en bas.
Chaque carte : titre, dates, lieu, « 3 résas · 12 lieux ».

**Fiche** (tap sur une carte), dans cet ordre — le plus utile en voyage d'abord :
1. En-tête : titre, lieu, dates, J-n / « en cours ».
2. **Réservations** chronologiques. Rangée : icône + mot du type, titre, date-heure, **code en
   gros** (tap = copié, toast), prix · payé par. Pièces jointes en vignettes ; tap = plein écran
   fond blanc (un QR se scanne). « + Réservation », « + Billet / QR » (photo ou PDF). Pied :
   total, et part payée par chacun.
3. **Carte** : Leaflet 1.9.4 chargé à la demande depuis cdnjs (js + css), tuiles OSM avec
   attribution, marqueurs colorés par catégorie **et** légende en mots (jamais la couleur
   seule), `fitBounds`. Popup : nom, note, lien « Itinéraire ↗ » Google Maps. Cachée s'il n'y
   a aucun lieu localisé. Hors ligne : message clair, le reste de la fiche marche.
4. **Lieux** : groupés par jour (datés), puis « Sans date » par catégorie. Rangée : nom,
   catégorie, bouton statut (idée → prévu → fait), badge « à localiser ». « + Lieu » : nom,
   catégorie, jour, note → recherche Nominatim (`nom, voyages.lieu`), jusqu'à 5 résultats à
   choisir, ou « sans position ». Bouton « Localiser les n lieux sans position ».
5. **Topo** : markdown léger rendu (`##`, listes `-`, `**gras**`, liens http(s), paragraphes),
   bouton « Modifier » (zone de texte). Rendu dans `frontend/agenda/topo.js` : échapper le HTML
   **d'abord**, transformer ensuite ; testé dans `tests/test_agenda.mjs`.

**Hors ligne** : à l'ouverture d'une fiche dont le voyage commence dans ≤ 14 jours ou est en
cours, les pièces sont copiées dans Cache Storage (`maxhome-pieces`, clé = id de pièce) ; la
vignette s'affiche depuis ce cache si le réseau manque. Supprimer une pièce = objet Storage +
ligne + entrée de cache.

Géocodage : Nominatim (`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=fr&q=`),
une requête à la fois, ≥ 1 s d'écart (politique d'usage OSM). Gratuit, sans clé.

## Bot Telegram (scripts/bot/)

- `lieu <voyage> <nom>` : géocode (Nominatim, User-Agent `maxhome-bot`), insère, répond
  avec l'adresse trouvée ou « ajouté sans position ».
- `localise <voyage>` : pour chaque lieu sans position, Nominatim ; si rien, demande à
  Claude (haiku, CLI local déjà utilisé par `libre.py`) une meilleure requête, réessaie une fois.
- `résa …` en langage libre → `libre.py` extrait {type, titre, debut, code, prix, payé par},
  confirmation oui/non avant écriture (même garde que l'existant).
- `topo <voyage>` : Claude réécrit le topo à partir du topo actuel + lieux + résas, l'écrit,
  le renvoie.
- `voyage <nom>` : les résas avec leurs codes, puis les lieux du jour.
- Photo envoyée avec légende `<voyage>` → pièce jointe du voyage (bucket `voyages`).

## Données : les 4 carnets MaxVoyage

`C:\ProjetsPerso\Claude_Projects\MaxVoyage\frontend\voyages\*.html` → un JSON par carnet dans
`inbox/voyages/` (ignoré par git) : `{ topo, lieux[], resas[] }`, puis
`scripts/import_carnet.py <json> <voyage_id>` qui insère via la Management API (comme
`scripts/sql.py`). Voyages existants : Islande 1, Auvergne 2, Malaga 3, Ski 4. L'import refuse
un voyage qui a déjà des lieux ou des résas. Rien de ces données ne va dans git.

## Portes

- `node tests/test_agenda.mjs` (topo.js, regroupement par jour, totaux par payeur)
- `node tests/recette_ecrans.mjs` + captures 360 et 320 **ouvertes** (liste, fiche complète,
  QR plein écran, ajout de lieu avec résultats, carte hors ligne)
- `python -m pytest -q tests/bot/`
- `node tests/recette_connectee.mjs` : un anonyme ne lit ni les tables ni le bucket ; un membre
  écrit un lieu sur un voyage **passé ou factice** puis l'efface (L-041)
