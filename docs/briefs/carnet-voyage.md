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

---

# V2 — blocs éditables, budget cadré, fiche qui donne envie (D-047)

Retour de Yann sur la V1 : « découpe et permets d'éditer en bloc » ; « au niveau des dépenses,
cadrer les grandes lignes, puis ajouter en case à cocher : fait, à tel prix, avec toutes les
infos » ; « sur PC des lignes pleine largeur ça ne va pas : dynamique, visuel, clair, agréable,
qui invite à préparer son voyage — des blocs, des couleurs, des coins avec des infos ou tips,
un résumé clair dispo direct ».

## Données (migration 021, additive)

```
voyage_blocs      id, voyage_id → voyages (cascade),
                  type text ∈ resume | info | astuce | attention   (défaut info)
                  titre text null, texte text not null default '' (markdown léger, topo.js),
                  ordre int default 0, cree_par, cree_le, maj_le
                  -- au plus UN bloc resume par voyage (index unique partiel)
voyage_enveloppes id, voyage_id → voyages (cascade),
                  poste text ∈ transport | logement | activites | repas | sur_place | autre,
                  prevu_centimes integer not null check >= 0, note text null,
                  unique (voyage_id, poste)
voyage_resas      + poste text (même liste) null — déduit du type si null :
                  vol/train/voiture → transport, logement → logement, activite → activites, autre → autre
                  + type 'repas' ajouté à la contrainte
```
RLS est_membre() sur les deux nouvelles tables. `voyages.topo` n'est plus lu par l'écran
(gardé, jamais supprimé) : `scripts/topo_en_blocs.py` le découpe une fois en blocs (un bloc par
`## titre` ; type par mots du titre : « savoir / astuce / conseil / tip » → astuce,
« attention / alerte / fermé / important » → attention, sinon info) et crée les enveloppes à
partir des montants de budget estimés trouvés dans le topo s'il y en a (sinon aucune). Le bloc
`resume` (4 à 6 lignes : quoi, où, quand, base, points forts) est rédigé à la main par l'agent
pour les 4 voyages à partir des données — jamais inventé au-delà du carnet.

## La réservation devient une ligne de dépense à cocher

Case à cocher = `statut` a_reserver ↔ reserve (« fait »), un tap, écriture immédiate. Une ligne
montre : case, titre, prix, payé par, et une ligne de détail (date-heure, prestataire, code) ;
le code reste gros et copiable. « + Dépense » = même formulaire que + Réservation, avec le
poste. Une dépense sans date ni code (ex. « repas sur place, 40 €/jour ») est normale.

Budget = par poste : prévu (enveloppe) · engagé (lignes cochées) · à venir (non cochées) ·
reste = prévu − engagé − à venir. Barre de progression par poste (engagé plein, à venir hachuré
ou plus clair, dépassement en rouge **et** le mot « dépassé »). « Cadrer le budget » = feuille
qui liste les 6 postes avec un montant chacun. Règles pures dans carnet.js, testées.

## Mise en page : une fiche qui se lit comme un tableau de bord

Palette : une couleur d'accent par voyage déduite de son id (6 teintes du socle contrastées),
utilisée pour le bandeau et les puces — jamais seule porteuse de sens.

**Bandeau** : fond couleur d'accent, titre, lieu, dates, gros compteur « J-18 » / « En cours » /
« Terminé », et 3 pastilles chiffres : « 4 résas · 2 à faire », « 769 € / 1 800 € », « 17 lieux ».

**Blocs** (cartes arrondies 12 px, ombre douce) : chaque type a sa couleur de fond claire, un
coin/pastille avec icône + mot (« Résumé », « Info », « Astuce 💡 », « Attention ⚠️ »), son
titre et son texte. Tap sur le crayon du bloc = feuille d'édition (type, titre, texte) ;
supprimer ; monter/descendre ; « + Bloc ». Le bloc Résumé est toujours en tête, juste sous le
bandeau.

**Téléphone (< 640 px)** : une colonne, dans l'ordre : Résumé → « Prochaine étape » (la
prochaine résa datée, en carte) → Budget → Réservations & dépenses → Carte → Lieux par jour →
Infos / Astuces / Attention.

**Tablette (640–1023)** : deux colonnes égales ; les blocs Info/Astuce/Attention en grille.

**PC (≥ 1024)** : largeur max 1280, grille 12 colonnes. Gauche (8) : Résumé, Carte haute
(420 px), Lieux par jour en grille de cartes (2 colonnes). Droite (4), collante sous l'en-tête :
Prochaine étape, Budget, Réservations & dépenses compactes. Sous la grille : blocs Info /
Astuce / Attention en mosaïque (3 colonnes, auto-fit minmax(280px, 1fr)). Plus aucune ligne
qui traverse tout l'écran.

La fiche reste une feuille plein écran (D-045) ; sur PC elle centre son contenu.
