// Logique du module Tâches : échéances, occurrences manquantes, points, balance. Aucun DOM,
// importable en Node pour les tests (même rôle que calc.js pour le budget).

export const FREQUENCES = {
  quotidien: "Chaque jour", hebdo: "Chaque semaine", mensuel: "Chaque mois", au_besoin: "Au besoin",
};
// `PENIBILITES`, `IMPORTANCES` et `pts()` ont disparu avec le barème qu'ils servaient (D-027) :
// plus aucun appelant. Les colonnes `penibilite` et `importance` restent en base le temps de
// valider les parts à l'usage, mais rien ne les lit — ne pas les réintroduire ici.

// Échelle non linéaire choisie à la main (0,5 · 1 · 2 · 3 · 5 · 8), stockée en quarts de part —
// entiers, comme les centimes pour l'argent : le quart permet de diviser exactement un 0,5 fait
// à deux. Remplace la pénibilité 1-5 et son plancher à 1 point (D-022, désormais caduc).
export const ECHELLE_QUART = [2, 4, 8, 12, 20, 32];
/** « 0,5 » « 1,5 » « 8 » — virgule française, pas de zéro inutile. */
export const partsTexte = (q) => String(q / 4).replace(".", ",");
/** « 1 part » / « 2 parts » — un seul endroit, l'accord se fait ici (remplace pts() pour les parts). */
// Pluriel à partir de 2 (8 quarts), pas de 1 : en français « 1,5 part » reste au singulier.
export const parts = (q) => `${partsTexte(q)} part${q >= 8 ? "s" : ""}`;

const deux = (n) => String(n).padStart(2, "0");
/** Date locale au format AAAA-MM-JJ (jamais toISOString : décalage UTC le soir). */
export const jourIso = (d) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
export const depuisIso = (s) => { const [a, m, j] = s.split("-").map(Number); return new Date(a, m - 1, j); };
export const decalerJours = (iso, n) => { const d = depuisIso(iso); d.setDate(d.getDate() + n); return jourIso(d); };

/** Fin de la période contenant `jour` : le jour, le dimanche, le dernier du mois. Null au besoin. */
export function echeance(frequence, jour) {
  if (frequence === "quotidien") return jour;
  if (frequence === "hebdo") {
    const d = depuisIso(jour);
    return decalerJours(jour, (7 - d.getDay()) % 7);
  }
  if (frequence === "mensuel") {
    const d = depuisIso(jour);
    return jourIso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }
  return null;
}

/** Occurrences à créer pour `jour` : celles des récurrents actifs qui manquent en base. */
export function occurrencesManquantes(recurrents, existantes, jour) {
  const dejaLa = new Set(existantes.filter((t) => t.recurrent_id)
    .map((t) => `${t.recurrent_id}|${t.echeance}|${t.rang}`));
  const out = [];
  for (const r of recurrents) {
    if (!r.actif) continue;
    const e = echeance(r.frequence, jour);
    if (!e) continue;
    for (let rang = 1; rang <= (r.fois ?? 1); rang++) {
      if (dejaLa.has(`${r.id}|${e}|${rang}`)) continue;
      out.push({ recurrent_id: r.id, titre: r.titre, categorie: r.categorie, echeance: e, rang,
        qui: r.attribue_a ?? null, points: 0 });
    }
  }
  return out;
}

/** Occurrences non faites dont la période est finie depuis plus d'un jour : à purger, on ne
 *  rattrape pas un biberon d'avant-hier. Celles d'hier restent visibles « en retard ». */
export const perimees = (taches, jour) =>
  taches.filter((t) => !t.fait_le && t.recurrent_id && t.echeance < decalerJours(jour, -1));

/** Parts d'une tâche pour la personne qui la fait (en quarts). `qui` : prénom ou null.
 *  L'écart ajoute un cran à la personne désignée par `ecart_prenom`, plafonné en haut
 *  de l'échelle — amener Max coûte un cran de plus à Claudia, jamais plus que 8. */
