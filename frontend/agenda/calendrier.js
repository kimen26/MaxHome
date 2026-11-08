// Règles PURES du module Agenda : jours fériés, grille d'un mois, périodes qui couvrent un
// jour, événements d'un mois, prochaines périodes. Sans DOM ni réseau — testé dans
// tests/test_agenda.mjs. Les dates sont des chaînes AAAA-MM-JJ locales (L-004 : jamais
// toISOString(), qui bascule au lendemain passé 22h en été).

export const jourIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** AAAA-MM-JJ → Date locale à minuit (jamais `new Date("AAAA-MM-JJ")`, qui lit en UTC). */
export function depuisIso(iso) {
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(a, m - 1, j);
}

export function decalerJours(iso, n) {
  const d = depuisIso(iso);
  d.setDate(d.getDate() + n);
  return jourIso(d);
}

/** Nombre de jours d'une période inclusive (« du 17 au 25 » = 9 jours). */
export const nbJours = (debut, fin) => Math.round((depuisIso(fin) - depuisIso(debut)) / 86400000) + 1;

/** Dimanche de Pâques (algorithme de Meeus/Jones/Butcher, calendrier grégorien). */
export function paques(annee) {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  return jourIso(new Date(annee, mois - 1, jour));
}

/** Les 11 jours fériés de France métropolitaine, triés. `{ debut, fin, titre, type: "ferie" }`. */
export function feries(annee) {
  const p = paques(annee);
  const fixe = (m, j, titre) => [`${annee}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`, titre];
  const liste = [
    fixe(1, 1, "Jour de l’an"),
    [decalerJours(p, 1), "Lundi de Pâques"],
    fixe(5, 1, "Fête du Travail"),
    fixe(5, 8, "Victoire 1945"),
    [decalerJours(p, 39), "Ascension"],
    [decalerJours(p, 50), "Lundi de Pentecôte"],
    fixe(7, 14, "Fête nationale"),
    fixe(8, 15, "Assomption"),
    fixe(11, 1, "Toussaint"),
    fixe(11, 11, "Armistice 1918"),
    fixe(12, 25, "Noël"),
  ];
  return liste
    .map(([iso, titre]) => ({ debut: iso, fin: iso, titre, type: "ferie" }))
    .sort((x, y) => x.debut.localeCompare(y.debut));
}

/** Une période inclusive `{ debut, fin }` couvre-t-elle ce jour ? */
export const couvre = (periode, iso) => periode.debut <= iso && iso <= periode.fin;

/** Deux périodes inclusives se chevauchent-elles ? */
export const chevauche = (a, b) => a.debut <= b.fin && b.debut <= a.fin;

/**
 * Grille d'un mois : semaines complètes du lundi au dimanche, les jours hors du mois marqués
 * `dansMois: false` (ils s'affichent en gris, ils ne portent aucun événement).
 */
export function grilleMois(annee, mois) {
  const premier = new Date(annee, mois - 1, 1);
  const decalage = (premier.getDay() + 6) % 7; // lundi = 0
  const debut = new Date(annee, mois - 1, 1 - decalage);
  const semaines = [];
  for (let s = 0; s < 6; s++) {
    const semaine = [];
    for (let j = 0; j < 7; j++) {
      const d = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + s * 7 + j);
      semaine.push({ iso: jourIso(d), jour: d.getDate(), dansMois: d.getMonth() === mois - 1 });
    }
    // Une semaine sans aucun jour du mois ne s'affiche pas (février commençant un lundi :
    // quatre semaines ; la plupart des mois : cinq ; six au plus).
    if (!semaine.some((c) => c.dansMois)) break;
    semaines.push(semaine);
  }
  return semaines;
}

/** Premier et dernier jour d'un mois, en ISO. */
export function bornesMois(annee, mois) {
  return { debut: jourIso(new Date(annee, mois - 1, 1)), fin: jourIso(new Date(annee, mois, 0)) };
}

const PERSONNES = ["Max", "Yann", "Claudia"];
export const FAMILLE = "Famille";
/** Les quatre « personnes » du tableau blanc du foyer, dans l'ordre d'affichage des pastilles. */
export const QUI = [...PERSONNES, FAMILLE];

