// Règles PURES du carnet de voyage : regroupement des lieux, totaux des réservations,
// catégories/types affichés, décompte avant départ. Sans DOM ni réseau — testé dans
// tests/test_agenda.mjs (D-045).

/** Catégorie d'un lieu : valeur en base, libellé FR, couleur hexa contrastée (≥ 4.5:1 sur
 *  blanc) — la couleur ne porte jamais seule le sens, toujours accompagnée du libellé. */
export const CATEGORIES_LIEU = [
  { valeur: "a_voir", libelle: "À voir", couleur: "#1d6f42" },
  { valeur: "activite", libelle: "Activité", couleur: "#b34700" },
  { valeur: "logement", libelle: "Logement", couleur: "#5b3e96" },
  { valeur: "resto", libelle: "Resto", couleur: "#a4133c" },
  { valeur: "transport", libelle: "Transport", couleur: "#1d5b96" },
  { valeur: "autre", libelle: "Autre", couleur: "#495057" },
];

/** Type d'une réservation : valeur en base, libellé FR, emoji (jamais seul non plus, toujours
 *  avec le libellé). */
export const TYPES_RESA = [
  { valeur: "vol", libelle: "Vol", emoji: "✈️" },
  { valeur: "train", libelle: "Train", emoji: "🚆" },
  { valeur: "logement", libelle: "Logement", emoji: "🛏️" },
  { valeur: "voiture", libelle: "Voiture", emoji: "🚗" },
  { valeur: "activite", libelle: "Activité", emoji: "🎟️" },
  { valeur: "repas", libelle: "Repas", emoji: "🍽️" },
  { valeur: "autre", libelle: "Autre", emoji: "📌" },
];

/** Poste de budget : valeur en base, libellé FR (D-047 §V2). */
export const POSTES = [
  { valeur: "transport", libelle: "Transport", emoji: "✈️" },
  { valeur: "logement", libelle: "Logement", emoji: "🛏️" },
  { valeur: "activites", libelle: "Activités", emoji: "🎟️" },
  { valeur: "repas", libelle: "Repas", emoji: "🍽️" },
  { valeur: "sur_place", libelle: "Sur place", emoji: "🚕" },
  { valeur: "autre", libelle: "Autre", emoji: "📌" },
];

/** Type de bloc du carnet : valeur, libellé, emoji, couleurs (fond clair, bordure), texte
 *  ≥ 4.5:1 sur le fond — jamais la couleur seule (toujours accompagnée du mot). */
export const TYPES_BLOC = [
  { valeur: "resume", libelle: "Résumé", emoji: "📖", fond: "#eef2ff", bord: "#3730a3" },
  { valeur: "info", libelle: "Info", emoji: "ℹ️", fond: "#eff6ff", bord: "#1d4ed8" },
  { valeur: "astuce", libelle: "Astuce", emoji: "💡", fond: "#ecfdf5", bord: "#15803d" },
  { valeur: "attention", libelle: "Attention", emoji: "⚠️", fond: "#fff1f2", bord: "#b91c1c" },
];

/** Déduit le poste d'une résa depuis son type quand `poste` n'est pas renseigné (même règle
 *  que la migration 021 et `scripts/bot/voyages.py`). */
export function posteDe(resa) {
  if (resa.poste) return resa.poste;
  switch (resa.type) {
    case "vol": case "train": case "voiture": return "transport";
    case "logement": return "logement";
    case "activite": return "activites";
    case "repas": return "repas";
    default: return "autre";
  }
}

/**
 * Groupe les lieux par jour, jours croissants d'abord, puis un groupe « sans date » (jour:
 * null) en dernier. À l'intérieur d'un groupe, tri par `ordre` puis par nom.
 * → [{ jour: "2026-10-17" | null, lieux: [...] }]
 */
