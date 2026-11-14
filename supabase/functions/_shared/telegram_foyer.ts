// Destinataires Telegram du foyer et envoi avec repli, partagés par rappel-virements et
// sondage-voter (conception §3 : 2e usage identique, extrait). Règle D-060 :
//   - si `parametres` porte un groupe (clé « telegram_groupe », écrite par le bot), le message part
//     AU GROUPE SEUL ;
//   - sinon il part à CHAQUE membre inscrit (table telegram_membres, chat privé : l'id Telegram de
//     l'utilisateur est aussi l'id du chat) ;
//   - groupe injoignable : repli privé aux membres, puis erreur levée (visible aux logs).
// Import relatif « ../_shared/telegram_foyer.ts » : la CLI `supabase functions deploy` l'embarque.
// Aucun log ici : ni token ni URL ne sont repris dans les erreurs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Clé de la table `parametres` : dupliquée de scripts/bot/groupe.py::CLE_PARAMETRE (Deno n'importe pas le Python).
export const CLE_GROUPE = "telegram_groupe";

export type Destinataire = { telegram_id: number; prenom: string };
export type Destinataires = { groupe: Destinataire | null; membres: Destinataire[] };

/** Pur : valeur de `parametres.telegram_groupe` (null si absente) → le groupe, ou erreur si invalide. */
export function groupeDepuisParametre(valeur: unknown): Destinataire | null {
  if (valeur == null) return null;
  const id = Number(valeur);
  if (!Number.isInteger(id) || id === 0) throw new Error(`parametres.${CLE_GROUPE} n'est pas un identifiant de groupe`);
  return { telegram_id: id, prenom: "groupe" };
}

/** Pur : valeur du paramètre groupe et membres → destinataires (groupe seul prioritaire, cf. envoyerRappel). */
export function choisirDestinataires(valeurGroupe: unknown, membres: Destinataire[]): Destinataires {
  return { groupe: groupeDepuisParametre(valeurGroupe), membres };
}

export async function listerDestinataires(sb: ReturnType<typeof createClient>): Promise<Destinataires> {
  const { data: param, error: eParam } = await sb.from("parametres").select("valeur").eq("cle", CLE_GROUPE).maybeSingle();
  if (eParam) throw eParam;
  const groupe = groupeDepuisParametre(param ? param.valeur : null); // avant la lecture des membres, comme avant l'extraction
  const { data, error } = await sb.from("telegram_membres").select("telegram_id, prenom");
  if (error) throw error;
  return { groupe, membres: data ?? [] };
}

// Un envoi : null si Telegram a accepté, sinon la cause en clair (« réseau » ou le statut HTTP ;
// jamais le token : ni l'URL ni le corps de la réponse Telegram ne sont repris).
export async function envoyer(botToken: string, d: Destinataire, texte: string): Promise<string | null> {
  const rep = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: d.telegram_id, text: texte }), // pas de parse_mode : texte brut
  }).catch(() => null);
  if (!rep) return "réseau";
  return rep.ok ? null : String(rep.status);
}

// Un envoi qui échoue n'empêche pas les autres ; les échecs sont listés à la fin.
export async function envoyerATous(botToken: string, membres: Destinataire[], texte: string): Promise<Response> {
  const echecs: string[] = [];
  for (const d of membres) {
    const echec = await envoyer(botToken, d, texte);
    if (echec) echecs.push(`${d.prenom} (${echec})`);
  }
  if (echecs.length) throw new Error(`Telegram : envoi échoué pour ${echecs.join(", ")}`);
  return new Response(`envoyé à ${membres.length} membre(s)`, { status: 200 });
}

// Groupe connu : le message part au groupe seul. Groupe injoignable : repli privé, puis erreur.
export async function envoyerRappel(botToken: string, dest: Destinataires, texte: string): Promise<Response> {
  if (!dest.groupe) return await envoyerATous(botToken, dest.membres, texte);
  const echec = await envoyer(botToken, dest.groupe, texte);
  if (!echec) return new Response("envoyé au groupe", { status: 200 });
  if (dest.membres.length) await envoyerATous(botToken, dest.membres, texte);
  throw new Error(`Telegram : groupe injoignable (${echec}), rappel envoyé en privé`);
}
