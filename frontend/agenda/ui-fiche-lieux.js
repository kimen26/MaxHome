// Section « Lieux » de la fiche voyage : « Au programme » (par jour) puis « Idées à piocher »
// et « Écartés » repliables (fermés par défaut) — fiches visuelles (photo ou bandeau de
// catégorie, topo, horaires, notes, badge Réservé). Brief carnet-voyage.md, lot « fiches
// visuelles » : remplace la ligne plate par des cartes, cf. ui-fiche-lieu-carte.js (rendu d'une
// carte) et ui-fiche-lieu-form.js (formulaire + recherche Nominatim), chacun < 300 lignes.

import { $, txt, toast } from "../socle/ui-base.js";
import { titreSection } from "../socle/blocs.js";
import { CATEGORIES_LIEU, sectionsLieux } from "./carnet.js";
import { carteLieu } from "./ui-fiche-lieu-carte.js";
import { formulaireLieu, ecarterLieu as ecarterLieuAction, retirerLieu as retirerLieuAction } from "./ui-fiche-lieu-form.js";
import { chercherLieu } from "./geocode.js";

const CYCLE_STATUT = { idee: "prevu", prevu: "fait", fait: "idee" };
const LIBELLE_STATUT = { idee: "Idée", prevu: "Prévu", fait: "Fait", ecarte: "Écarté" };

