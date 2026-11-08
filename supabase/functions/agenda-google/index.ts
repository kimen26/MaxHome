// Edge Function : lit l'agenda Google du foyer (LECTURE SEULE) et rend les événements d'une période
// sous la forme { evenements: [{ id, titre, debut, fin, heureDebut, heureFin }] }.
//
// Accès : verify_jwt actif (jeton Supabase valide exigé) ET l'appelant doit être membre du foyer,
// vérifié avec SON jeton et la clé anon (RLS est_membre() sur `membres`, supabase/schema.sql).
// Jamais la clé service_role ici. Aucun secret n'est loggé ni renvoyé.
//
// Secret requis : MAXHOME_GOOGLE_CLE = la clé JSON du compte de service (scripts/deploy_agenda.py
// la pose depuis le registre Windows). Portée Google : calendar.readonly uniquement. L'agenda du
// foyer doit être PARTAGÉ avec l'adresse du compte de service (droit « voir tous les détails »).
//
// Déployée par scripts/deploy_agenda.py. La conversion Google → app est dans evenements.ts (pure,
// testée par test_evenements.ts).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { bornesGoogle, convertirEvenements, origineAutorisee, validerPeriode, type EvenementGoogle } from "./evenements.ts";

const AGENDA_ID = "claudyann.home@gmail.com";
const FUSEAU = "Europe/Paris";
const PORTEE = "https://www.googleapis.com/auth/calendar.readonly";
const URL_EVENEMENTS = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(AGENDA_ID)}/events`;
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

async function lireParametres(req: Request): Promise<{ debut: unknown; fin: unknown }> {
  if (req.method === "GET") {
    const q = new URL(req.url).searchParams;
    return { debut: q.get("debut"), fin: q.get("fin") };
  }
  try {
    const corps = await req.json();
    return { debut: corps?.debut, fin: corps?.fin };
  } catch {
    return { debut: undefined, fin: undefined };
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
      fields: "nextPageToken,items(id,status,summary,start,end)", // jamais description, lieu, participants
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

// ---------- point d'entrée ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: entetesCors(req) });
  if (req.method !== "GET" && req.method !== "POST") return reponse(req, 405, { erreur: "méthode non permise" });
  try {
    await verifierMembre(req);
    const { debut, fin } = await lireParametres(req);
    const periode = validerPeriode(debut, fin);
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
