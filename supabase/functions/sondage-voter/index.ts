// Edge Function PUBLIQUE (verify_jwt désactivé) : un invité vote sur un sondage « proposer une date »
// depuis sondage.html, sans session. Brief : docs/briefs/proposer-date.md.
//
// Contrat HTTP (la page publique s'y fie) :
//   POST { jeton: "<uuid>", prenom: "Paul", jours: ["2026-11-21", ...] }
//   200 { ok: true, prenom, jours: [triés], remplace: bool }
//   400 { erreur } prénom vide ou trop long, jours vides ou hors des jours libres
//   404 { erreur: "Ce sondage est terminé." } jeton inconnu ou pas un uuid
//   429 { erreur: "Ce sondage a reçu trop de réponses." } 200 votes atteints (un revote reste permis)
//
// Sécurité : seule porte d'écriture des invités. Écrit avec la clé service (SUPABASE_SERVICE_ROLE_KEY,
// fournie par Supabase, jamais renvoyée ni loggée) APRÈS validation (vote.ts). Un même prénom (clé sans
// casse ni accents) qui revote remplace son vote. Puis un message Telegram texte brut part au groupe du
// foyer s'il existe, sinon à chaque membre inscrit (D-060, _shared/telegram_foyer.ts) ; un échec d'envoi ne fait pas échouer le vote.
//
// Secret requis : MAXHOME_TELEGRAM_BOT_TOKEN (déjà posé pour rappel-virements).
// Déployée par scripts/deploy_sondages.py. Logique pure testée : test_vote.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { envoyerRappel, listerDestinataires } from "../_shared/telegram_foyer.ts";
import { estJeton, messageTelegram, validerVote, VOTES_MAX, type JourSondage } from "./vote.ts";

const ERR_TERMINE = "Ce sondage est terminé.";
const ERR_TROP = "Ce sondage a reçu trop de réponses.";
const ERR_TECHNIQUE = "Une erreur est survenue, réessaie dans un instant.";

const ENTETES_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class ErreurHttp extends Error {
  constructor(readonly statut: number, message: string) { super(message); }
}

const reponse = (statut: number, corps: unknown) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...ENTETES_CORS, "Content-Type": "application/json" } });

type Client = ReturnType<typeof createClient>;
type Sondage = { id: number; titre: string; jours: JourSondage[] };

async function lireCorps(req: Request): Promise<Record<string, unknown>> {
  try {
    const corps = await req.json();
    return typeof corps === "object" && corps !== null && !Array.isArray(corps) ? corps : {};
  } catch {
    return {};
  }
}

async function chargerSondage(sb: Client, jeton: string): Promise<Sondage> {
  const { data, error } = await sb.from("sondages").select("id, titre, jours").eq("jeton", jeton).maybeSingle();
  if (error) throw new ErreurHttp(500, ERR_TECHNIQUE);
  if (!data) throw new ErreurHttp(404, ERR_TERMINE);
  return data as Sondage;
}

/** Les clés des prénoms déjà inscrits : sert à plafonner (200) et à savoir si c'est un revote. */
async function clesExistantes(sb: Client, sondageId: number): Promise<Set<string>> {
  const { data, error } = await sb.from("sondage_votes").select("prenom_cle").eq("sondage_id", sondageId);
  if (error) throw new ErreurHttp(500, ERR_TECHNIQUE);
  return new Set((data ?? []).map((v: { prenom_cle: string }) => v.prenom_cle));
}

async function enregistrer(sb: Client, sondageId: number, vote: { prenom: string; cle: string; jours: string[] }) {
  const { error } = await sb.from("sondage_votes").upsert(
    { sondage_id: sondageId, prenom: vote.prenom, prenom_cle: vote.cle, jours: vote.jours, vote_le: new Date().toISOString() },
    { onConflict: "sondage_id,prenom_cle" },
  );
  if (error) throw new ErreurHttp(500, ERR_TECHNIQUE);
}

// ---------- Telegram (meilleur effort : ne fait jamais échouer le vote) ----------

/** Groupe du foyer s'il existe, sinon chaque membre, repli privé (D-060, _shared/telegram_foyer.ts).
 *  Le log ne reprend que le nom du type d'erreur : les messages de l'envoi citent des prénoms. */
async function prevenirLesMembres(sb: Client, texte: string): Promise<void> {
  const botToken = Deno.env.get("MAXHOME_TELEGRAM_BOT_TOKEN");
  if (!botToken) return console.error("sondage-voter : secret Telegram absent, aucun message envoyé");
  try {
    await envoyerRappel(botToken, await listerDestinataires(sb), texte);
  } catch (e) {
    console.error("sondage-voter : envoi Telegram échoué", e instanceof Error ? e.name : typeof e);
  }
}

// ---------- point d'entrée ----------

async function voter(corps: Record<string, unknown>): Promise<Response> {
  if (!estJeton(corps.jeton)) throw new ErreurHttp(404, ERR_TERMINE);
  const url = Deno.env.get("SUPABASE_URL");
  const cleService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !cleService) throw new ErreurHttp(500, ERR_TECHNIQUE);
  const sb = createClient(url, cleService, { auth: { persistSession: false, autoRefreshToken: false } });

  const sondage = await chargerSondage(sb, corps.jeton);
  const vote = validerVote(corps, sondage.jours);
  if ("erreur" in vote) throw new ErreurHttp(400, vote.erreur);

  const cles = await clesExistantes(sb, sondage.id);
  const remplace = cles.has(vote.cle);
  if (!remplace && cles.size >= VOTES_MAX) throw new ErreurHttp(429, ERR_TROP);

  await enregistrer(sb, sondage.id, vote);
  await prevenirLesMembres(sb, messageTelegram({ prenom: vote.prenom, titre: sondage.titre, jours: vote.jours, remplace }));
  return reponse(200, { ok: true, prenom: vote.prenom, jours: vote.jours, remplace });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: ENTETES_CORS });
  if (req.method !== "POST") return reponse(405, { erreur: "Méthode non permise." });
  try {
    return await voter(await lireCorps(req));
  } catch (e) {
    if (e instanceof ErreurHttp) return reponse(e.statut, { erreur: e.message });
    // Rien d'autre que le type de l'erreur : un message de bibliothèque pourrait citer une clé.
    console.error("sondage-voter : erreur inattendue", e instanceof Error ? e.name : typeof e);
    return reponse(500, { erreur: ERR_TECHNIQUE });
  }
});
