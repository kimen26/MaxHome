// Edge Function : rappel Telegram du soir — tâches importantes non faites aujourd'hui.
// Planifiée via pg_cron chaque jour à 19:00 Europe/Paris (voir migration 007).
//
// Secrets requis : MAXHOME_TELEGRAM_BOT_TOKEN, MAXHOME_TELEGRAM_CHAT_ID
// Déployer avec : python scripts/deploy_rappels.py

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Seules les tâches obligatoires déclenchent un rappel : rappeler la salle de bain tous
// les soirs rendrait le message inutile, donc ignoré. Avant le Lot 4, ce filtre lisait
// `importance == 3` ; `importance` n'étant plus maintenue, il se serait tu en silence.

/** Jour local à Paris au format AAAA-MM-JJ (le serveur tourne en UTC). */
function jourParis(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

Deno.serve(async () => {
  const botToken = Deno.env.get("MAXHOME_TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("MAXHOME_TELEGRAM_CHAT_ID");
  if (!botToken || !chatId) {
    return new Response("secrets Telegram absents, envoi annulé", { status: 200 });
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jour = jourParis();

  const { data: taches, error } = await sb
    .from("taches")
    .select("titre, categorie, echeance, rang, recurrent_id")
    .is("fait_le", null)
    .lte("echeance", jour)
    .order("echeance");
  if (error) throw error;

  // Les occurrences n'existent qu'une fois la journée ouverte dans l'app ou le bot.
  // Rien en base ne veut donc pas dire « rien à faire » : on le dit sans crier au loup.
  if (!taches || taches.length === 0) {
    return new Response("aucune tâche en base pour aujourd'hui", { status: 200 });
  }

  const { data: recurrents, error: e2 } = await sb
    .from("taches_recurrentes").select("id, obligatoire");
  if (e2) throw e2;
  const obligatoire = new Map((recurrents ?? []).map((r) => [r.id, r.obligatoire]));

  const urgentes = taches.filter((t) => obligatoire.get(t.recurrent_id) === true);
  if (urgentes.length === 0) {
    return new Response("rien d'obligatoire ce soir", { status: 200 });
  }

  const lignes = urgentes.map((t) =>
    `• ${t.titre}${t.echeance < jour ? " (en retard)" : ""}`
  );
  const texte = `MaxHome — à faire avant ce soir :\n${lignes.join("\n")}\n\nRéponds « fait <titre> » pour cocher.`;

  const rep = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texte }),
  });
  if (!rep.ok) throw new Error(`Telegram : ${rep.status} ${await rep.text()}`);
  return new Response(`envoyé (${urgentes.length} tâches)`, { status: 200 });
});
