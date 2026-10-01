// Edge Function : rappel Telegram le 1er et le 5 du mois — reste à faire comme l'app (D-046,
// D-048) : les virements groupés par trajet (non faits), puis les lignes de charge à valider.
// Nom conservé (« rappel-virements ») : il est câblé dans pg_cron et scripts/deploy_rappels.py.
// Planifiée via pg_cron le 1er et le 5 de chaque mois à 09:00 Europe/Paris (voir migration 003).
//
// Regroupement par trajet dupliqué depuis frontend/budget/groupes-virements.js (pas réutilisé
// tel quel : une Edge Function Deno n'a pas de bundler pour un import relatif hors de son
// dossier, seuls les imports https:// passent par esm.sh) — mêmes règles, documentées ici pour
// rester en phase si le frontend change : une ligne de charge compte si son récurrent "charge"
// est actif (compte_vers connu), un mouvement compte s'il n'est PAS en mode "charge" (déjà
// représenté par sa ligne) et a un compte de destination connu. tests/test_agenda.mjs ne couvre
// pas cette fonction (pas de runtime Deno dans ce repo — voir le rapport de la tâche).
//
// Secrets requis (Supabase > Project Settings > Edge Functions > Secrets) :
//   MAXHOME_TELEGRAM_BOT_TOKEN, MAXHOME_TELEGRAM_CHAT_ID
// Déployer avec : python scripts/deploy_rappels.py rappel-virements

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function euros(centimes: number): string {
  return (centimes / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

type Compte = { id: number; nom: string; commun: boolean; libelle_virement: string | null; libelle_variable: boolean };
type Charge = { id: number; libelle: string; ponctuel: boolean; actif: boolean };
type Recurrent = { id: number; mode: string; charge_id: number | null; compte_de: number | null; compte_vers: number | null; actif: boolean };
type Ligne = { charge_id: number; montant_centimes: number; fait_le: string | null };
type Mouvement = { id: number; recurrent_id: number | null; titre: string; compte_de: number | null; compte_vers: number | null; montant_centimes: number; qui: string | null; fait_le: string | null; libelle_virement: string | null };

type Groupe = { de: number | string | null; vers: number; libelleVers: string; total: number; nLignes: number; libelleACompleter: boolean };

// Même règle que frontend/budget/libelle-virement.js::libelleACompleter (dupliquée ici : Deno
// n'a pas d'import relatif hors de son dossier, D-049 §4) : un compte variable sans surcharge du
// mois sur AUCUN mouvement du groupe doit encore être complété.
function libelleACompleterPourGroupe(compteVers: Compte | undefined, mouvementsDuGroupe: Mouvement[]): boolean {
  if (!compteVers?.libelle_variable) return false;
  return mouvementsDuGroupe.every((m) => !m.libelle_virement);
}

function nomDuCompte(comptes: Compte[], id: number | null): string {
  if (id == null) return "Commun";
  return comptes.find((c) => c.id === id)?.nom ?? "compte inconnu";
}

function construireGroupesNonFaits(
  charges: Charge[], lignes: Ligne[], recurrents: Recurrent[], mouvements: Mouvement[], comptes: Compte[],
): Groupe[] {
  const groupes = new Map<string, Groupe & { mouvementsVers: Mouvement[] }>();
  const ajouter = (de: number | string | null, vers: number, montant: number, mouvement: Mouvement | null) => {
    const cle = `${de ?? "?"}→${vers}`;
    const g = groupes.get(cle) ?? {
      de, vers, libelleVers: nomDuCompte(comptes, vers), total: 0, nLignes: 0,
      libelleACompleter: false, mouvementsVers: [],
    };
    g.total += montant;
    g.nLignes += 1;
    if (mouvement) g.mouvementsVers.push(mouvement);
    groupes.set(cle, g);
  };

  for (const c of charges) {
    if (c.ponctuel || c.actif === false) continue;
    const recurrent = recurrents.find((r) => r.actif && r.mode === "charge" && r.charge_id === c.id);
    const vers = recurrent?.compte_vers ?? null;
    if (vers == null) continue; // reste sur le commun : rien à virer.
    const l = lignes.find((x) => x.charge_id === c.id);
    if (!l || !l.montant_centimes || l.fait_le) continue; // pas de montant, ou déjà validée.
    // Le mouvement du mois existe en base même si sa case n'est plus celle qui compte ici (sa
    // LIGNE porte la validation visible, D-046) : c'est pourtant lui qui porte la surcharge de
    // libellé du mois (D-050, même piège que L-048 côté app/bot — corrigé ici aussi).
    const mouvement = mouvements.find((m) => m.recurrent_id === recurrent?.id) ?? null;
    ajouter(null, vers, l.montant_centimes, mouvement);
  }

  for (const m of mouvements) {
    const r = recurrents.find((x) => x.id === m.recurrent_id);
    if (r?.mode === "charge") continue; // déjà représenté par sa ligne, ci-dessus.
    if (m.compte_vers == null || m.fait_le) continue;
    ajouter(m.compte_de, m.compte_vers, m.montant_centimes, m);
  }

  return [...groupes.values()].map((g) => {
    const compteVers = comptes.find((c) => c.id === g.vers);
    const { mouvementsVers, ...reste } = g;
    return { ...reste, libelleACompleter: libelleACompleterPourGroupe(compteVers, mouvementsVers) };
  });
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
  const nomMois = MOIS[mois - 1];

  const { data: mouvements, error: eMouv } = await sb
    .from("mouvements").select("id, recurrent_id, titre, compte_de, compte_vers, montant_centimes, qui, fait_le, libelle_virement")
    .eq("annee", annee).eq("mois", mois);
  if (eMouv) throw eMouv;

  // Le 1er du mois, personne n'a encore ouvert l'app : les occurrences n'existent pas. On
  // rappelle alors les récurrents actifs sans montant (il dépend des charges du mois) — inchangé
  // depuis la version précédente de cette fonction.
  if (!mouvements || mouvements.length === 0) {
    const { data: recurrents, error: e2 } = await sb
      .from("mouvements_recurrents").select("titre, qui, jour").eq("actif", true).order("ordre");
    if (e2) throw e2;
    if (!recurrents || recurrents.length === 0) {
      return new Response(`aucun mouvement à faire pour ${nomMois} ${annee}`, { status: 200 });
    }
    const lignesTexte = recurrents.map((r) => `• ${r.titre}${r.jour ? ` (le ${r.jour})` : ""}${r.qui ? ` — ${r.qui}` : ""}`);
    const texteRec = `MaxHome — à faire en ${nomMois} (ouvre l'app pour les montants) :\n${lignesTexte.join("\n")}`;
    return await envoyer(botToken, chatId, texteRec);
  }

  const [{ data: charges, error: eCharges }, { data: lignes, error: eLignes },
         { data: recurrents, error: eRec }, { data: comptes, error: eComptes }] = await Promise.all([
    sb.from("charges").select("id, libelle, ponctuel, actif"),
    sb.from("lignes").select("charge_id, montant_centimes, fait_le").eq("annee", annee).eq("mois", mois),
    sb.from("mouvements_recurrents").select("id, mode, charge_id, compte_de, compte_vers, actif"),
    sb.from("comptes").select("id, nom, commun, libelle_virement, libelle_variable"),
  ]);
  if (eCharges) throw eCharges;
  if (eLignes) throw eLignes;
  if (eRec) throw eRec;
  if (eComptes) throw eComptes;

  const groupes = construireGroupesNonFaits(charges ?? [], lignes ?? [], recurrents ?? [], mouvements, comptes ?? []);
  const lignesTexte: string[] = [];
  if (groupes.length) {
    lignesTexte.push("Virements à faire :");
    for (const g of groupes) {
      const note = g.libelleACompleter ? " — libellé à compléter" : "";
      lignesTexte.push(`• → ${g.libelleVers} : ${euros(g.total)} (${g.nLignes} ligne${g.nLignes > 1 ? "s" : ""})${note}`);
    }
  }

  // Lignes de charge à valider : montant saisi, non ponctuelles, non déjà validées, charge
  // affichée (active, ou terminée qui garde une ligne ce mois — D-043, même règle qu'etat-mois.js).
  const idsCharges = new Set((charges ?? []).filter((c) => !c.ponctuel).map((c) => c.id));
  const aValider = (lignes ?? []).filter((l) => idsCharges.has(l.charge_id) && l.montant_centimes && !l.fait_le);
  if (aValider.length) {
    lignesTexte.push(`${aValider.length} ligne${aValider.length > 1 ? "s" : ""} de charge à valider.`);
  }

  if (!lignesTexte.length) {
    return new Response(`rien à faire pour ${nomMois} ${annee}`, { status: 200 });
  }
  const texte = `MaxHome — reste à faire en ${nomMois} :\n${lignesTexte.join("\n")}`;
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
