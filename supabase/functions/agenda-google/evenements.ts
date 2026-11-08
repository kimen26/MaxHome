// Conversion PURE (sans réseau, sans secret) des événements Google Calendar v3 vers la forme
// lue par l'app : { id, titre, debut, fin, heureDebut, heureFin }. Testée dans
// test_evenements.ts. Aucun autre champ ne sort d'ici : ni description, ni participants, ni lieu.

export type DateGoogle = { date?: string; dateTime?: string };
export type EvenementGoogle = {
  id?: string; status?: string; summary?: string; start?: DateGoogle; end?: DateGoogle;
};
export type Evenement = {
  id: string; titre: string; debut: string; fin: string; heureDebut: string | null; heureFin: string | null;
};

export const TITRE_VIDE = "Sans titre";
/** Période demandée au plus : l'app charge 3 mois avant et 12 mois après (~460 jours). */
export const MAX_JOURS = 800;

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

/**
 * Un événement Google → un événement de l'app, ou null s'il est annulé ou sans début lisible.
 * Journée entière : `end.date` est EXCLUSIVE chez Google, la fin rendue est inclusive (un jour de
 * moins). Un événement horaire qui finit pile à minuit finit, pour l'app, la veille.
 */
export function convertirEvenement(e: EvenementGoogle): Evenement | null {
  if (!e || e.status === "cancelled") return null;
  const titre = (e.summary ?? "").trim() || TITRE_VIDE;
  const id = String(e.id ?? "");

  if (e.start?.date) {
    if (!enUtc(e.start.date)) return null;
    const debut = e.start.date;
    const finExclusive = e.end?.date && enUtc(e.end.date) ? e.end.date : decalerJour(debut, 1);
    const fin = decalerJour(finExclusive, -1);
    return { id, titre, debut, fin: fin < debut ? debut : fin, heureDebut: null, heureFin: null };
  }

  const dep = e.start?.dateTime ? decouperDateTime(e.start.dateTime) : null;
  if (!dep) return null;
  const arr = e.end?.dateTime ? decouperDateTime(e.end.dateTime) : null;
  if (!arr) return { id, titre, debut: dep.jour, fin: dep.jour, heureDebut: dep.heure, heureFin: null };
  const finVeille = arr.heure === "00:00" && arr.jour > dep.jour;
  return {
    id, titre, debut: dep.jour, fin: finVeille ? decalerJour(arr.jour, -1) : arr.jour,
    heureDebut: dep.heure, heureFin: arr.heure,
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
