// Partage de la fiche voyage (brief fiche-voyage-v3.md, lot 3) : « Partager » dans le bandeau (crée
// le jeton s'il manque, puis feuille de partage du téléphone, sinon copie du lien), et dans Infos
// « Télécharger la page » / « Arrêter le partage ». La page lue par le destinataire est rendue
// ailleurs (partage.js) ; ici seulement les gestes de la fiche connectée.
import { $, txt, toast, confirmer } from "../socle/ui-base.js";
import { filtrerPourPartage } from "./partage-filtre.js";
import { telechargerPage } from "./partage-telecharger.js";

/** `ctx` : voyage(), lieux(), resas(), blocs(), meteo(), rendreTout(), revenirALaFiche(section). */
export function creerFichePartage(api, etat, cb, ctx) {
  let partage = null; // ligne voyage_partages { jeton, … } ou null
  let enCours = false; // un double tap ne crée pas deux jetons (voyage_id est unique)

  const charger = async () => { partage = await api.lirePartage(ctx.voyage().id); };

  /** Dossier de l'app + partage.html : marche sous GitHub Pages (sous-chemin) comme en local. */
  const lienDe = (jeton) => new URL(`partage.html?j=${jeton}`, document.baseURI).href;

  async function envoyer(lien) {
    if (navigator.share) {
      try { await navigator.share({ title: ctx.voyage().titre, url: lien }); }
      catch (e) { if (e.name !== "AbortError") throw e; } // « annuler » dans la feuille n'est pas une erreur
      return;
    }
    await navigator.clipboard.writeText(lien);
    toast("Lien copié");
  }

  async function partager() {
    if (enCours) return;
    enCours = true;
    try {
      const creation = !partage;
      partage ??= await api.creerPartage(ctx.voyage().id, etat.prenom);
      if (creation) ctx.rendreTout(); // « Arrêter le partage » apparaît dès que le lien existe
      await envoyer(lienDe(partage.jeton));
    } catch (e) { cb.echec(e); }
    finally { enCours = false; }
  }

  async function arreter() {
    const oui = await confirmer("Arrêter le partage ? Le lien déjà envoyé ne marchera plus.", { ok: "Arrêter le partage" });
    try {
      if (oui) {
        await api.supprimerPartage(ctx.voyage().id);
        partage = null;
      }
      await ctx.revenirALaFiche("partage"); // la confirmation a pris la feuille : on rouvre la fiche
      if (oui) toast("Partage arrêté");
    } catch (e) { cb.echec(e); }
  }

  async function telecharger() {
    try {
      await telechargerPage(filtrerPourPartage(ctx.voyage(), ctx.lieux(), ctx.resas(), ctx.blocs()), ctx.meteo());
      toast("Page téléchargée");
    } catch (e) { cb.echec(e); }
  }

  function html() {
    const etatTexte = partage
      ? "Ce voyage est partagé par un lien, en lecture seule."
      : "Pas encore partagé : le bouton Partager du bandeau crée un lien, en lecture seule.";
    return `<div class="fv-partage">
      <h3 class="fv-groupe-t">Partage</h3>
      <p class="fv-aide">${txt(etatTexte)} Sans codes de réservation, prix, ni notes.</p>
      <button type="button" class="btn" data-telecharger-page>Télécharger la page</button>
      ${partage ? `<button type="button" class="btn btn-rouge" data-arreter-partage>Arrêter le partage</button>` : ""}
    </div>`;
  }

  function rendre() {
    $("#feuille-corps [data-partager]")?.addEventListener("click", partager);
    const zone = $("#fiche-partage-corps");
    if (!zone) return;
    zone.innerHTML = html();
    zone.querySelector("[data-telecharger-page]").addEventListener("click", telecharger);
    zone.querySelector("[data-arreter-partage]")?.addEventListener("click", arreter);
  }

  return { charger, rendre };
}
