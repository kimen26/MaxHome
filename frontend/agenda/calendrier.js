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

/**
 * Événements qui touchent un mois, toutes sources confondues, triés par début puis par type
 * (vacances, voyage, férié). Chaque événement garde son type pour que l'affichage le nomme —
 * jamais la couleur seule (rules/mobile-parents.md).
 */
export function evenementsDuMois(annee, mois, { vacances = [], voyages = [], feries: fer = [] } = {}) {
  const bornes = bornesMois(annee, mois);
  const rang = { vacances: 0, voyage: 1, ferie: 2 };
  return [
    ...vacances.map((v) => ({ ...v, type: "vacances" })),
    ...voyages.map((v) => ({ ...v, type: "voyage" })),
    ...fer.map((f) => ({ ...f, type: "ferie" })),
  ]
    .filter((e) => e?.debut && e?.fin && chevauche(e, bornes))
    .sort((a, b) => a.debut.localeCompare(b.debut) || rang[a.type] - rang[b.type]);
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

/** « dans 12 j », « aujourd’hui », « en cours », « passé » — relatif à `auj`. */
export function relatif(periode, auj) {
  if (periode.fin < auj) return "passé";
  if (periode.debut <= auj) return periode.debut === auj ? "aujourd’hui" : "en cours";
  const n = nbJours(auj, periode.debut) - 1;
  return n === 1 ? "demain" : `dans ${n} j`;
}