export function partsDe(recurrent, qui) {
  const base = recurrent.parts_quart;
  if (!qui || !recurrent.ecart_prenom || recurrent.ecart_prenom !== qui) return base;
  const i = ECHELLE_QUART.indexOf(base);
  return ECHELLE_QUART[Math.min(ECHELLE_QUART.length - 1, i + 1)] ?? base;
}

/** Crédit de parts d'une occurrence cochée : { Yann: q, Claudia: q } en quarts.
 *  Fait à deux, on divise la base (jamais l'écart, sinon tout faire à deux devient la
 *  stratégie gagnante) ; non cochée (`qui` null), aucun crédit. */
export function creditDe(recurrent, tache) {
  const out = {};
  if (tache.qui2) {
    const moitie = recurrent.parts_quart / 2;      // exact : quarts, base toujours paire
    out[tache.qui] = moitie;
    out[tache.qui2] = moitie;
  } else if (tache.qui) {
    out[tache.qui] = partsDe(recurrent, tache.qui);
  }
  return out;
}

/** Groupe d'affichage d'une tâche non faite, relativement à `jour`. */
export function groupe(tache, jour) {
  if (tache.echeance < jour) return "retard";
  if (tache.echeance === jour) return "aujourdhui";
  if (tache.echeance <= echeance("hebdo", jour)) return "semaine";
  return "mois";
}
export const GROUPES = [["retard", "En retard"], ["aujourdhui", "Aujourd’hui"],
  ["semaine", "Cette semaine"], ["mois", "Ce mois"]];

/** Tri : une obligatoire non faite passe avant le reste, à cadence (échéance) égale, puis rang.
 *  `importance` n'est plus lu : obligatoire porte seul le tri (cf. logique-metier.md §3). */
export function trier(taches, recurrents) {
  const oblig = (t) => recurrents.find((r) => r.id === t.recurrent_id)?.obligatoire && !t.fait_le ? 1 : 0;
  return [...taches].sort((a, b) => a.echeance.localeCompare(b.echeance) || oblig(b) - oblig(a)
    || a.rang - b.rang || a.id - b.id);
}

/** Balance des parts (en quarts) sur [depuis, jusqu] inclus (ISO). Ratio par personne, détail
 *  par catégorie. Les crédits viennent de `creditDe()` : une occurrence faite à deux crédite les
 *  deux personnes. `obligatoireSeul` restreint aux tâches dont le récurrent est obligatoire —
 *  c'est le KPI hebdomadaire de la vue Semaine, jamais un second système de points. */
export function balance(taches, recurrents, membres, depuis, jusqu, { obligatoireSeul = false } = {}) {
  const parts = Object.fromEntries(membres.map((p) => [p, 0]));
  const nombre = Object.fromEntries(membres.map((p) => [p, 0]));
  const parCategorie = {};
  for (const t of taches) {
    if (!t.fait_le) continue;
    const j = jourIso(new Date(t.fait_le));
    if (j < depuis || j > jusqu) continue;
    const recurrent = recurrents.find((r) => r.id === t.recurrent_id);
    if (obligatoireSeul && !recurrent?.obligatoire) continue;
    // Base figée à la coche (taches.parts_quart), jamais recalculée depuis le récurrent courant :
    // changer le barème plus tard ne doit pas réécrire la balance d'une semaine déjà passée.
    const credit = creditDe({ parts_quart: t.parts_quart }, t);
    for (const [qui, q] of Object.entries(credit)) {
      if (!(qui in parts)) continue;
      parts[qui] += q;
      // `nombre` compte les PARTICIPATIONS, pas les tâches : une tâche faite à deux vaut
      // 1 pour chacun (« j'y étais »), donc la somme des `nombre` dépasse le nombre de
      // tâches faites. C'est ce qu'on veut afficher par personne ; ne jamais s'en servir
      // comme total de tâches du foyer.
      nombre[qui] += 1;
      parCategorie[t.categorie] ??= Object.fromEntries(membres.map((p) => [p, 0]));
      parCategorie[t.categorie][qui] += q;
    }
  }
  const total = Object.values(parts).reduce((s, n) => s + n, 0);
  const ratio = Object.fromEntries(membres.map((p) => [p, total ? parts[p] / total : 1 / membres.length]));
  return { parts, nombre, total, ratio, parCategorie };
}
