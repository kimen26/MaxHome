# Brief — Fiche voyage V3 : feuille de route, onglets, trois statuts, météo, à faire, partage (D-058)

_Brief jetable. Remplace la mise en page V2 de la fiche (D-047 §V2) ; les sous-écrans existants
(résas, budget, blocs, formulaire de lieu, carte Leaflet) sont réutilisés, pas réécrits._

## Ce que Yann veut

> « Le planning des jours, déjà payé en vert, acté en bleu, imaginé/possible en gris, en cartes
> dans l'en-tête, une road map visuelle simple et qui tape. Des onglets Planning, Activités,
> Carte, avec toujours en évidence les 3 statuts, et une to-do. Pouvoir ouvrir les cartes des
> activités pour avoir plus d'options. Partager avec des copains. »
> Puis : « vire la météo de l'en-tête, elle est déjà dans le planning ; croise 2-3 sources pour
> être sûr de la pluie. »

**Maquette de référence** : `inbox/maquettes/voyage-auvergne.html` (locale, ignorée par git,
contient de vraies données : la regarder, ne JAMAIS recopier ses valeurs dans le code, les tests
ou un brief — L-049). Écart voulu par rapport à elle : **aucune météo sur les cartes de
l'en-tête**.

## Les trois statuts (et un quatrième, replié)

| Statut affiché | Mot | Couleur (texte ≥ 4.5:1) | Règle |
|---|---|---|---|
| `paye` | Payé | vert `#1d6f42` sur `#e7f4ec` | le lieu a une résa liée `reserve` (`resaDuLieu`), ou c'est une résa `reserve` sans lieu |
| `acte` | Acté | bleu `#1d5b96` sur `#e8f0fa` | lieu `prevu` ou `fait` sans résa payée ; résa `a_reserver` |
| `possible` | Possible | gris `#5f6368` sur `#f1f3f4` | lieu `idee` |
| `ecarte` | Écarté | gris barré | lieu `ecarte` — jamais dans le planning, replié dans Activités |

La couleur n'est jamais seule : le mot est toujours écrit (pastille). Un lieu `fait` garde son
statut et ajoute « ✓ Fait ».

**Statut d'un jour** = le plus avancé (paye > acte > possible) parmi ses éléments **hors
logement et hors transport** ; s'il n'y en a aucun, le plus avancé de ses logements/transports ;
rien du tout = `possible`.

**Éléments d'un jour** : les lieux dont `jour` = ce jour (ou, sans jour, la date de leur résa
liée, comme `sectionsLieux`), plus les résas datées ce jour-là sans `lieu_id`. Ordre : `ordre`
puis heure de la résa puis nom ; transports en tête si `ordre` égal.
**Nuit** : une résa de type `logement` non annulée couvre la nuit du jour J si
`debut ≤ J < fin` (dates seules) ; une résa logement sans `fin` couvre seulement la nuit de son
`debut`. La nuit s'affiche en dernière ligne du jour (« 🌙 Nuit : <titre> »), avec son statut.
Le jour où `fin` = J, une ligne « Libérer : <titre> » (statut de la résa) en tête.
**Titre court d'un jour** : noms des éléments hors logement/transport joints par « · » (2 au
plus, puis « +n ») ; sinon le premier transport ; sinon « Journée libre ».

## Météo : plusieurs modèles, un verdict honnête

Open-Meteo, gratuit, sans clé, CORS ouvert :
`https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&models=meteofrance_seamless,ecmwf_ifs025,gfs_seamless,icon_seamless&timezone=Europe/Paris&start_date=..&end_date=..`
Les champs reviennent suffixés par modèle (`precipitation_sum_ecmwf_ifs025`…) ; une valeur
`null` = modèle muet ce jour-là (portée dépassée), exclu du compte.

Synthèse PURE par jour : `min`, `max` (médiane des modèles), `mm` (médiane), `nbPluie` (modèles
≥ 1 mm), `nbModeles` (non null), `verdict` : `pluie` si `nbPluie ≥ ceil(2/3 · nbModeles)`,
`sec` si `nbPluie = 0`, sinon `incertain` ; `icone` et `mot` depuis le `weather_code` majoritaire
(table WMO courte : 0-1 ☀️ Beau, 2 ⛅ Éclaircies, 3 ☁️ Couvert, 45-48 🌫️ Brouillard, 51-57 🌦️
Bruine, 61-67 🌧️ Pluie, 71-77 ❄️ Neige, 80-82 🌦️ Averses, 95-99 ⛈️ Orage). Affiché :
« 🌧️ Pluie · 8° à 12° · 15 mm · 4 modèles sur 4 », « Sec · 5 modèles sur 5 », « Pluie possible
· 2 modèles sur 4 ».