const sansAccent = (t) => String(t ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * Mots qui gardent un événement hors des pastilles de la grille : il reste dans la liste sous la
 * grille. Comparés sans accent ni casse (« Télétravail », « TELETRAVAIL »).
 */
export const MOTS_SANS_PASTILLE = ["télétravail"];

/** Le titre contient-il un mot de MOTS_SANS_PASTILLE ? */
export const sansPastille = (titre) => {
  const texte = sansAccent(titre);
  return MOTS_SANS_PASTILLE.some((mot) => texte.includes(sansAccent(mot)));
};

/**
 * Qui concerne un événement du foyer. La personne choisie dans l'app (`personne`, posée à la
 * création) l'emporte ; sinon le prénom (Max, Yann, Claudia — mot entier, sans casse) qui
 * apparaît LE PLUS TÔT dans le titre ; aucun prénom : « Famille ».
 * « Max avec Yann » → Max ; « Parc Astérix en famille » → Famille.
 */
export function personneDe(titre, personne = null) {
  if (QUI.includes(personne)) return personne;
  const texte = String(titre ?? "");
  let meilleur = { qui: FAMILLE, pos: Infinity };
  for (const qui of PERSONNES) {
    const m = new RegExp(`(^|[^\\p{L}\\p{N}_])(${qui})(?![\\p{L}\\p{N}_])`, "iu").exec(texte);
    const pos = m ? m.index + m[1].length : Infinity;
    if (pos < meilleur.pos) meilleur = { qui, pos };
  }
  return meilleur.qui;
}

const RANG_TYPE = { vacances: 0, voyage: 1, ferie: 2, foyer: 3 };

/** Tri à l'intérieur d'une journée : type (vacances, voyage, férié, foyer), puis journée entière
 *  avant les événements horaires, puis par heure de début. */
const comparerDansJour = (a, b) =>
  RANG_TYPE[a.type] - RANG_TYPE[b.type] || (a.heureDebut ?? "").localeCompare(b.heureDebut ?? "");

/** Tri d'un mois : par jour de début, puis comme dans une journée. */
export const comparerEvenements = (a, b) => a.debut.localeCompare(b.debut) || comparerDansJour(a, b);

/**
 * Doublon : un événement Google « férié » en journée entière qui tombe sur un férié calculé est
 * retiré — le férié de l'app s'affiche à sa place.
 */
const estDoublonFerie = (e, fer) =>
  e.heureDebut == null && sansAccent(e.titre).includes("ferie") && fer.some((f) => couvre(e, f.debut));

/**
 * Événements qui touchent un mois, toutes sources confondues, triés par début puis par type
 * (vacances, voyage, férié, foyer = agenda Google). Chaque événement garde son type pour que
 * l'affichage le nomme — jamais la couleur seule (rules/mobile-parents.md). Les événements
 * Google gardent leur `heureDebut` et reçoivent `qui` (personneDe) et `sansPastille`.
 */
export function evenementsDuMois(annee, mois, { vacances = [], voyages = [], feries: fer = [], google = [] } = {}) {
  const bornes = bornesMois(annee, mois);
  const doublons = (e) => estDoublonFerie(e, fer);
  return [
    ...vacances.map((v) => ({ ...v, type: "vacances" })),
    ...voyages.map((v) => ({ ...v, type: "voyage" })),
    ...fer.map((f) => ({ ...f, type: "ferie" })),
    ...google.filter((g) => g && !doublons(g)).map((g) => ({
      ...g, type: "foyer", qui: personneDe(g.titre, g.personne), sansPastille: sansPastille(g.titre),
    })),
  ]
    .filter((e) => e?.debut && e?.fin && chevauche(e, bornes))
    .sort(comparerEvenements);
}

/** Événements (déjà triés) qui couvrent un jour. */
export const evenementsDuJour = (evenements, iso) => evenements.filter((e) => couvre(e, iso));

/** Personnes présentes un jour (événements du foyer), dans l'ordre de QUI, sans doublon. Un événement
 *  « sans pastille » (télétravail) ne compte pas : il reste dans la liste, pas dans les cases. */
export function personnesDuJour(evenements, iso) {
  const presentes = new Set(evenementsDuJour(evenements, iso)
    .filter((e) => e.type === "foyer" && !e.sansPastille).map((e) => e.qui));
  return QUI.filter((q) => presentes.has(q));
}

/**
 * Regroupement par jour pour la liste : `[{ iso, evenements }]` dans l'ordre. Un événement sur
 * plusieurs jours apparaît une seule fois, à son premier jour dans le mois.
 */
export function joursDuMois(evenements, annee, mois) {
  const bornes = bornesMois(annee, mois);
  const parJour = new Map();
  for (const e of evenements) {
    if (!chevauche(e, bornes)) continue;
    const iso = e.debut < bornes.debut ? bornes.debut : e.debut;
    parJour.set(iso, [...(parJour.get(iso) ?? []), e]);
  }
  return [...parJour.keys()].sort().map((iso) => ({ iso, evenements: parJour.get(iso).sort(comparerDansJour) }));
}

/** Périodes pas encore terminées à la date donnée, triées par début, `n` au plus. */
export function prochaines(periodes, auj, n = Infinity) {
  return periodes
    .filter((p) => p?.fin && p.fin >= auj)
    .sort((a, b) => a.debut.localeCompare(b.debut))
    .slice(0, n);
}

const FORMAT_COURT = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const FORMAT_LONG = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** « sam. 17 oct. → dim. 25 oct. » ; un seul jour : « sam. 17 oct. » ; avec l'année si demandée. */
export function formatPeriode(debut, fin, { annee = false } = {}) {
  const f = annee ? FORMAT_LONG : FORMAT_COURT;
  if (debut === fin) return f.format(depuisIso(debut));
  return `${FORMAT_COURT.format(depuisIso(debut))} → ${f.format(depuisIso(fin))}`;
}

/** « 10:40 » → « 10h40 » (heure déjà à l'heure de Paris, voir l'Edge Function agenda-google). */
export const formatHeure = (hhmm) => String(hhmm).replace(":", "h");

/** « dans 12 j »,« aujourd’hui », « en cours », « passé » — relatif à `auj`. */
export function relatif(periode, auj) {
  if (periode.fin < auj) return "passé";
  if (periode.debut <= auj) return periode.debut === auj ? "aujourd’hui" : "en cours";
  const n = nbJours(auj, periode.debut) - 1;
  return n === 1 ? "demain" : `dans ${n} j`;
}
