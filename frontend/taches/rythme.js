// Le temps et le rythme d'une tâche (D-041) : 1 part = 5 minutes, créneaux de la journée,
// étapes, variantes. Pur, sans DOM, importable en Node ; miroir Python dans
// scripts/bot/taches.py, confronté par tests/bot/test_taches.py (L-014).

// Recopié de taches.js plutôt qu'importé : taches.js importe ce fichier, pas de cycle.
const depuisIso = (s) => { const [a, m, j] = s.split("-").map(Number); return new Date(a, m - 1, j); };

/** Créneaux d'une tâche quotidienne, dans l'ordre de la journée. */
export const MOMENTS = [["matin", "Matin"], ["midi", "Midi"], ["soir", "Soir"], ["nuit", "Nuit"]];
/** Jours d'un créneau : tous, en semaine (lundi → vendredi), le week-end. */
export const JOURS = [["tous", "tous les jours"], ["semaine", "en semaine"], ["we", "le week-end"]];

/** Temps proposés à la saisie, en minutes : 2 veut dire « moins de 3′ ». Multiples de 5
 *  ensuite, parce qu'une part vaut 5 minutes : on estime en parts sans le dire. */
export const TEMPS = [2, 5, 10, 15, 20, 25, 30, 40, 45, 60, 90, 120];
export const MOINS_DE_3 = 2;

/** Parts (en quarts) d'un temps en minutes : 0,5 part sous 3 minutes, sinon 1 part par
 *  tranche de 5 minutes, arrondie au quart. Null si aucun temps. */
export function quartsDesMinutes(minutes) {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 3) return 2;
  return Math.round((minutes * 4) / 5);
}
/** « <3′ », « 15′ ». */
export const texteTemps = (minutes) => (!minutes ? "—" : minutes < 3 ? "<3′" : `${minutes}′`);

export const estWeekEnd = (jourIsoTexte) => [0, 6].includes(depuisIso(jourIsoTexte).getDay());
/** Le créneau a-t-il lieu ce jour-là ? */
export function creneauDuJour(creneau, jourIsoTexte) {
  if (creneau.jours === "semaine") return !estWeekEnd(jourIsoTexte);
  if (creneau.jours === "we") return estWeekEnd(jourIsoTexte);
  return true;
}

/** Le récurrent qui porte le rythme : le parent pour une étape, sinon lui-même. */
export const porteurRythme = (r, recurrents) =>
  (r.parent_id ? recurrents.find((p) => p.id === r.parent_id) ?? r : r);
/** Ids des récurrents actifs qui ont au moins une étape active : ils ne créent rien eux-mêmes. */
export const idsParents = (recurrents) =>
  new Set(recurrents.filter((r) => r.actif && r.parent_id).map((r) => r.parent_id));
export const etapesDe = (parent, recurrents) =>
  recurrents.filter((r) => r.actif && r.parent_id === parent.id).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.id - b.id);

/** Rangs (1..n) et moment des occurrences qu'un récurrent doit avoir ce jour-là. Rang i =
 *  créneau i de la liste complète, jamais renuméroté : le midi du week-end garde son rang 2
 *  même quand il n'a pas lieu, l'index unique (récurrent, échéance, rang) reste stable. */
export function rangsDuJour(r, porteur, jourIsoTexte) {
  if (porteur.frequence === "quotidien" && porteur.creneaux?.length) {
    return porteur.creneaux.map((c, i) => ({ rang: i + 1, moment: c.moment, c }))
      .filter(({ c }) => creneauDuJour(c, jourIsoTexte)).map(({ rang, moment }) => ({ rang, moment }));
  }
  const n = porteur.fois ?? 1;
  return Array.from({ length: n }, (_, i) => ({ rang: i + 1, moment: porteur.moment ?? null }));
}

/** « matin · midi w-e · soir », « matin en sem. », « 3×/sem. », « au besoin ». */
export function texteQuand(porteur) {
  if (porteur.frequence === "au_besoin") return "au besoin";
  if (porteur.frequence === "quotidien" && porteur.creneaux?.length) {
    const jours = { tous: "", semaine: " sem.", we: " w-e" };
    return porteur.creneaux.map((c) => `${c.moment}${jours[c.jours] ?? ""}`).join(" · ");
  }
  const periode = { quotidien: "j", hebdo: "sem.", mensuel: "mois" }[porteur.frequence];
  return `${porteur.fois ?? 1}×/${periode}`;
}

/** Variante retenue par défaut à la coche : la première. */
export const varianteParDefaut = (r) => r?.variantes?.[0]?.nom ?? null;
