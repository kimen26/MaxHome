// Logique PURE (sans réseau, sans secret) de l'Edge Function : conversion des événements Google
// Calendar v3 vers la forme lue par l'app { id, titre, debut, fin, heureDebut, heureFin, personne },
// validation des saisies d'écriture (créer / modifier / supprimer) et corps envoyé à Google.
// Testée dans test_evenements.ts. Aucun autre champ ne sort d'ici : ni description, ni participants, ni lieu.

export const PERSONNES = ["Max", "Yann", "Claudia", "Famille"] as const;
export type Personne = typeof PERSONNES[number];

export type DateGoogle = { date?: string; dateTime?: string };
export type EvenementGoogle = {
  id?: string; status?: string; summary?: string; start?: DateGoogle; end?: DateGoogle;
  extendedProperties?: { private?: Record<string, string> };
};
export type Evenement = {
  id: string; titre: string; debut: string; fin: string; heureDebut: string | null; heureFin: string | null;
  personne: Personne | null;
};

export const TITRE_VIDE = "Sans titre";
/** Période demandée au plus : l'app charge 3 mois avant et 12 mois après (~460 jours). */
export const MAX_JOURS = 800;
/** Clé privée (extendedProperties.private) où l'app range « pour qui » : invisible dans Google Agenda. */
export const CLE_PERSONNE = "maxhome_personne";
export const FUSEAU = "Europe/Paris";
export const TITRE_MAX = 200;

const FORMAT_JOUR = /^\d{4}-\d{2}-\d{2}$/;
const JOUR_MS = 86_400_000;

/** Date UTC à minuit d'un AAAA-MM-JJ, ou null si le jour n'existe pas (31 février). */
function enUtc(iso: string): Date | null {
  if (!FORMAT_JOUR.test(iso)) return null;
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.toISOString().slice(0, 10) === iso ? d : null;
}

/** Décale un AAAA-MM-JJ de `n` jours (calcul en UTC : aucun saut d'heure d'été). */
export function decalerJour(iso: string, n: number): string {
  const d = enUtc(iso);
  if (!d) throw new Error(`jour invalide : ${iso}`);
  return new Date(d.getTime() + n * JOUR_MS).toISOString().slice(0, 10);
}

/** Valide `debut` et `fin` : retourne la période, ou le message du refus (statut 400). */
export function validerPeriode(debut: unknown, fin: unknown): { debut: string; fin: string } | { erreur: string } {
  if (typeof debut !== "string" || typeof fin !== "string") return { erreur: "debut et fin (AAAA-MM-JJ) sont obligatoires" };
  const d = enUtc(debut), f = enUtc(fin);
  if (!d || !f) return { erreur: "debut et fin doivent être des jours AAAA-MM-JJ valides" };
  if (d > f) return { erreur: "debut doit précéder fin" };
  if ((f.getTime() - d.getTime()) / JOUR_MS > MAX_JOURS) return { erreur: `période limitée à ${MAX_JOURS} jours` };
  return { debut, fin };
}

/** « 2026-11-07T10:40:00+01:00 » → { jour: « 2026-11-07 », heure: « 10:40 » } (déjà heure de Paris). */
function decouperDateTime(dateTime: string): { jour: string; heure: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(dateTime);
  return m ? { jour: m[1], heure: m[2] } : null;
}

/** « Pour qui » posé par l'app dans l'événement, ou null (événement créé dans Google, valeur inconnue). */
function personneDe(e: EvenementGoogle): Personne | null {
  const brute = e.extendedProperties?.private?.[CLE_PERSONNE];
  return PERSONNES.find((p) => p === brute) ?? null;
}

/**
 * Un événement Google → un événement de l'app, ou null s'il est annulé ou sans début lisible.
 * Journée entière : `end.date` est EXCLUSIVE chez Google, la fin rendue est inclusive (un jour de
 * moins). Un événement horaire qui finit pile à minuit finit, pour l'app, la veille.
 */
