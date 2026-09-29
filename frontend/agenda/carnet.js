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
  { valeur: "autre", libelle: "Autre", emoji: "📌" },
];

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
