// Logique du module Tâches : échéances, occurrences manquantes, points, balance. Aucun DOM,
// importable en Node pour les tests (même rôle que calc.js pour le budget).

export const FREQUENCES = {
  quotidien: "Chaque jour", hebdo: "Chaque semaine", mensuel: "Chaque mois", au_besoin: "Au besoin",
};
export const PENIBILITES = ["", "Très facile", "Facile", "Moyenne", "Pénible", "Très pénible"];
export const IMPORTANCES = ["", "Peut attendre", "À faire", "Le jour même"];

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

/** Points d'une tâche : sa pénibilité (l'importance trie, elle ne rapporte pas). */
export const pointsDe = (recurrent, tache) => recurrent?.penibilite ?? tache?.points ?? 1;

/** Groupe d'affichage d'une tâche non faite, relativement à `jour`. */
export function groupe(tache, jour) {
  if (tache.echeance < jour) return "retard";
  if (tache.echeance === jour) return "aujourdhui";
  if (tache.echeance <= echeance("hebdo", jour)) return "semaine";
  return "mois";
}
export const GROUPES = [["retard", "En retard"], ["aujourdhui", "Aujourd’hui"],
  ["semaine", "Cette semaine"], ["mois", "Ce mois"]];

/** Tri : importance décroissante, puis échéance, puis rang. */
export function trier(taches, recurrents) {
  const imp = (t) => recurrents.find((r) => r.id === t.recurrent_id)?.importance ?? 2;
  return [...taches].sort((a, b) => imp(b) - imp(a) || a.echeance.localeCompare(b.echeance)
    || a.rang - b.rang || a.id - b.id);
}

/** Balance des points sur [depuis, jusqu] inclus (ISO). Ratio par personne, détail par catégorie. */
export function balance(taches, membres, depuis, jusqu) {
  const points = Object.fromEntries(membres.map((p) => [p, 0]));
  const nombre = Object.fromEntries(membres.map((p) => [p, 0]));
  const parCategorie = {};
  for (const t of taches) {
    if (!t.fait_le || !t.qui || !(t.qui in points)) continue;
    const j = jourIso(new Date(t.fait_le));
    if (j < depuis || j > jusqu) continue;
    points[t.qui] += t.points;
    nombre[t.qui] += 1;
    parCategorie[t.categorie] ??= Object.fromEntries(membres.map((p) => [p, 0]));
    parCategorie[t.categorie][t.qui] += t.points;
  }
  const total = Object.values(points).reduce((s, n) => s + n, 0);
  const ratio = Object.fromEntries(membres.map((p) => [p, total ? points[p] / total : 1 / membres.length]));
  return { points, nombre, total, ratio, parCategorie };
}
