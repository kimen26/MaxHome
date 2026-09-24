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
// Arrondi au centième : une part « au tiers » (fait à deux, D-038) donne 0,67, jamais 0,6666….
export const partsTexte = (q) => String(Math.round((q / 4) * 100) / 100).replace(".", ",");
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
 *  « Part équiv » (`parts_spe` null) : `parts_quart` pour tout le monde. « Part spé » :
 *  `parts_spe` donne les parts de chacun ({"Claudia": 12, "Yann": 8}) — déposer le petit ne
 *  coûte pas pareil aux deux (D-038, remplace l'écart d'un cran). Sans récurrent (tâche
 *  ponctuelle), aucune base à lire : 0, jamais une exception qui casserait l'écran. */
export function partsDe(recurrent, qui) {
  if (!recurrent) return 0;
  const spe = recurrent.parts_spe;
  if (qui && spe && Number.isInteger(spe[qui])) return spe[qui];
  return recurrent.parts_quart;
}

/** Tiers retenu d'une part pleine quand on a fait à deux : 1, 2 ou 3 (plein). Pas de micro
 *  réglage (D-038). */
export const TIERS = [[3, "Plein"], [2, "⅔"], [1, "⅓"]];
const auTiers = (q, tiers) => (tiers == null || tiers === 3 ? q : (q * tiers) / 3);

/** Crédit de parts d'une occurrence cochée : { Yann: q, Claudia: q } en quarts.
 *  `recurrent.parts_quart` est la base FIGÉE de `qui` (l'appelant passe celle de l'occurrence).
 *  Fait à deux (D-038) : chacun ses parts pleines (`parts_quart`, `parts_quart2`), réduites au
 *  tiers retenu (`tiers`, `tiers2`) — faire à deux n'enlève rien à personne. Une occurrence à
 *  deux d'avant 017 (`parts_quart2` absent) garde l'ancienne règle : base divisée en deux.
 *  Non cochée (`qui` null), aucun crédit. */
export function creditDe(recurrent, tache) {
  const out = {};
  if (!tache.qui) return out;
  if (tache.qui2) {
    if (tache.parts_quart2 == null) {
      const moitie = recurrent.parts_quart / 2;
      out[tache.qui] = moitie;
      out[tache.qui2] = moitie;
      return out;
    }
    out[tache.qui] = auTiers(recurrent.parts_quart, tache.tiers);
    out[tache.qui2] = auTiers(tache.parts_quart2, tache.tiers2);
    return out;
  }
  out[tache.qui] = partsDe(recurrent, tache.qui);
  return out;
}

/** Champs d'une occurrence cochée « à deux » : les parts pleines de chacun, figées maintenant,
 *  au plein par défaut (on ajuste ensuite au tiers dans le détail). */
export function champsADeux(recurrent, p1, p2, base = null) {
  const q = (p) => (recurrent ? partsDe(recurrent, p) : base ?? 0);
  return { qui: p1, qui2: p2, parts_quart: q(p1), parts_quart2: q(p2), tiers: 3, tiers2: 3 };
}
/** Champs d'une occurrence décochée (ou cochée par une seule personne) : plus de trace d'un
 *  partage. */
export const CHAMPS_SEUL = { qui2: null, parts_quart2: null, tiers: 3, tiers2: null };

/** Méta « ajouté … » de la feuille Todo (§8 du handoff, bug 6) : « ajouté aujourd'hui »,
 *  « ajouté hier », ou « ajouté il y a N j », suivi de « · M min » quand la tâche porte des
 *  minutes indicatives (le repère de durée déjà stocké sur le récurrent, cf. logique-metier.md
 *  §1 — jamais un calcul sur l'écart de temps, qui n'aurait aucun sens ici). `maintenant` est un
 *  paramètre explicite (pas `new Date()` interne) pour rester testable sans horloge système
 *  (L-004), comme jourIso/libelleRelatif. */
export function libelleAjoutTodo(creeLeIso, minutes, maintenant) {
  const jourCreation = jourIso(new Date(creeLeIso));
  const jourMaintenant = jourIso(maintenant);
  const ecartJours = Math.round((depuisIso(jourMaintenant) - depuisIso(jourCreation)) / 86400000);
  const quand = ecartJours <= 0 ? "ajouté aujourd’hui" : ecartJours === 1 ? "ajouté hier" : `ajouté il y a ${ecartJours} j`;
  return minutes ? `${quand} · ${minutes} min` : quand;
}

/** Préfixe relatif du jour affiché par rapport à aujourd'hui (maquette écran Jour, D-036) :
 *  « aujourd'hui · », « hier · », « il y a N j · », « demain · », « dans N j · ». Pur (deux
 *  ISO en entrée), pour rester testable sans horloge système (L-004). */
export function libelleRelatif(jourAffiche, aujourdhui) {
  const ecart = Math.round((depuisIso(jourAffiche) - depuisIso(aujourdhui)) / 86400000);
  if (ecart === 0) return "aujourd’hui · ";
  if (ecart === -1) return "hier · ";
  if (ecart < -1) return `il y a ${-ecart} j · `;
  if (ecart === 1) return "demain · ";
  return `dans ${ecart} j · `;
}

/** Dernière occurrence FAITE d'un récurrent, cherchée dans l'historique chargé (`taches`,
 *  `JOURS_HISTORIQUE` jours) — jamais au-delà, on ne prétend pas savoir ce qu'on n'a pas
 *  chargé. Renvoie `{ jour, texte }` (jour ISO de la coche, date `jj/mm` fr. sans année) ou
 *  `null` si aucune trouvée : c'est à l'appelant de dire « +3 mois » dans ce cas
 *  (avancementPeriode ci-dessous), jamais « jamais » — on ne sait pas, on ne l'affirme pas
 *  (brief §« ce que le modèle ne portait pas »). */
export function dernierPassage(taches, recurrentId) {
  const faites = taches.filter((t) => t.recurrent_id === recurrentId && t.fait_le)
    .sort((a, b) => b.fait_le.localeCompare(a.fait_le));
  if (!faites.length) return null;
  const jour = jourIso(new Date(faites[0].fait_le));
  const d = depuisIso(jour);
  return { jour, texte: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` };
}

/** Avancement d'une tâche récurrente hebdo/mensuelle sur la période affichée : colonne de
 *  droite d'une ligne dans les cartes Semaine/Mois (handoff écran Jour). `faites`/`prevues`
 *  comptent les OCCURRENCES de la période (fois > 1 : « 2/3 »). Complet → vert, jour de la
 *  dernière coche (« auj. » si c'est le jour sélectionné, sinon l'abrégé fr. du jour de
 *  semaine) ; pour une mensuelle non faite, la date du dernier passage connu (`dernierPassage`,
 *  passé en `passe`) ou « +3 mois » si aucun ; pour une hebdo non faite sans occurrence
 *  antérieure, « — » (rien à affirmer). */
export function avancementPeriode({ faites, prevues, jourDerniereCoche, jourSel, frequence, passe }) {
  if (faites >= prevues && prevues > 0) {
    const texte = jourDerniereCoche === jourSel ? "auj." : depuisIso(jourDerniereCoche)
      .toLocaleDateString("fr-FR", { weekday: "short" }).replace(/\.?$/, ".");
    return { texte, classe: "vert" };
  }
  if (faites > 0) return { texte: `${faites}/${prevues}`, classe: "ambre" };
  if (frequence === "mensuel") return { texte: passe?.texte ?? "+3 mois", classe: "" };
  return { texte: "—", classe: "" };
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
