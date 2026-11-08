// Edge Function : lit et écrit dans l'agenda Google du foyer.
//  - Sans `action` (lecture, compatibilité avec le front déployé) : rend les événements d'une période
//    sous la forme { evenements: [{ id, titre, debut, fin, heureDebut, heureFin, personne }] }.
//  - `action` dans le corps POST : "creer" | "modifier" (PATCH, ne touche pas aux autres champs) |
//    "supprimer" (Google garde l'événement 30 jours dans sa corbeille). Rend { evenement } ou { ok: true }.
//
// Accès : verify_jwt actif (jeton Supabase valide exigé) ET l'appelant doit être membre du foyer,
// vérifié avec SON jeton et la clé anon (RLS est_membre() sur `membres`, supabase/schema.sql).
// Jamais la clé service_role ici. Aucun secret n'est loggé ni renvoyé.
//
// Secret requis : MAXHOME_GOOGLE_CLE = la clé JSON du compte de service (scripts/deploy_agenda.py
// la pose depuis le registre Windows). Portée Google : calendar.events (lire et écrire des
// événements, rien d'autre). L'agenda du foyer doit être PARTAGÉ avec l'adresse du compte de service
// (droit « Apporter des modifications aux événements »).
//
// Déployée par scripts/deploy_agenda.py. La conversion Google → app est dans evenements.ts (pure,
// testée par test_evenements.ts).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  bornesGoogle, convertirEvenement, convertirEvenements, corpsGoogle, FUSEAU, origineAutorisee, validerId,
  validerPeriode, validerSaisie, type EvenementGoogle,
} from "./evenements.ts";

const AGENDA_ID = "claudyann.home@gmail.com";
const PORTEE = "https://www.googleapis.com/auth/calendar.events";
const URL_EVENEMENTS = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(AGENDA_ID)}/events`;
const CHAMPS_EVENEMENT = "id,status,summary,start,end,extendedProperties"; // jamais description, lieu, participants
const PAR_PAGE = 500;
const PAGES_MAX = 4;
const VALIDITE_JETON_S = 3600;

const entetesCors = (req: Request) => ({
  "Access-Control-Allow-Origin": origineAutorisee(req.headers.get("Origin")),
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
});

class ErreurHttp extends Error {
  constructor(readonly statut: number, message: string) { super(message); }
}

const reponse = (req: Request, statut: number, corps: unknown) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...entetesCors(req), "Content-Type": "application/json" } });

// ---------- accès : l'appelant est-il membre du foyer ? ----------

async function verifierMembre(req: Request): Promise<void> {
  const autorisation = req.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!autorisation || !url || !anon) throw new ErreurHttp(403, "accès refusé");
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: autorisation } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.from("membres").select("prenom").limit(1);
  if (error) throw new ErreurHttp(500, "vérification de l'accès impossible");
  if (!data || data.length === 0) throw new ErreurHttp(403, "accès réservé aux membres du foyer");
}

// ---------- paramètres ----------

type Corps = Record<string, unknown>;

/** GET : debut et fin dans l'URL (lecture seule). POST : le corps JSON ; un corps illisible vaut {}. */
async function lireCorps(req: Request): Promise<Corps> {
  if (req.method === "GET") {
    const q = new URL(req.url).searchParams;
    return { debut: q.get("debut"), fin: q.get("fin") };
  }
  try {
    const corps = await req.json();
    return typeof corps === "object" && corps !== null ? corps : {};
  } catch {
    return {};
  }
}

// ---------- Google : jeton du compte de service (JWT RS256 signé avec crypto.subtle) ----------

type CleService = { client_email: string; private_key: string; token_uri: string };

function lireCle(): CleService {
  const brut = Deno.env.get("MAXHOME_GOOGLE_CLE");
  if (!brut) throw new ErreurHttp(500, "configuration Google manquante");
  try {
    const cle = JSON.parse(brut);
    if (!cle.client_email || !cle.private_key || !cle.token_uri) throw new Error("incomplète");
    return cle;
  } catch {
    throw new ErreurHttp(500, "configuration Google illisible");
  }
}

const base64url = (octets: Uint8Array) =>
  btoa(String.fromCharCode(...octets)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const texteEnBase64url = (t: string) => base64url(new TextEncoder().encode(t));

function pemEnOctets(pem: string) {
  const corps = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(corps), (c) => c.charCodeAt(0));
}

async function signerJwt(cle: CleService): Promise<string> {
  const maintenant = Math.floor(Date.now() / 1000);
  const entete = texteEnBase64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const charge = texteEnBase64url(JSON.stringify({
    iss: cle.client_email, scope: PORTEE, aud: cle.token_uri, iat: maintenant, exp: maintenant + VALIDITE_JETON_S,
  }));
  const privee = await crypto.subtle.importKey(
    "pkcs8", pemEnOctets(cle.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privee, new TextEncoder().encode(`${entete}.${charge}`));
  return `${entete}.${charge}.${base64url(new Uint8Array(signature))}`;
}

async function obtenirJeton(cle: CleService): Promise<string> {
  const rep = await fetch(cle.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: await signerJwt(cle) }),
  });
  if (!rep.ok) throw new ErreurHttp(502, `Google a refusé la connexion du compte de service (HTTP ${rep.status})`);
  const { access_token } = await rep.json();
  if (!access_token) throw new ErreurHttp(502, "Google n'a pas rendu de jeton");
  return access_token;
}

// ---------- Google : événements ----------

async function lireEvenementsGoogle(jeton: string, debut: string, fin: string): Promise<EvenementGoogle[]> {
  const tout: EvenementGoogle[] = [];
  let page: string | undefined;
  for (let i = 0; i < PAGES_MAX; i++) {
    const q = new URLSearchParams({
      singleEvents: "true", orderBy: "startTime", timeZone: FUSEAU, maxResults: String(PAR_PAGE),
      ...bornesGoogle(debut, fin),
      fields: `nextPageToken,items(${CHAMPS_EVENEMENT})`,
    });
    if (page) q.set("pageToken", page);
    const rep = await fetch(`${URL_EVENEMENTS}?${q}`, { headers: { Authorization: `Bearer ${jeton}` } });
    if (!rep.ok) throw new ErreurHttp(502, `Google Agenda a répondu une erreur (HTTP ${rep.status})`);
    const corps = await rep.json();
    tout.push(...(corps.items ?? []));
    page = corps.nextPageToken;
    if (!page) break;
  }
  return tout;
}

/** Écriture d'un événement (insert, PATCH ou DELETE) : 204 → null, sinon l'événement Google. */
async function ecrireGoogle(jeton: string, methode: "POST" | "PATCH" | "DELETE", id: string | null, corps?: unknown) {
  const url = `${URL_EVENEMENTS}${id ? `/${encodeURIComponent(id)}` : ""}${methode === "DELETE" ? "" : `?fields=${CHAMPS_EVENEMENT}`}`;
  const rep = await fetch(url, {
    method: methode,
    headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json" },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  if (id && (rep.status === 404 || rep.status === 410)) throw new ErreurHttp(404, "Cet événement n'existe plus dans l'agenda Google.");
  if (rep.status === 403) throw new ErreurHttp(502, "Google refuse l'écriture : le compte de service n'a pas le droit de modifier cet agenda.");
  if (!rep.ok) throw new ErreurHttp(502, `Google Agenda a refusé l'écriture (HTTP ${rep.status})`);
  return rep.status === 204 ? null : await rep.json();
}