Où : la position du logement de la nuit du jour (lat/lng du lieu lié à la résa), sinon le
barycentre des lieux localisés du voyage. Quand : seulement si le jour est entre aujourd'hui et
aujourd'hui + 15 ; sinon pas de ligne météo (jamais d'erreur visible). Hors ligne ou échec : pas
de ligne météo, `console.error` (pas d'erreur avalée en silence, pas de toast). Cache
`sessionStorage` 3 h par (lat,lng arrondis à 0,01, jours) dans un try/catch (stockage absent =
on refetch). Mention sous le planning : « Météo : Open-Meteo, plusieurs modèles, fiable à 2-3
jours. »

---

## Lot 1 — règles pures, météo, données « à faire » (pas d'écran)

- `frontend/agenda/planning.js` (PUR) : `statutLieu(lieu, resas)`, `statutResa(resa)`,
  `joursDuVoyage(voyage)`, `planningParJour(voyage, lieux, resas)` →
  `[{ jour, statut, titreCourt, liberer: [..], elements: [{ type: "lieu"|"resa", objet, statut }], nuits: [{ resa, statut }] }]`,
  `lieuxParStatut(lieux, resas)` → `{ paye, acte, possible, ecarte }` (tri jour puis ordre puis nom).
- `frontend/agenda/meteo.js` : `syntheseMeteo(reponse, modeles)` PURE ; `positionMeteo(jour,
  lieux, resas)` PURE ; `chargerMeteo(voyage, lieux, resas, aujourdHui)` (seul endroit qui
  fait `fetch`, renvoie `Map jour → synthèse`).
- Migration `supabase/migrations/032_voyage_todos.sql` (additive, idempotente, **ne pas
  l'appliquer**) : `voyage_todos (id bigint identity pk, voyage_id → voyages cascade, texte text
  not null, detail text null, lien text null, ordre int default 0, fait_le timestamptz null,
  fait_par text null, cree_par text, cree_le timestamptz default now())`, RLS `est_membre()`
  comme les autres tables voyage.
- `frontend/socle/api.js` : `voyageTodos(voyageId)`, `creerTodo`, `majTodo`, `supprimerTodo`
  (même patron que les lieux).
- Test : `tests/test_planning.mjs` (statuts, statut d'un jour avec/sans activité, nuits
  `debut ≤ J < fin`, résa logement sans fin, libérer, titre court +n, résa sans lieu, synthèse
  météo avec une réponse inventée à 4 modèles dont un muet, verdicts pluie/sec/incertain).
  Valeurs inventées uniquement.

## Lot 2 — la fiche (dépend du lot 1)

Ordre et contenu, à 360 px d'abord :
1. **Bandeau** (existant, `ui-fiche-bandeau.js`) : ← Voyages, titre, lieu, dates, J-n, pastilles
   « X € payés / Y € », « n à faire ». Bouton « Partager » réservé au lot 3 (ne pas le créer).
2. **Légende** : trois pastilles Payé · Acté · Possible.
3. **Feuille de route** : une carte par jour du voyage (jour court « sam. 3 », titre court,
   statut en mot), bordure haute 6 px de la couleur du statut, **sans météo**. Bande à défilement
   horizontal interne avec scroll-snap sous 640 px (la page, elle, ne défile jamais en largeur),
   retour à la ligne au-dessus. Tap = onglet Planning + défilement jusqu'au jour. Cible ≥ 48 px.
4. **Onglets** collants : Planning · Activités · Carte · À faire (pastille du nombre restant) ·
   Infos. Icône + mot. Onglet par défaut : Planning.
5. **Planning** : une carte par jour (date longue, titre court, pastille statut, ligne météo,
   conseil auto « ☔ Prévoir la pluie » si verdict `pluie`, puis éléments colorés par statut avec
   leur mot, nuit en dernier).
6. **Activités** : quatre groupes (Payé · Acté · Possible · Écartés replié). Chaque carte est
   dépliable ; dépliée : description (`topo`), horaires, note, prix et code si résa (code gros
   et copiable comme aujourd'hui), photo s'il y en a, puis les actions :
   - choix de statut Possible / Acté (écrit `lieu.statut` idee/prevu, écriture immédiate,
     rollback du socle) ; « Payé » ouvre le formulaire de résa existant, pré-rempli, lié au lieu ;
   - « Choisir le jour » (jours du voyage + « Sans date ») ;
   - Site ↗, Itinéraire ↗ (Google Maps `dir/?api=1&destination=lat,lng`), Modifier (formulaire
     de lieu existant), « + Lieu » en bas de l'onglet.
7. **Carte** : `rendreCarteVoyage` existant, marqueurs colorés **par statut** (plus par
   catégorie), légende en mots, écartés masqués.
8. **À faire** : liste cochable (`fait_le`, `fait_par` = membre connecté), ajout d'une ligne
   (texte, détail, lien), suppression ; faites en bas, barrées. Patron du socle
   (`blocs-checklist.js` / `blocs-form.js`), pas de cycle optimiste réécrit (invariant 6).
9. **Infos** : Résumé, Réservations & dépenses, Budget, puis blocs Info/Astuce/Attention — les
   sous-écrans existants, inchangés.

Contrainte pour le lot 3 : les rendus de la feuille de route, du planning, des activités (sans
actions) et des infos doivent être des **fonctions pures qui rendent du HTML** à partir des
données (`voyage, lieux, resas, blocs, meteo`), avec un drapeau `lectureSeule` qui retire actions,
codes, prix et payeurs — le lot 3 les rappelle tels quels.

Retour depuis un sous-écran : `revenirALaFiche(section)` doit rouvrir le bon onglet.
Fichiers < 300 lignes chacun ; `ui-fiche-voyage.js` reste l'assembleur.

## Lot 3 — partager (dépend du lot 2)

- Migration `033_voyage_partages.sql` (**ne pas l'appliquer**) : `voyage_partages (jeton uuid pk
  default gen_random_uuid(), voyage_id → voyages cascade unique, cree_par text, cree_le
  timestamptz default now())`, RLS `est_membre()`. Fonction
  `public.voyage_partage(p_jeton uuid) returns jsonb`, `security definer`, `set search_path =
  public`, `stable` : renvoie `{ voyage: {titre, lieu, debut, fin}, lieux: [...], resas: [...],
  blocs: [...] }` ou `null` si jeton inconnu. Lieux : id, nom, categorie, statut, jour, ordre,
  lat, lng, lien, topo, horaires (**pas** note, adresse, photo). Résas : id, type, titre, debut,
  fin, statut, lieu_id (**jamais** code, prix, payé par, prestataire, note, poste). Blocs : type,
  titre, texte, ordre. Ni todos, ni enveloppes, ni pièces. `revoke all … from public;
  grant execute … to anon, authenticated`.
- `frontend/partage.html` + `frontend/partage.js` : page publique, aucune connexion. Lit `?j=`,
  appelle la RPC avec la clé publishable de `config.js`, rend en lecture seule : en-tête +
  feuille de route + onglets Planning · Activités · Carte · Infos (pas d'À faire), météo
  comprise. Jeton inconnu : « Ce lien de partage n'est plus valable. »
  Vérifier que `sw.js` ne bloque pas cette page sans session.
- Dans la fiche (bandeau) : « Partager » crée le jeton s'il n'existe pas puis
  `navigator.share({ title, url })`, sinon copie le lien + toast « Lien copié ». Dans Infos :
  « Arrêter le partage » (confirmation, supprime le jeton : l'ancien lien ne marche plus) et
  « Télécharger la page » (un fichier `.html` autonome : CSS et données en ligne, Leaflet depuis
  cdnjs, mêmes données filtrées que la RPC).
- Recette connectée : un anonyme avec le bon jeton lit le voyage (sans code ni prix dans la
  réponse) ; un mauvais jeton → null ; un anonyme ne lit pas `voyage_partages` ; après « Arrêter »
  → null. Sur un voyage factice ou passé, jamais un voyage à venir (L-041).

## Interdits (tous les lots)

- Aucune vraie donnée (noms, prix, codes, coordonnées réelles) dans le code, les tests, les
  briefs (L-049). Les données réelles sont en base.
- Ne pas appliquer les migrations, ne pas commiter, ne pas pousser : le coordinateur le fait.
- Rien du Budget n'est touché.

## Portes

`node tests/test_planning.mjs`, `node tests/test_agenda.mjs`, `node tests/recette_ecrans.mjs`
(données factices enrichies : un voyage factice de 4 jours avec un lieu de chaque statut, une
résa logement sur 3 nuits, une résa sans lieu, des todos) puis **OUVRIR** les captures 360 et 320
de chaque onglet ; aucune largeur de page qui déborde. Lot 3 : `node tests/recette_connectee.mjs`.
