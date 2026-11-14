// Logique PURE (sans réseau, sans secret) de l'Edge Function sondage-voter : nettoyage du prénom,
// clé de comparaison sans casse ni accents, validation du corps contre le sondage, texte Telegram.
// Testée dans test_vote.ts. Contrat HTTP : voir index.ts et docs/briefs/proposer-date.md.

export const PRENOM_MAX = 40;
export const VOTES_MAX = 200;
export const JOURS_MAX = 62;

export type JourSondage = { jour: string; libre: boolean; ferie?: string | null; vacances?: string | null };
export type VoteValide = { prenom: string; cle: string; jours: string[] };

const RE_JETON = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_JOUR = /^\d{4}-\d{2}-\d{2}$/;
const JOURS_SEMAINE = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export const ERR_PRENOM_VIDE = "Écris ton prénom pour que nous sachions qui répond.";
export const ERR_PRENOM_LONG = `Ton prénom est trop long (${PRENOM_MAX} caractères au plus).`;
export const ERR_JOURS_VIDES = "Coche au moins un jour qui te va.";
export const ERR_JOURS_INVALIDES = "Un des jours cochés n'est pas proposé. Recharge la page et réessaie.";

export const estJeton = (v: unknown): v is string => typeof v === "string" && RE_JETON.test(v);

/** Prénom nettoyé : tabulations et retours en espaces, caractères de contrôle retirés, espaces repliés. */
export function nettoyerPrenom(brut: unknown): string {
  if (typeof brut !== "string") return "";
  return brut.replace(/[\t\n\r]/g, " ").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim();
}

/** Clé de comparaison : sans accents ni casse (« Zoé » et « zoe » sont le même invité). */
export function clePrenom(prenom: string): string {
  return prenom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Jours cochés : tableau de dates uniques, triées, toutes `libre` dans le sondage. */
function validerJours(brut: unknown, sondage: JourSondage[]): string[] | { erreur: string } {
  if (!Array.isArray(brut) || brut.length === 0) return { erreur: ERR_JOURS_VIDES };
  if (brut.length > JOURS_MAX || !brut.every((j) => typeof j === "string" && RE_JOUR.test(j))) {
    return { erreur: ERR_JOURS_INVALIDES };
  }
  const libres = new Set(sondage.filter((j) => j.libre === true).map((j) => j.jour));
  const uniques = [...new Set(brut as string[])];
  if (!uniques.every((j) => libres.has(j))) return { erreur: ERR_JOURS_INVALIDES };
  return uniques.sort();
}

/** Valide le corps contre le sondage : un vote prêt à écrire, ou { erreur } (phrase pour l'invité). */
export function validerVote(corps: Record<string, unknown>, sondage: JourSondage[]): VoteValide | { erreur: string } {
  const prenom = nettoyerPrenom(corps.prenom);
  if (!prenom) return { erreur: ERR_PRENOM_VIDE };
  if ([...prenom].length > PRENOM_MAX) return { erreur: ERR_PRENOM_LONG };
  const jours = validerJours(corps.jours, sondage);
  if ("erreur" in jours) return jours;
  return { prenom, cle: clePrenom(prenom), jours };
}

/** « 2026-11-21 » → « sam. 21 nov. » (calcul UTC : indépendant du fuseau de la machine). */
export function jourLisible(iso: string): string {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return `${JOURS_SEMAINE[d.getUTCDay()]} ${j} ${MOIS_COURTS[m - 1]}`;
}

/** Texte brut (pas de parse_mode) envoyé aux membres inscrits sur Telegram. */
export function messageTelegram(p: { prenom: string; titre: string; jours: string[]; remplace: boolean }): string {
  const verbe = p.remplace ? "a changé son vote pour" : "est dispo pour";
  return `${p.prenom} ${verbe} « ${p.titre} » : ${p.jours.map(jourLisible).join(", ")}`;
}