export function lieuxParJour(lieux) {
  const parJour = new Map();
  for (const lieu of lieux) {
    const cle = lieu.jour ?? null;
    if (!parJour.has(cle)) parJour.set(cle, []);
    parJour.get(cle).push(lieu);
  }
  const tri = (a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.nom.localeCompare(b.nom, "fr");
  const jours = [...parJour.keys()].filter((j) => j !== null).sort();
  const groupes = jours.map((jour) => ({ jour, lieux: [...parJour.get(jour)].sort(tri) }));
  if (parJour.has(null)) groupes.push({ jour: null, lieux: [...parJour.get(null)].sort(tri) });
  return groupes;
}

/**
 * Totaux des réservations d'un voyage, en centimes. Les résas au statut `annule` sont
 * exclues de tout calcul. `nonPaye` compte séparément les résas sans `paye_par` renseigné
 * (jamais fondu dans le total par personne — on veut voir ce qui manque).
 * → { total, parPrenom: { Yann: 1234, ... }, nonPaye }
 */
export function totauxResas(resas, membres) {
  const parPrenom = Object.fromEntries(membres.map((m) => [m.prenom, 0]));
  let total = 0;
  let nonPaye = 0;
  for (const resa of resas) {
    if (resa.statut === "annule") continue;
    const prix = resa.prix_centimes ?? 0;
    total += prix;
    if (resa.paye_par && resa.paye_par in parPrenom) parPrenom[resa.paye_par] += prix;
    else if (resa.paye_par) parPrenom[resa.paye_par] = (parPrenom[resa.paye_par] ?? 0) + prix;
    else nonPaye += prix;
  }
  return { total, parPrenom, nonPaye };
}

/**
 * Décompte avant un voyage à la date `aujourdHui` (AAAA-MM-JJ) : nombre de jours restants
 * (entier > 0), `"en cours"` si la date tombe dans la période, `"passé"` si le voyage est
 * terminé.
 */
export function joursAvant(voyage, aujourdHui) {
  if (voyage.fin < aujourdHui) return "passé";
  if (voyage.debut <= aujourdHui) return "en cours";
  const debut = new Date(`${voyage.debut}T00:00:00`);
  const auj = new Date(`${aujourdHui}T00:00:00`);
  return Math.round((debut - auj) / 86400000);
}

/**
 * Budget par poste (D-047 §V2) : prévu (enveloppe), engagé (résas non annulées cochées
 * `reserve`), à venir (non cochées `a_reserver`), reste = prévu − engagé − à venir. Un poste
 * qui a des lignes mais aucune enveloppe apparaît quand même, `prevu` à 0. Les résas `annule`
 * sont exclues. Postes triés selon l'ordre de `POSTES`, ceux hors liste (aucun cas normalement)
 * ignorés en tri mais jamais perdus (poussés en fin).
 * → { parPoste: [{ poste, prevu, engage, aVenir, reste, depasse }], totaux: { prevu, engage, aVenir, reste, depasse } }
 */
export function budgetParPoste(resas, enveloppes) {
  const enveloppeDe = Object.fromEntries(enveloppes.map((e) => [e.poste, e.prevu_centimes]));
  const postes = new Map();
  const assure = (p) => {
    if (!postes.has(p)) postes.set(p, { poste: p, prevu: enveloppeDe[p] ?? 0, engage: 0, aVenir: 0 });
    return postes.get(p);
  };
  for (const e of enveloppes) assure(e.poste);
  for (const resa of resas) {
    if (resa.statut === "annule") continue;
    const ligne = assure(posteDe(resa));
    const prix = resa.prix_centimes ?? 0;
    if (resa.statut === "reserve") ligne.engage += prix;
    else ligne.aVenir += prix;
  }
  const rangDe = (p) => { const i = POSTES.findIndex((x) => x.valeur === p); return i === -1 ? POSTES.length : i; };
  const parPoste = [...postes.values()]
    .sort((a, b) => rangDe(a.poste) - rangDe(b.poste))
    .map((l) => ({ ...l, reste: l.prevu - l.engage - l.aVenir, depasse: l.engage + l.aVenir > l.prevu && l.prevu > 0 }));
  const totaux = parPoste.reduce((t, l) => ({
    prevu: t.prevu + l.prevu, engage: t.engage + l.engage, aVenir: t.aVenir + l.aVenir, reste: t.reste + l.reste,
  }), { prevu: 0, engage: 0, aVenir: 0, reste: 0 });
  totaux.depasse = totaux.engage + totaux.aVenir > totaux.prevu && totaux.prevu > 0;
  return { parPoste, totaux };
}

/**
 * La prochaine étape d'un voyage : la résa non annulée la plus proche dont `debut` est
 * ≥ `maintenant` (ISO, comparable en chaîne comme les timestamps sans fuseau du schéma).
 * Résas sans date ignorées (rien à situer dans le temps). null si aucune.
 */
export function prochaineEtape(resas, maintenant) {
  const candidates = resas.filter((r) => r.statut !== "annule" && r.debut && r.debut >= maintenant);
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => a.debut.localeCompare(b.debut))[0];
}

/** 6 teintes d'accent du socle, contrastées (texte blanc ≥ 4.5:1) — une par voyage, stable
 *  (déduite de son id, jamais aléatoire : le même voyage garde toujours sa couleur). */
export const TEINTES_VOYAGE = ["#1d5b96", "#1d6f42", "#b34700", "#5b3e96", "#a4133c", "#0f766e"];

export function couleurVoyage(id) {
  const i = ((id % TEINTES_VOYAGE.length) + TEINTES_VOYAGE.length) % TEINTES_VOYAGE.length;
  return TEINTES_VOYAGE[i];
}