/** Une validation réussie rend sa valeur ; un refus devient une réponse 400 avec son message. */
function accepter<T extends object>(r: T | { erreur: string }): T {
  if ("erreur" in r) throw new ErreurHttp(400, r.erreur);
  return r as T;
}

/** Créer, modifier ou supprimer : valide d'abord (400 sans appeler Google), puis écrit. */
async function ecrire(action: string, corps: Corps): Promise<unknown> {
  if (action === "supprimer") {
    const { id } = accepter(validerId(corps.id));
    await ecrireGoogle(await obtenirJeton(lireCle()), "DELETE", id);
    return { ok: true };
  }
  if (action !== "creer" && action !== "modifier") throw new ErreurHttp(400, "Action inconnue.");
  const id = action === "modifier" ? accepter(validerId(corps.id)).id : null;
  const saisie = accepter(validerSaisie(corps));
  const brut = await ecrireGoogle(
    await obtenirJeton(lireCle()), id ? "PATCH" : "POST", id, corpsGoogle(saisie, id !== null),
  ) as EvenementGoogle;
  const evenement = convertirEvenement(brut);
  if (!evenement) throw new ErreurHttp(502, "Google a rendu un événement illisible.");
  return { evenement };
}

// ---------- point d'entrée ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: entetesCors(req) });
  if (req.method !== "GET" && req.method !== "POST") return reponse(req, 405, { erreur: "méthode non permise" });
  try {
    await verifierMembre(req);
    const corps = await lireCorps(req);
    if (corps.action !== undefined && corps.action !== null) return reponse(req, 200, await ecrire(String(corps.action), corps));
    const periode = validerPeriode(corps.debut, corps.fin);
    if ("erreur" in periode) throw new ErreurHttp(400, periode.erreur);
    const jeton = await obtenirJeton(lireCle());
    const brut = await lireEvenementsGoogle(jeton, periode.debut, periode.fin);
    return reponse(req, 200, { evenements: convertirEvenements(brut) });
  } catch (e) {
    if (e instanceof ErreurHttp) return reponse(req, e.statut, { erreur: e.message });
    // Rien d'autre que le type de l'erreur dans le log : un message de bibliothèque pourrait citer la clé.
    console.error("agenda-google : erreur inattendue", e instanceof Error ? e.name : typeof e);
    return reponse(req, 502, { erreur: "Google Agenda est injoignable" });
  }
});