export function creerFicheLieux(api, etat, cb, { voyage, lieux, resas, rafraichir, revenirALaFiche }) {
  let ideesDepliees = false;
  let ecartesDeplies = false;
  // Évite de rappeler urlsPhotos à chaque frappe/tap : clé = chemins triés joints, invalidée
  // dès que la liste de chemins visibles change (nouvelle photo, lieu retiré…).
  let urlsPhotosCache = { cle: null, urls: {} };

  /** `jourIso` : null pour « Sans date » (groupe du programme), ou une date pour l'en-tête de
   *  jour existant (même format que ui-fiche-lieux.js d'origine). */
  function formatJour(iso) {
    if (!iso) return "Sans date";
    const texte = new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    // `toLocaleDateString` rend déjà tout en minuscules en fr-FR : seule la toute première
    // lettre doit être en majuscule (relecture carnet-voyage §H).
    return texte.charAt(0).toUpperCase() + texte.slice(1);
  }

  function groupeProgramme(g) {
    return `<div class="lieux-groupe">
      <h4 class="lieux-groupe-titre">${txt(formatJour(g.jour))}</h4>
      <div class="lieux-grille-cartes">${g.lieux.map((l) => rendreCarte(l)).join("")}</div>
    </div>`;
  }

  function groupeCategorie(g, libelleCategorie) {
    return `<div class="lieux-groupe">
      <h4 class="lieux-groupe-titre">${txt(libelleCategorie)}</h4>
      <div class="lieux-grille-cartes">${g.lieux.map((l) => rendreCarte(l)).join("")}</div>
    </div>`;
  }

  function rendreCarte(l) {
    return carteLieu(l, resas(), l.photo_chemin ? urlsPhotosCache.urls[l.photo_chemin] ?? null : null);
  }

  function blocRepliable({ attr, titre, n, deplie, contenu }) {
    if (!n) return "";
    return `<div class="lieux-repli" data-repli="${attr}">
      <button type="button" class="ct-entete" data-plier-${attr} aria-expanded="${deplie}">
        <span>${txt(titre)} (${n})</span><span class="ct-voir">${deplie ? "Replier" : "Voir"}</span>
      </button>
      <div${deplie ? "" : " hidden"}>${contenu}</div>
    </div>`;
  }

  function html() {
    const { programme, idees, ecartes } = sectionsLieux(lieux(), resas());
    const sansPositionCount = lieux().filter((l) => l.lat == null && l.statut !== "ecarte").length;
    const nIdees = idees.reduce((n, g) => n + g.lieux.length, 0);
    return `<div class="fiche-lieux">
      ${titreSection("Lieux")}
      ${programme.length ? programme.map(groupeProgramme).join("")
        : `<p class="vide">Aucun lieu au programme pour l'instant.</p>`}
      ${blocRepliable({
        attr: "idees", titre: "Idées à piocher", n: nIdees, deplie: ideesDepliees,
        contenu: idees.map((g) => groupeCategorie(g, libelleCategorieDe(g.categorie))).join(""),
      })}
      ${blocRepliable({
        attr: "ecartes", titre: "Écartés", n: ecartes.length, deplie: ecartesDeplies,
        contenu: `<div class="lieux-grille-cartes">${ecartes.map((l) => rendreCarte(l)).join("")}</div>`,
      })}
      ${sansPositionCount ? `<button type="button" class="btn-lien" data-localiser-tous>Localiser les ${sansPositionCount} lieux sans position</button>` : ""}
      <button type="button" class="btn btn-tirets" data-nouveau-lieu>+ Lieu</button>
    </div>`;
  }

  function libelleCategorieDe(valeur) {
    return CATEGORIES_LIEU.find((c) => c.valeur === valeur)?.libelle ?? valeur;
  }

  /** Charge les URLs signées de toutes les photos visibles EN UN SEUL appel (brief point 4),
   *  puis re-rend — en cas d'échec (hors ligne), les cartes gardent leur bandeau de catégorie,
   *  la section ne casse pas. */
  async function chargerPhotosEtRendre() {
    const chemins = [...new Set(lieux().map((l) => l.photo_chemin).filter(Boolean))].sort();
    const cle = chemins.join("|");
    if (cle !== urlsPhotosCache.cle) {
      try { urlsPhotosCache = { cle, urls: await api.urlsPhotos(chemins) }; }
      catch (e) { console.error("urlsPhotos", e); urlsPhotosCache = { cle, urls: {} }; }
    }
    rendreSansPhotos();
  }

  function rendreSansPhotos() {
    $("#fiche-lieux-corps").innerHTML = html();
    brancher();
  }

  function rendre() {
    rendreSansPhotos();
    chargerPhotosEtRendre();
  }

  function brancher() {
    const racine = $("#fiche-lieux-corps");
    for (const b of racine.querySelectorAll("[data-statut]")) {
      b.addEventListener("click", () => basculerStatut(Number(b.dataset.statut)));
    }
    for (const el of racine.querySelectorAll("[data-lieu]")) {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-statut], a, button")) return; // tap hors boutons/liens
        ouvrirFormulaire(lieux().find((l) => l.id === Number(el.dataset.lieu)));
      });
    }
    racine.querySelector("[data-nouveau-lieu]").addEventListener("click", () => ouvrirFormulaire(null));
    racine.querySelector("[data-localiser-tous]")?.addEventListener("click", localiserTous);
    racine.querySelector("[data-plier-idees]")?.addEventListener("click", () => { ideesDepliees = !ideesDepliees; rendreSansPhotos(); });
    racine.querySelector("[data-plier-ecartes]")?.addEventListener("click", () => { ecartesDeplies = !ecartesDeplies; rendreSansPhotos(); });
  }

  /** Optimiste, avec rollback : le tap doit répondre tout de suite (D-024 esprit), mais reste
   *  cohérent si l'écriture échoue — pas de creerCheckList ici (pensé pour un aside PC que
   *  cette fiche n'a pas), donc un petit cycle local, comme ui-charge-feuille.js. */
  async function basculerStatut(id) {
    const l = lieux().find((x) => x.id === id);
    if (!l) return;
    const avant = l.statut;
    l.statut = CYCLE_STATUT[l.statut] ?? "idee";
    rendreSansPhotos();
    try {
      await api.majLieu(id, { statut: l.statut });
      toast(`${l.nom} : ${LIBELLE_STATUT[l.statut]}.`);
    } catch (e) {
      l.statut = avant;
      rendreSansPhotos();
      cb.echec(e);
    }
  }

  function ouvrirFormulaire(l) {
    formulaireLieu(api, etat, cb, {
      voyage, l,
      ecarterLieu: (lieu) => ecarterLieuAction(api, cb, lieu),
      retirerLieu: (lieu) => retirerLieuAction(api, cb, lieu),
      revenirALaFiche,
    });
  }

  /** Localise, un par un (la file de geocode.js sérialise déjà), chaque lieu sans position ;
   *  écrit la première proposition trouvée, laisse les autres « à localiser » sans erreur
   *  bloquante (une adresse introuvable pour un lieu ne doit pas arrêter les suivants). */
  async function localiserTous() {
    const cibles = lieux().filter((l) => l.lat == null && l.statut !== "ecarte");
    if (!cibles.length) return;
    toast(`Recherche de ${cibles.length} position(s)…`);
    let trouves = 0;
    for (const l of cibles) {
      try {
        const requete = voyage().lieu ? `${l.nom}, ${voyage().lieu}` : l.nom;
        const [premier] = await chercherLieu(requete);
        if (premier) {
          await api.majLieu(l.id, { lat: premier.lat, lng: premier.lng, adresse: premier.nom });
          l.lat = premier.lat; l.lng = premier.lng; l.adresse = premier.nom;
          trouves++;
        }
      } catch (e) { console.error("localisation", l.nom, e); }
    }
    rendreSansPhotos();
    toast(trouves ? `${trouves} lieu(x) localisé(s).` : "Aucune position trouvée.");
  }

  return { rendre };
}
