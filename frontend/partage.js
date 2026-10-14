// Page partagée d'un voyage : lit ?j=<jeton>, appelle la fonction SQL `voyage_partage` avec la clé
// publique (aucune session), rend la fiche en lecture seule (agenda/partage-page.js) puis la météo.
import { creerApi } from "./socle/api.js";
import { rendrePagePartage, brancherPagePartage } from "./agenda/partage-page.js";
import { rendrePlanning } from "./agenda/fiche-planning.js";
import { rendreCarteVoyage } from "./agenda/ui-fiche-carte.js";
import { chargerMeteo } from "./agenda/meteo.js";
import { jourIso } from "./agenda/calendrier.js";
import { txt } from "./socle/ui-base.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const racine = document.getElementById("partage");
const message = (classe, texte) => { racine.innerHTML = `<p class="vide ${classe}">${txt(texte)}</p>`; };

async function charger(jeton) {
  const api = creerApi(supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
  return api.voyagePartage(jeton);
}

/** La météo arrive après coup : jamais bloquante, la cause d'un échec reste dans la console. */
async function ajouterMeteo(donnees) {
  try {
    const meteo = await chargerMeteo(donnees.voyage, donnees.lieux, donnees.resas, jourIso(new Date()));
    const zone = document.getElementById("partage-planning-corps");
    if (zone) zone.innerHTML = rendrePlanning(donnees.voyage, donnees.lieux, donnees.resas, meteo);
  } catch (e) { console.error("météo de la page partagée", e); }
}

async function demarrer() {
  const jeton = new URLSearchParams(location.search).get("j") ?? "";
  // Un texte qui n'est pas un uuid fait échouer la base (22P02) : même message qu'un jeton inconnu.
  const donnees = UUID.test(jeton) ? await charger(jeton) : null;
  if (!donnees) { message("partage-invalide", "Ce lien de partage n'est plus valable."); return; }
  document.title = donnees.voyage.titre;
  racine.innerHTML = rendrePagePartage(donnees, null, { aujourdhui: jourIso(new Date()) });
  brancherPagePartage(document, (cle) => { if (cle === "carte") rendreCarteVoyage("#partage-carte-corps", donnees.lieux, donnees.resas); });
  ajouterMeteo(donnees);
}

demarrer().catch((e) => {
  console.error("page partagée", e);
  message("partage-erreur", "Impossible de charger ce carnet pour l'instant. Réessaie dans un instant.");
});
