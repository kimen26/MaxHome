// Edge Function : rappel Telegram des mouvements du mois non faits.
// Nom conservé (« rappel-virements ») : il est câblé dans pg_cron et scripts/deploy_rappel.py.
// Planifiée via pg_cron le 1er et le 5 de chaque mois à 09:00 Europe/Paris (voir migration 003).
//
// Secrets requis (Supabase > Project Settings > Edge Functions > Secrets) :
//   MAXHOME_TELEGRAM_BOT_TOKEN, MAXHOME_TELEGRAM_CHAT_ID
// Déployer avec : python scripts/deploy_rappel.py

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function euros(centimes: number): string {
  return (centimes / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

Deno.serve(async () => {
  const botToken = Deno.env.get("MAXHOME_TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("MAXHOME_TELEGRAM_CHAT_ID");
  if (!botToken || !chatId) {
    return new Response("secrets Telegram absents, envoi annulé", { status: 200 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceRoleKey);

  const maintenant = new Date();
  const annee = maintenant.getUTCFullYear();
  const mois = maintenant.getUTCMonth() + 1;

  const { data: mouvements, error } = await sb
    .from("mouvements")
    .select("titre, montant_centimes, qui, fait_le")
    .eq("annee", annee)
    .eq("mois", mois)
    .is("fait_le", null)
    .order("id");
  if (error) throw error;

  // Le 1er du mois, personne n'a encore ouvert l'app : les occurrences n'existent pas.
  // On rappelle alors les récurrents actifs, sans montant (il dépend des charges du mois).
  let lignes: string[];
  if (!mouvements || mouvements.length === 0) {
    const { data: recurrents, error: e2 } = await sb
      .from("mouvements_recurrents")
      .select("titre, qui, jour")
      .eq("actif", true)
      .order("ordre");
    if (e2) throw e2;
    if (!recurrents || recurrents.length === 0) {
      return new Response(`aucun mouvement à faire pour ${MOIS[mois - 1]} ${annee}`, { status: 200 });
    }
    lignes = recurrents.map((r) =>
      `• ${r.titre}${r.jour ? ` (le ${r.jour})` : ""}${r.qui ? ` — ${r.qui}` : ""}`
    );
    const texteRec = `MaxHome — à faire en ${MOIS[mois - 1]} (ouvre l'app pour les montants) :\n${lignes.join("\n")}`;
    return await envoyer(botToken, chatId, texteRec);
  }

  lignes = mouvements.map((m) =>
    `• ${m.titre} : ${euros(m.montant_centimes)}${m.qui ? ` (${m.qui})` : ""}`
  );
  const texte = `MaxHome — reste à faire en ${MOIS[mois - 1]} :\n${lignes.join("\n")}`;
  return await envoyer(botToken, chatId, texte);
});

async function envoyer(botToken: string, chatId: string, texte: string): Promise<Response> {
  const rep = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texte }),
  });
  if (!rep.ok) throw new Error(`Telegram : ${rep.status} ${await rep.text()}`);
  return new Response("envoyé", { status: 200 });
}
