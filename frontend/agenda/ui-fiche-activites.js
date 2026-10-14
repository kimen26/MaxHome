// Onglet « Activités » de la fiche voyage V3 : branche le rendu pur (fiche-activites.js) sur les
// actions d'une carte dépliée — choix de statut (Possible / Acté écrivent `lieu.statut`, Payé
// ouvre le formulaire de résa pré-rempli et lié au lieu), choix du jour, Modifier (formulaire de
// lieu existant), « + Lieu », localisation en lot, copie du code. Écriture = `ecrireOptimiste`.

import { $, toast, copier } from "../socle/ui-base.js";
import { creerFileEcritures } from "../socle/blocs.js";
import { ecrireOptimiste } from "../socle/blocs-optimiste.js";
import { resaDuLieu } from "./carnet.js";
import { statutLieu } from "./planning.js";
import { rendreActivites } from "./fiche-activites.js";
import { MOT_STATUT } from "./fiche-statuts.js";
import { formulaireLieu, ecarterLieu, retirerLieu } from "./ui-fiche-lieu-form.js";
import { chercherLieu } from "./geocode.js";

const STATUT_EN_BASE = { possible: "idee", acte: "prevu" };
const TYPE_RESA_DU_LIEU = { logement: "logement", resto: "repas" };

export function creerFicheActivites(api, etat, cb, { voyage, lieux, resas, rendreTout, revenirALaFiche, ouvrirResa }) {
  const file = creerFileEcritures();
  const ouvertes = new Set();
  let ecartesOuverts = false;
  let photos = { cle: null, urls: {} }; // un seul appel groupé, invalidé quand la liste des chemins change

  const lieuDe = (id) => lieux().find((l) => l.id === Number(id));
  const ecrireLieu = (lieu, champs, message) =>
    ecrireOptimiste({ el: lieu, champs, ecrire: api.majLieu, rendre: rendreTout, file, echec: cb.echec, message });

  function rendreSansPhotos() {
    const racine = $("#fiche-lieux-corps");
    if (!racine) return;
    racine.innerHTML = rendreActivites(voyage(), lieux(), resas(), { ouvertes, photos: photos.urls, ecartesOuverts });
    brancher(racine);
  }

  /** URLs signées de toutes les photos en un appel ; hors ligne, les cartes restent sans photo. */
  async function rendre() {
    rendreSansPhotos();
    const chemins = [...new Set(lieux().map((l) => l.photo_chemin).filter(Boolean))].sort();
    const cle = chemins.join("|");
    if (cle === photos.cle) return;
    try { photos = { cle, urls: chemins.length ? await api.urlsPhotos(chemins) : {} }; }
    catch (e) { console.error("urlsPhotos", e); photos = { cle, urls: {} }; }
    rendreSansPhotos();
  }

  function brancher(racine) {
    for (const d of racine.querySelectorAll("details[data-lieu]")) {
      d.addEventListener("toggle", () => (d.open ? ouvertes.add(Number(d.dataset.lieu)) : ouvertes.delete(Number(d.dataset.lieu))));
    }
    racine.querySelector("[data-repli-ecartes]")?.addEventListener("toggle", (e) => { ecartesOuverts = e.target.open; });
    for (const b of racine.querySelectorAll("[data-choix-statut]")) {
      b.addEventListener("click", () => choisirStatut(lieuDe(b.dataset.choixStatut), b.dataset.statut));
    }
    for (const s of racine.querySelectorAll("[data-choisir-jour]")) {
      s.addEventListener("change", () => ecrireLieu(lieuDe(s.dataset.choisirJour), { jour: s.value || null }, "Jour enregistré."));
    }
    for (const b of racine.querySelectorAll("[data-copier-code]")) b.addEventListener("click", () => copier(b.dataset.copierCode));
    for (const b of racine.querySelectorAll("[data-modifier-lieu]")) b.addEventListener("click", () => ouvrirFormulaire(lieuDe(b.dataset.modifierLieu)));
    racine.querySelector("[data-nouveau-lieu]")?.addEventListener("click", () => ouvrirFormulaire(null));
    racine.querySelector("[data-localiser-tous]")?.addEventListener("click", localiserTous);
  }

  function choisirStatut(lieu, statut) {
    if (!lieu || statut === statutLieu(lieu, resas())) return;
    if (statut === "paye") return payer(lieu);
    return ecrireLieu(lieu, { statut: STATUT_EN_BASE[statut] }, `${lieu.nom} : ${MOT_STATUT[statut]}.`);
  }

  /** « Payé » : le formulaire de résa existant, lié au lieu — celui de sa résa à réserver s'il y en a une. */
  function payer(lieu) {
    const resa = resaDuLieu(lieu, resas());
    if (resa) return ouvrirResa(resa, { reserver: true });
    return ouvrirResa(null, { reserver: true, valeurs: {
      type: TYPE_RESA_DU_LIEU[lieu.categorie] ?? "activite", titre: lieu.nom, lieu_id: lieu.id,
      debut: lieu.jour ? `${lieu.jour}T00:00` : null,
    } });
  }

  function ouvrirFormulaire(l) {
    formulaireLieu(api, etat, cb, {
      voyage, l, ecarterLieu: (lieu) => ecarterLieu(api, cb, lieu), retirerLieu: (lieu) => retirerLieu(api, cb, lieu),
      revenirALaFiche,
    });
  }

  /** Localise un par un (geocode.js sérialise la file) chaque lieu sans position ; un lieu introuvable
   *  n'arrête pas les suivants, une erreur réseau est journalisée. */
  async function localiserTous() {
    const cibles = lieux().filter((l) => l.lat == null && l.statut !== "ecarte");
    if (!cibles.length) return;
    toast(`Recherche de ${cibles.length} position(s)…`);
    let trouves = 0;
    for (const l of cibles) {
      try {
        const [premier] = await chercherLieu(voyage().lieu ? `${l.nom}, ${voyage().lieu}` : l.nom);
        if (!premier) continue;
        await api.majLieu(l.id, { lat: premier.lat, lng: premier.lng, adresse: premier.nom });
        Object.assign(l, { lat: premier.lat, lng: premier.lng, adresse: premier.nom });
        trouves++;
      } catch (e) { console.error("localisation", l.nom, e); }
    }
    rendreTout();
    toast(trouves ? `${trouves} lieu(x) localisé(s).` : "Aucune position trouvée.");
  }

  return { rendre };
}
