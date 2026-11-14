// Page publique d'un sondage de date : lit ?j=<jeton>, appelle sondage_public (clé anon, aucune session),
// envoie le vote à l'Edge Function sondage-voter. Le rendu pur est dans proches/sondage-page.js.
import { rendreSondage, basculer, garderLibres, peutEnvoyer, prenomNettoye } from "./proches/sondage-page.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MSG_ECHEC = "Ça n'a pas marché, réessaie dans un instant.";
const racine = document.getElementById("sondage");
const jeton = new URLSearchParams(location.search).get("j") ?? "";
const cleLocale = `maxhome-sondage-${jeton}`;
let donnees = null;
let etat = { selection: [], prenom: "", envoye: false, envoi: false, erreur: "" };
let client = null;

/** Dernier vote de l'invité : simple confort, jamais bloquant. */
function lireVoteLocal() {
  try { return JSON.parse(localStorage.getItem(cleLocale)) ?? null; } catch { return null; }
}
function garderVoteLocal(vote) {
  try { localStorage.setItem(cleLocale, JSON.stringify(vote)); } catch { /* navigation privée : on s'en passe */ }
}

const afficher = () => { racine.innerHTML = rendreSondage(donnees, etat); };

/** Phrase d'erreur : le corps JSON d'une réponse non-2xx (400/404/429) se lit dans error.context. */
async function phraseErreur(error) {
  try {
    const corps = await error.context.json();
    if (corps && typeof corps.erreur === "string") return corps.erreur;
  } catch (e) { console.error("corps d'erreur illisible", e); }
  return MSG_ECHEC;
}

async function envoyer() {
  if (!peutEnvoyer(etat.selection, etat.prenom) || etat.envoi) return;
  etat = { ...etat, envoi: true, erreur: "" };
  afficher();
  const { data, error } = await client.functions.invoke("sondage-voter", {
    body: { jeton, prenom: prenomNettoye(etat.prenom), jours: etat.selection },
  });
  if (error || !data?.ok) {
    etat = { ...etat, envoi: false, erreur: error ? await phraseErreur(error) : MSG_ECHEC };
  } else {
    etat = { ...etat, envoi: false, envoye: true, prenom: data.prenom, selection: data.jours };
    garderVoteLocal({ prenom: data.prenom, jours: data.jours });
  }
  afficher();
}

racine.addEventListener("click", (ev) => {
  const jour = ev.target.closest("[data-jour]");
  if (jour) { etat = { ...etat, selection: basculer(etat.selection, jour.dataset.jour, donnees.jours) }; afficher(); return; }
  const action = ev.target.closest("[data-action]")?.dataset.action;
  if (action === "modifier") { etat = { ...etat, envoye: false, erreur: "" }; afficher(); }
});
racine.addEventListener("input", (ev) => {
  if (ev.target.id !== "sd-prenom") return;
  etat = { ...etat, prenom: ev.target.value };
  const bouton = racine.querySelector("[data-action=envoyer]");
  if (bouton) bouton.disabled = !peutEnvoyer(etat.selection, etat.prenom);
});
racine.addEventListener("submit", (ev) => { ev.preventDefault(); envoyer().catch(echec); });

function echec(e) {
  console.error("sondage", e);
  etat = { ...etat, envoi: false, erreur: MSG_ECHEC };
  afficher();
}

async function demarrer() {
  // Un texte qui n'est pas un uuid ferait échouer la base : même message qu'un jeton inconnu.
  if (UUID.test(jeton)) {
    client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await client.rpc("sondage_public", { p_jeton: jeton });
    if (error) throw error;
    donnees = data;
  }
  if (donnees) {
    document.title = donnees.titre;
    const vote = lireVoteLocal();
    if (vote) etat = { ...etat, prenom: vote.prenom ?? "", selection: garderLibres(vote.jours ?? [], donnees.jours) };
  }
  afficher();
}

demarrer().catch((e) => {
  console.error("page sondage", e);
  racine.innerHTML = `<p class="sd-vide sd-erreur">${MSG_ECHEC}</p>`;
});
