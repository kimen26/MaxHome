// Écran « Garder le lien » : bandeau des anniversaires (30 jours), proches à relancer en tête,
// puis les autres, et « + Ajouter un proche ». Le calcul (qui relancer, quels anniversaires)
// vient de relances.js, partagé avec le bot. Le cycle ouvrir/enregistrer/retirer vient de
// blocs-reglages (D-024) ; la feuille d'un proche vit dans ui-lien-feuille.js.

import { txt } from "../socle/ui-base.js";
import { carteListe, titreSection } from "../socle/blocs.js";
import { creerReglages } from "../socle/blocs-reglages.js";
import { jourIso, nbJours } from "../agenda/calendrier.js";
import { aRelancer, anniversaires, dernierContact } from "./relances.js";
import { creerFeuilleProche } from "./ui-lien-feuille.js";
import { QUI, libelleRythme, texteAnniversaire, texteDernier, texteRelance } from "./lien.js";

export const HORIZON_ANNIVERSAIRES = 30; // jours annoncés dans le bandeau
const LIBELLE_QUI = Object.fromEntries(QUI);

/** Ligne d'un proche : un seul bouton pleine largeur (ouvre sa feuille), jamais la couleur seule :
 *  l'urgence est dite en mots (« sans nouvelles »). */
const ligneProche = (p, sous, urgent) => `<button type="button" class="pr-proche${urgent ? " a-relancer" : ""}" data-modifier="${p.id}">
  <span class="pr-proche-corps"><span class="pr-proche-nom">${txt(p.prenom)}</span>
  <span class="pr-proche-sous">${txt(sous)}</span></span>
  <span class="pastille">${txt(LIBELLE_QUI[p.qui] ?? p.qui)}</span></button>`;

const depuis = (proche, echanges, aujourdhui) => nbJours(dernierContact(proche, echanges) ?? aujourdhui, aujourdhui) - 1;

/** Bandeau : une phrase par anniversaire à venir. */
function htmlAnniversaires(proches, echanges, aujourdhui) {
  const liste = anniversaires(proches, aujourdhui, HORIZON_ANNIVERSAIRES);
  if (!liste.length) return "";
  const nom = (id) => proches.find((p) => p.id === id)?.prenom ?? "";
  return `<div class="carte pr-anniversaires" role="region" aria-label="Anniversaires à venir"><h3 class="pr-titre">Anniversaires à venir</h3>
    <ul>${liste.map((a) => `<li>${txt(texteAnniversaire(a, nom(a.id)))}</li>`).join("")}</ul></div>`;
}

export function htmlListeProches(proches, echanges, aujourdhui) {
  if (!proches.length) return `<p class="vide">Aucun proche pour l'instant. Ajoutez ceux à qui vous voulez écrire de temps en temps.</p>`;
  const relances = aRelancer(proches, echanges, aujourdhui);
  const urgents = new Set(relances.map((r) => r.id));
  const parId = (id) => proches.find((p) => p.id === id);
  const lignesRelance = relances.map((r) => ligneProche(parId(r.id), texteRelance(r, parId(r.id).rythme_jours), true));
  const lignesAutres = proches.filter((p) => !urgents.has(p.id))
    .sort((a, b) => a.prenom.localeCompare(b.prenom, "fr"))
    .map((p) => ligneProche(p, `${texteDernier(depuis(p, echanges, aujourdhui))} · ${libelleRythme(p.rythme_jours)}`, false));
  return htmlAnniversaires(proches, echanges, aujourdhui)
    + (lignesRelance.length ? titreSection("À relancer") + carteListe(lignesRelance, "") : "")
    + (lignesAutres.length ? titreSection(lignesRelance.length ? "Les autres" : "Nos proches") + carteListe(lignesAutres, "") : "");
}

export function creerUiLien(api, etat, cb) {
  // `reglages` n'existe qu'après la feuille, qui a besoin de `reglages.rendre` : indirection.
  const feuille = creerFeuilleProche(api, etat, cb, { rendreListe: () => reglages.rendre() });
  const reglages = creerReglages({
    liste: "#liste-proches", bouton: "#form-proche",
    libelleNouveau: "+ Ajouter un proche",
    elements: () => etat.proches,
    htmlListe: () => htmlListeProches(etat.proches, etat.echanges, jourIso(new Date())),
    titreForm: (p) => (p ? p.prenom : "Ajouter un proche"),
    htmlForm: feuille.html, apresOuverture: feuille.apresOuverture, champs: feuille.champs,
    retirerDansFeuille: true,
    confirmerRetrait: (p) => `Retirer ${p.prenom} ? Ses échanges seront supprimés.`,
    messageRetrait: "Proche retiré.",
    api: {
      creer: async (valeurs) => { etat.proches = [...etat.proches, await api.creerProche(valeurs)]; },
      maj: (id, valeurs) => api.majProche(id, valeurs),
      retirer: async (p) => {
        await api.supprimerProche(p.id);
        etat.proches = etat.proches.filter((x) => x.id !== p.id);
        etat.echanges = etat.echanges.filter((e) => e.proche_id !== p.id);
      },
    },
    echec: cb.echec,
  });
  return { rendre: reglages.rendre };
}