export function convertirEvenement(e: EvenementGoogle): Evenement | null {
  if (!e || e.status === "cancelled") return null;
  const titre = (e.summary ?? "").trim() || TITRE_VIDE;
  const id = String(e.id ?? "");
  const personne = personneDe(e);

  if (e.start?.date) {
    if (!enUtc(e.start.date)) return null;
    const debut = e.start.date;
    const finExclusive = e.end?.date && enUtc(e.end.date) ? e.end.date : decalerJour(debut, 1);
    const fin = decalerJour(finExclusive, -1);
    return { id, titre, debut, fin: fin < debut ? debut : fin, heureDebut: null, heureFin: null, personne };
  }

  const dep = e.start?.dateTime ? decouperDateTime(e.start.dateTime) : null;
  if (!dep) return null;
  const arr = e.end?.dateTime ? decouperDateTime(e.end.dateTime) : null;
  if (!arr) return { id, titre, debut: dep.jour, fin: dep.jour, heureDebut: dep.heure, heureFin: null, personne };
  const finVeille = arr.heure === "00:00" && arr.jour > dep.jour;
  return {
    id, titre, debut: dep.jour, fin: finVeille ? decalerJour(arr.jour, -1) : arr.jour,
    heureDebut: dep.heure, heureFin: arr.heure, personne,
  };
}

/** Convertit une liste : annulés et illisibles écartés, ordre de Google conservé. */
export function convertirEvenements(liste: EvenementGoogle[]): Evenement[] {
  return liste.map(convertirEvenement).filter((e): e is Evenement => e !== null);
}

/**
 * Bornes de la requête Google : RFC3339 AVEC décalage obligatoire (sans lui l'API rend 400).
 * Le suffixe Z (UTC) suffit : l'app charge des mois entiers, quelques heures de décalage au bord
 * de la fenêtre (minuit UTC = 1 h ou 2 h à Paris) ne changent rien à ce qu'on affiche.
 * `timeMax` est exclusif : minuit du jour qui suit `fin`.
 */
export function bornesGoogle(debut: string, fin: string): { timeMin: string; timeMax: string } {
  return { timeMin: `${debut}T00:00:00Z`, timeMax: `${decalerJour(fin, 1)}T00:00:00Z` };
}

// ---------- écriture : validation des saisies ----------

export type Saisie = {
  titre: string; personne: Personne; debut: string; fin: string; heureDebut: string | null; heureFin: string | null;
};

const FORMAT_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Identifiant d'événement : lettres, chiffres, « _ » et « - » (les occurrences d'une série ajoutent
 *  « _ » et un horodatage en majuscules). Jamais de « / », « ? » ou « # » : l'id entre dans l'URL Google. */
const FORMAT_ID = /^[A-Za-z0-9_-]{1,1024}$/;

const absent = (v: unknown) => v === undefined || v === null || v === "";

/** Une heure facultative : null si absente, sinon la chaîne HH:MM, ou undefined si elle est illisible. */
function lireHeure(v: unknown): string | null | undefined {
  if (absent(v)) return null;
  return typeof v === "string" && FORMAT_HEURE.test(v) ? v : undefined;
}

function validerTitrePersonne(c: Record<string, unknown>): { titre: string; personne: Personne } | { erreur: string } {
  const titre = typeof c.titre === "string" ? c.titre.trim() : "";
  if (titre.length === 0) return { erreur: "Donnez un titre à l'événement." };
  if (titre.length > TITRE_MAX) return { erreur: `Le titre est trop long (${TITRE_MAX} caractères au plus).` };
  const personne = PERSONNES.find((p) => p === c.personne);
  if (!personne) return { erreur: `Choisissez pour qui : ${PERSONNES.join(", ")}.` };
  return { titre, personne };
}

