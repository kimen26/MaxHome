// Règles PURES de « Garder le lien » : libellés lisibles (rythme, ancienneté, anniversaire),
// validation des formulaires, tri des échanges. Sans DOM ni réseau — testé dans tests/test_proches.mjs.
// Le calcul de QUI relancer et des anniversaires vit dans relances.js (partagé avec le bot).

export const PRENOM_MAX = 60;
export const NOTE_MAX = 500;
export const TEXTE_MAX = 500;
export const QUI = [["nous", "Nous deux"], ["Yann", "Yann"], ["Claudia", "Claudia"]];

// [jours, libellé long (formulaire, feuille), libellé court (« rythme : mois »)]
const RYTHMES = [
  [7, "chaque semaine", "semaine"], [14, "toutes les 2 semaines", "2 semaines"], [30, "chaque mois", "mois"],
  [60, "tous les 2 mois", "2 mois"], [90, "chaque trimestre", "trimestre"], [180, "tous les 6 mois", "6 mois"],
];
export const RYTHMES_OPTIONS = [...RYTHMES.map(([j, l]) => [j, l]), ["", "pas de relance"]];
const trouver = (j) => RYTHMES.find(([v]) => v === j);

export const libelleRythme = (j) => (j == null ? "pas de relance" : (trouver(j)?.[1] ?? `tous les ${j} jours`));
const rythmeCourt = (j) => trouver(j)?.[2] ?? `${j} jours`;

/** Durée en mots courts : « 5 j », « 6 sem. », « 3 mois ». */
export function duree(jours) {
  if (jours < 14) return `${jours} j`;
  if (jours < 60) return `${Math.floor(jours / 7)} sem.`;
  return `${Math.round(jours / 30.4)} mois`;
}

/** « 6 sem. sans nouvelles · rythme : mois » (proche à relancer). */
export const texteRelance = (r, rythmeJours) => `${duree(r.depuisJours)} sans nouvelles · rythme : ${rythmeCourt(rythmeJours)}`;

/** « dernier échange il y a 5 j » (proche à jour). */
export function texteDernier(depuisJours) {
  if (depuisJours <= 0) return "dernier échange aujourd'hui";
  if (depuisJours === 1) return "dernier échange hier";
  return `dernier échange il y a ${duree(depuisJours)}`;
}

/** « Léa a 40 ans dans 3 jours » ; sans année connue : « Anniversaire de Léa dans 3 jours ». */
export function texteAnniversaire(a, prenom) {
  const quand = a.dansJours === 0 ? "aujourd'hui" : a.dansJours === 1 ? "demain" : `dans ${a.dansJours} jours`;
  return a.age == null ? `Anniversaire de ${prenom} ${quand}` : `${prenom} a ${a.age} an${a.age > 1 ? "s" : ""} ${quand}`;
}

/** Anniversaire saisi, en toutes lettres : « 12 mars 1984 » ou « 12 mars ». */
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const MOIS_OPTIONS = MOIS.map((m, i) => [i + 1, m]);
export const texteDate = (p) => (p.anniv_jour ? `${p.anniv_jour === 1 ? "1er" : p.anniv_jour} ${MOIS[p.anniv_mois - 1]}${p.anniv_annee ? ` ${p.anniv_annee}` : ""}` : "");

const jourIsoValide = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Échanges d'un proche, le plus récent en tête (à égalité de date, le dernier noté d'abord). */
export const echangesDe = (echanges, procheId) => echanges.filter((e) => e.proche_id === procheId)
  .sort((a, b) => b.le.localeCompare(a.le) || b.id - a.id);

/** Dernier échange d'un proche : { le, texte } ou null. */
export const dernierEchange = (echanges, procheId) => echangesDe(echanges, procheId)[0] ?? null;

const entier = (v) => (v == null || v === "" ? null : Number(v));

/** Colonnes de `proches` à écrire ; lève une erreur lisible si le formulaire est invalide.
 *  `existants` : les autres proches (prénom unique sans casse), `annee` : année en cours. */
export function champsProche(lu, existants, annee) {
  const prenom = String(lu.prenom ?? "").trim();
  if (!prenom) throw new Error("Donnez un prénom.");
  if (prenom.length > PRENOM_MAX) throw new Error(`Le prénom est trop long : ${PRENOM_MAX} caractères au plus.`);
  if (existants.some((p) => p.prenom.toLowerCase() === prenom.toLowerCase())) throw new Error(`${prenom} est déjà dans la liste.`);
  if (!QUI.some(([v]) => v === lu.qui)) throw new Error("Choisissez qui relance.");
  const rythme = entier(lu.rythme_jours);
  if (rythme != null && !(Number.isInteger(rythme) && rythme > 0)) throw new Error("Rythme invalide.");
  const [jour, mois, an] = [entier(lu.anniv_jour), entier(lu.anniv_mois), entier(lu.anniv_annee)];
  if ((jour == null) !== (mois == null)) throw new Error("Pour un anniversaire, donnez le jour ET le mois.");
  if (jour != null) {
    // L'année 2000 est bissextile : le 29 février reste accepté, quelle que soit l'année de naissance.
    if (!Number.isInteger(jour) || !Number.isInteger(mois) || mois < 1 || mois > 12 || jour < 1 || jour > new Date(2000, mois, 0).getDate()) {
      throw new Error("Cet anniversaire n'existe pas.");
    }
  } else if (an != null) throw new Error("L'année seule ne suffit pas : ajoutez le jour et le mois.");
  if (an != null && (!Number.isInteger(an) || an < 1900 || an > annee)) throw new Error(`L'année doit être entre 1900 et ${annee}.`);
  const note = String(lu.note ?? "").trim();
  if (note.length > NOTE_MAX) throw new Error(`La note est trop longue : ${NOTE_MAX} caractères au plus.`);
  return { prenom, qui: lu.qui, rythme_jours: rythme, anniv_jour: jour, anniv_mois: mois, anniv_annee: jour == null ? null : an, note: note || null };
}

/** Colonnes de `proche_echanges` à écrire ; lève une erreur lisible. `aujourdhui` : AAAA-MM-JJ. */
export function champsEchange({ texte, le }, procheId, par, aujourdhui) {
  const t = String(texte ?? "").trim();
  if (!t) throw new Error("Écrivez une phrase sur cet échange.");
  if (t.length > TEXTE_MAX) throw new Error(`C'est trop long : ${TEXTE_MAX} caractères au plus.`);
  const jour = le || aujourdhui;
  if (!jourIsoValide(jour)) throw new Error("La date de l'échange n'est pas valide.");
  if (jour > aujourdhui) throw new Error("Un échange ne peut pas être dans le futur.");
  return { proche_id: procheId, le: jour, texte: t, par: par ?? null };
}
