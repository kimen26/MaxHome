// Edge Function : rappel Telegram des virements du mois non faits.
// Planifiée via pg_cron le 1er et le 5 de chaque mois à 09:00 Europe/Paris (voir migration 003).
//
// Secrets requis (Supabase > Project Settings > Edge Functions > Secrets) :
//   MAXBUDGET_TELEGRAM_BOT_TOKEN, MAXBUDGET_TELEGRAM_CHAT_ID
// NON déployée au Lot A : ces secrets sont absents de .env local à ce jour (2026-09-05).
// Déployer avec : supabase functions deploy rappel-virements (une fois les secrets configurés).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function euros(centimes: number): string {
  return (centimes / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

Deno.serve(async () => {
  const botToken = Deno.env.get("MAXBUDGET_TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("MAXBUDGET_TELEGRAM_CHAT_ID");
  if (!botToken || !chatId) {
    return new Response("secrets Telegram absents, envoi annulé", { status: 200 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceRoleKey);

  const maintenant = new Date();
  const annee = maintenant.getUTCFullYear();
  const mois = maintenant.getUTCMonth() + 1;

  const { data: virements, error } = await sb
    .from("virements")
    .select("prenom, montant_centimes, fait_le")
    .eq("annee", annee)
    .eq("mois", mois);
  if (error) throw error;

  if (!virements || virements.length === 0) {
    return new Response(`aucun virement calculé pour ${MOIS[mois - 1]} ${annee}`, { status: 200 });
  }

  const { data: comptes } = await sb.from("comptes").select("nom, commun").eq("commun", true).limit(1);
  const compteCommun = comptes?.[0]?.nom ?? "compte commun";

  const lignes = virements.map((v) =>
    `${v.prenom} → ${compteCommun} : ${euros(v.montant_centimes)} (${v.fait_le ? "fait ✔" : "à faire"})`
  );
  const texte = `Virements MaxBudget — ${MOIS[mois - 1]} :\n${lignes.join("\n")}`;

  const rep = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texte }),
  });
  if (!rep.ok) throw new Error(`Telegram : ${rep.status} ${await rep.text()}`);

  return new Response("envoyé", { status: 200 });
});