function validerHeures(c: Record<string, unknown>, debut: string, fin: string):
  { heureDebut: string | null; heureFin: string | null } | { erreur: string } {
  const heureDebut = lireHeure(c.heureDebut), heureFin = lireHeure(c.heureFin);
  if (heureDebut === undefined) return { erreur: "L'heure de début doit être au format HH:MM (de 00:00 à 23:59)." };
  if (heureFin === undefined) return { erreur: "L'heure de fin doit être au format HH:MM (de 00:00 à 23:59)." };
  if ((heureDebut === null) !== (heureFin === null)) {
    return { erreur: "Indiquez les deux heures (début et fin), ou aucune pour une journée entière." };
  }
  if (heureDebut !== null && heureFin !== null) {
    if (debut !== fin) return { erreur: "Un événement avec des heures tient sur un seul jour : mettez la même date au début et à la fin." };
    if (heureFin <= heureDebut) return { erreur: "L'heure de fin doit être après l'heure de début." };
  }
  return { heureDebut, heureFin };
}

/** Valide la saisie d'un événement (créer, modifier) : la saisie nettoyée, ou le message du refus (400). */
export function validerSaisie(corps: unknown): Saisie | { erreur: string } {
  if (typeof corps !== "object" || corps === null) return { erreur: "Demande illisible." };
  const c = corps as Record<string, unknown>;
  const qui = validerTitrePersonne(c);
  if ("erreur" in qui) return qui;
  const d = typeof c.debut === "string" ? enUtc(c.debut) : null;
  const f = typeof c.fin === "string" ? enUtc(c.fin) : null;
  if (!d) return { erreur: "La date de début n'existe pas (format AAAA-MM-JJ)." };
  if (!f) return { erreur: "La date de fin n'existe pas (format AAAA-MM-JJ)." };
  if (f < d) return { erreur: "La date de fin est avant la date de début." };
  const debut = c.debut as string, fin = c.fin as string;
  const heures = validerHeures(c, debut, fin);
  if ("erreur" in heures) return heures;
  return { ...qui, debut, fin, ...heures };
}

/** Valide l'identifiant d'un événement (modifier, supprimer). */
export function validerId(id: unknown): { id: string } | { erreur: string } {
  return typeof id === "string" && FORMAT_ID.test(id) ? { id } : { erreur: "Identifiant d'événement invalide." };
}

/**
 * Corps envoyé à Google. Journée entière : `end.date` est EXCLUSIVE (fin + 1 jour). Horaire : dateTime
 * + fuseau de Paris. En modification (PATCH), l'autre forme est mise à null pour qu'un événement qui
 * change de nature ne garde pas l'ancienne ; rien d'autre n'est touché (description, rappels…).
 */
export function corpsGoogle(s: Saisie, modification: boolean): Record<string, unknown> {
  const horaire = s.heureDebut !== null && s.heureFin !== null;
  const bord = (jour: string, heure: string | null) => horaire
    ? { dateTime: `${jour}T${heure}:00`, timeZone: FUSEAU, ...(modification ? { date: null } : {}) }
    : { date: jour, ...(modification ? { dateTime: null, timeZone: null } : {}) };
  return {
    summary: s.titre,
    start: bord(s.debut, s.heureDebut),
    end: bord(horaire ? s.fin : decalerJour(s.fin, 1), s.heureFin),
    extendedProperties: { private: { [CLE_PERSONNE]: s.personne } },
  };
}

export const ORIGINE_PROD = "https://kimen26.github.io";
const ORIGINE_LOCALE = /^http:\/\/localhost:\d{1,5}$/;

/**
 * Origine renvoyée dans Access-Control-Allow-Origin : celle de la requête si c'est le site
 * (GitHub Pages) ou un localhost (recettes avec vrai login), sinon l'origine du site. La sécurité
 * reste le jeton Supabase et le contrôle « membre du foyer », pas le CORS.
 */
export function origineAutorisee(origine: string | null): string {
  return origine && (origine === ORIGINE_PROD || ORIGINE_LOCALE.test(origine)) ? origine : ORIGINE_PROD;
}
