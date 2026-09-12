// Edge Function : rappel Telegram du soir — tâches importantes non faites aujourd'hui.
// Planifiée via pg_cron chaque jour à 19:00 Europe/Paris (voir migration 007).
//
// Secrets requis : MAXHOME_TELEGRAM_BOT_TOKEN, MAXHOME_TELEGRAM_CHAT_ID
// Déployer avec : python scripts/deploy_rappels.py

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Seules les tâches obligatoires déclenchent un rappel : rappeler la salle de bain tous
// les soirs rendrait le message inutile, donc ignoré. Avant le Lot 4, ce filtre lisait
// `importance == 3` ; `importance` n'étant plus maintenue, il se serait tu en silence.
//
// Depuis 012_moment.sql, une tâche quotidienne porte un moment (matin/soir). À 19h,
// citer une tâche du MATIN non faite comme si elle restait à faire « ce soir » serait un
// reproche creux : la fenêtre est passée, la répéter n'aide personne. On garde donc tout —
// aucune tâche obligatoire n'est tue, la visibilité reste le but du module — mais on
// SÉPARE le message en deux blocs : « à faire ce soir » (moment soir + sans moment, encore
// légitimes) et, seulement s'il en reste, « pas fait ce matin » en second bloc, plus neutre
// dans le ton. Une tâche déjà en retard (échéance < jour) garde sa mention « (en retard) »
// existante et reste dans le bloc du soir quel que soit son moment : elle est déjà un
// rattrapage, pas un « prévu ce soir ».

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
    .from("taches_recurrentes").select("id, obligatoire, moment, fois");
  if (e2) throw e2;
  const obligatoire = new Map((recurrents ?? []).map((r) => [r.id, r.obligatoire]));
  const moment = new Map((recurrents ?? []).map((r) => [r.id, r.moment]));
  const fois = new Map((recurrents ?? []).map((r) => [r.id, r.fois ?? 1]));

  const urgentes = taches.filter((t) => obligatoire.get(t.recurrent_id) === true);
  if (urgentes.length === 0) {
    return new Response("rien d'obligatoire ce soir", { status: 200 });
  }

  // Bloc « ce soir » : moment soir, sans moment (hebdo/mensuelle/au besoin/quotidienne non
  // réglée), et tout ce qui est déjà en retard (peu importe son moment — cf. commentaire
  // en tête de fichier). Bloc « ce matin » : uniquement le matin du jour même, pas en retard.
  const enRetard = (t: { echeance: string }) => t.echeance < jour;
  const duMatinAujourdhui = (t: { recurrent_id: number; echeance: string }) =>
    moment.get(t.recurrent_id) === "matin" && !enRetard(t);
  const ceSoir = urgentes.filter((t) => !duMatinAujourdhui(t));
  const oublieCeMatin = urgentes.filter(duMatinAujourdhui);

  // Une tâche à `fois` > 1 (biberons, dents...) fait autant d'occurrences non faites que de
  // rangs manquants : sans regroupement, le message répète la même ligne plusieurs fois
  // (même défaut que le bot, D-023 étendu). On fusionne par récurrent + échéance, à
  // AFFICHAGE seulement — la coche continue de se faire par occurrence côté bot/app.
  // Miroir de scripts/bot/taches.py::regrouper_pour_affichage.
  type Tache = { titre: string; echeance: string; recurrent_id: number };
  function regrouperPourAffichage(liste: Tache[]) {
    const groupes = new Map<string, { tache: Tache; restantes: number; total: number }>();
    const ordre: string[] = [];
    for (const t of liste) {
      const cle = `${t.recurrent_id}|${t.echeance}`;
      let g = groupes.get(cle);
      if (!g) {
        g = { tache: t, restantes: 0, total: fois.get(t.recurrent_id) ?? 1 };
        groupes.set(cle, g);
        ordre.push(cle);
      }
      g.restantes += 1;
    }
    return ordre.map((cle) => groupes.get(cle)!);
  }

  // Une tâche prévue une seule fois garde son format exact ; à `fois` > 1, un compte
  // « (fait/total) » se glisse avant le marqueur de retard éventuel — même sémantique
  // que scripts/bot/reponses.py::_ligne_tache (fait = total - occurrences restantes).
  const ligne = (g: { tache: Tache; restantes: number; total: number }) => {
    const fait = g.total - g.restantes;
    const compte = g.total > 1 ? ` (${fait}/${g.total})` : "";
    return `• ${g.tache.titre}${compte}${enRetard(g.tache) ? " (en retard)" : ""}`;
  };
  // `ceSoir` peut être vide (tout le retard du jour était au matin) : pas de bloc « ce
  // soir » creux dans ce cas, on ouvre direct sur ce qui reste réellement à dire.
  const blocs: string[] = [];
  if (ceSoir.length > 0) {
    blocs.push(`MaxHome — à faire avant ce soir :\n${regrouperPourAffichage(ceSoir).map(ligne).join("\n")}`);
  }
  if (oublieCeMatin.length > 0) {
    const titreBloc = ceSoir.length > 0 ? "Pas fait ce matin" : "MaxHome — pas fait ce matin";
    blocs.push(`${titreBloc} :\n${regrouperPourAffichage(oublieCeMatin).map(ligne).join("\n")}`);
  }
  const texte = `${blocs.join("\n\n")}\n\nRéponds « fait <titre> » pour cocher.`;

  const rep = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texte }),
  });
  if (!rep.ok) throw new Error(`Telegram : ${rep.status} ${await rep.text()}`);
  return new Response(`envoyé (${urgentes.length} tâches)`, { status: 200 });
});
