// Formulaire lieu (création/édition) : nom, catégorie, jour, topo, horaires, notes, photo,
// recherche de position Nominatim (inchangée). Extrait de ui-fiche-lieux.js pour rester sous
// ~300 lignes par fichier (brief carnet-voyage.md, lot « fiches visuelles »).

import { $, txt, ouvrirFeuille, fermerFeuille, toast, confirmer } from "../socle/ui-base.js";
import { choixDetaille } from "../socle/blocs.js";
import { champ, select, zone, lire } from "../socle/blocs-form.js";
import { CATEGORIES_LIEU } from "./carnet.js";
import { chercherLieu } from "./geocode.js";

const SANS_POSITION = "__sans_position__";
const DEBOUNCE_RECHERCHE_MS = 1100;

/** Titre court d'un résultat Nominatim (première composante de `display_name`, ex. « Aquarium
 *  de Trouville ») ; le nom complet reste affiché en détail (relecture carnet-voyage §C : on
 *  ne comprenait pas qu'il fallait choisir parmi des champs de saisie — `choixDetaille` du
 *  socle rend le choix explicite, titre court + adresse complète dessous). */
const titreCourt = (nomComplet) => nomComplet.split(",")[0].trim();

/**
 * Ouvre la feuille d'édition/création d'un lieu `l` (null = création). `api`/`etat`/`cb` comme
 * les autres sous-écrans ; `voyage()` pour les bornes de date et l'indice de géocodage ;
 * `ecarterLieu`/`retirerLieu` (actions déjà résolues par l'appelant, ui-fiche-lieux.js) et
 * `revenirALaFiche` fournis par l'appelant.
 */
export function formulaireLieu(api, etat, cb, { voyage, l, ecarterLieu, retirerLieu, revenirALaFiche }) {
  const photoActuelle = l?.photo_chemin ?? null;
  let photoARetirer = false; // « Retirer la photo » tant que rien n'est encore enregistré
  ouvrirFeuille(`<form class="pile" data-form-lieu>
    <h2>${l ? "Modifier le lieu" : "Nouveau lieu"}</h2>
    ${champ("nom", "Nom", { valeur: l?.nom, requis: true, placeholder: "ex. Musée du Prado" })}
    ${select("categorie", "Catégorie", CATEGORIES_LIEU.map((c) => [c.valeur, c.libelle]), l?.categorie ?? "a_voir")}
    ${champ("jour", "Jour (optionnel)", { type: "date", valeur: l?.jour, attrs: `min="${voyage().debut}" max="${voyage().fin}"` })}
    ${zone("topo", "Ce qu'on y voit / fait", l?.topo, { lignes: 3 })}
    ${champ("horaires", "Horaires", { valeur: l?.horaires, placeholder: "ex. 10h-18h, fermé lundi" })}
    ${zone("note", "Nos notes", l?.note, { lignes: 2 })}
    ${champ("lien", "Site (optionnel)", { type: "url", valeur: l?.lien, placeholder: "https://…" })}
    <div class="lieu-photo">
      <span class="lieu-position-titre">Photo</span>
      <div id="lieu-photo-apercu">${photoActuelle ? `<p class="sous">Photo actuelle conservée sauf changement ci-dessous.</p>` : `<p class="sous">Pas encore de photo.</p>`}</div>
      <label>Ajouter / remplacer <input class="champ" type="file" name="photo" accept="image/*"></label>
      ${photoActuelle ? `<button type="button" class="btn-lien" data-retirer-photo>Retirer la photo</button>` : ""}
    </div>
    <div class="lieu-position">
      <span class="lieu-position-titre">Où est-ce ?</span>
      <button type="button" class="btn-lien lieu-position-chercher" data-chercher-position>Chercher une position</button>
      <div id="lieu-position-etat" class="sous">${l?.lat != null ? `Position choisie : ${txt(l.adresse ?? "")}` : "Pas encore de position."}</div>
      <div id="lieu-resultats-recherche"></div>
    </div>
    <div class="detail-actions">
      ${l && l.statut !== "ecarte" ? `<button type="button" class="btn-lien" data-ecarter-lieu>Écarter</button>` : ""}
      ${l ? `<button type="button" class="btn-lien" data-retirer-lieu>Retirer</button>` : ""}
      <button type="submit" class="btn btn-bleu grandir">${l ? "Enregistrer" : "Ajouter"}</button>
    </div>
  </form>`, { onFermer: revenirALaFiche });
  let position = l?.lat != null ? { lat: l.lat, lng: l.lng, adresse: l.adresse } : null;
  const form = $("#feuille-corps [data-form-lieu]");
  // Vignette de la photo actuelle, en tâche à part (jamais bloquant pour l'ouverture de la
  // feuille) : un échec (hors ligne) garde simplement le texte déjà posé ci-dessus.
  if (photoActuelle) {
    api.urlsPhotos([photoActuelle]).then((urls) => {
      const url = urls[photoActuelle];
      if (url) $("#lieu-photo-apercu").innerHTML = `<img src="${txt(url)}" alt="Photo actuelle" class="lieu-photo-vignette">`;
    }).catch((e) => console.error("urlsPhotos (aperçu)", e));
  }
  // Jeton de course, posé sur le form lui-même (relu par jetonCourant()) : seule la réponse
  // de la DERNIÈRE recherche lancée peut écrire son résultat — geocode.js sérialise déjà les
  // appels réseau, mais une frappe pendant qu'une recherche précédente est encore en vol ne
  // doit jamais laisser une réponse périmée remplacer des résultats plus récents (relecture
  // §C : un seul appel en vol).
  let minuteurDebounce = null;
  const lancerRecherche = () => {
    form.dataset.jetonRecherche = String(jetonCourant(form) + 1);
    chercherPosition(form, cb, voyage, (p) => { position = p; }, jetonCourant(form));
  };

  form.querySelector("[data-ecarter-lieu]")?.addEventListener("click", () => ecarterLieu(l));
  form.querySelector("[data-retirer-lieu]")?.addEventListener("click", () => retirerLieu(l));
  form.querySelector("[data-retirer-photo]")?.addEventListener("click", () => {
    photoARetirer = true;
    form.elements.photo.value = "";
    $("#lieu-photo-apercu").innerHTML = `<p class="sous">Photo retirée à l'enregistrement.</p>`;
  });
  form.elements.photo.addEventListener("change", () => { if (form.elements.photo.files[0]) photoARetirer = false; });
  form.querySelector("[data-chercher-position]").addEventListener("click", () => {
    clearTimeout(minuteurDebounce);
    lancerRecherche();
  });
  // Recherche automatique à la saisie du nom : debounce ≥ 1,1 s (relecture §C), pour ne pas
  // partir à chaque frappe. Le bouton ci-dessus reste utilisable pour relancer tout de suite.
  form.elements.nom.addEventListener("input", () => {
    clearTimeout(minuteurDebounce);
    minuteurDebounce = setTimeout(lancerRecherche, DEBOUNCE_RECHERCHE_MS);
  });
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    clearTimeout(minuteurDebounce);
    const v = lire(form);
    if (!v.nom) { toast("Le nom est obligatoire."); return; }
    const champs = {
      nom: v.nom, categorie: v.categorie, jour: v.jour || null, topo: v.topo, horaires: v.horaires,
      note: v.note, lien: v.lien, lat: position?.lat ?? null, lng: position?.lng ?? null, adresse: position?.adresse ?? null,
    };
    const fichierPhoto = form.elements.photo.files[0] ?? null;
    try {
      // La photo s'envoie APRÈS création/mise à jour du lieu (brief point 5) : il faut son id.
      const lieuEcrit = l ? await api.majLieu(l.id, champs).then(() => ({ ...l, ...champs })) : await api.creerLieu({ ...champs, voyage_id: voyage().id, statut: "idee", cree_par: etat.prenom });
      if (fichierPhoto) await api.deposerPhotoLieu(lieuEcrit, fichierPhoto);
      else if (photoARetirer && photoActuelle) await api.retirerPhotoLieu(lieuEcrit);
      fermerFeuille(); // déclenche onFermer -> revenirALaFiche (rafraîchit + scroll Lieux)
      toast(l ? "Lieu enregistré." : "Lieu ajouté.");
    } catch (e) { cb.echec(e); }
  });
}

/** Compteur de course exposé sur le formulaire lui-même : évite un état de fermeture
 *  supplémentaire à faire voyager entre `formulaireLieu` et `chercherPosition`. */
function jetonCourant(form) { return form.dataset.jetonRecherche ? Number(form.dataset.jetonRecherche) : 0; }

/** Cherche via Nominatim (`nom, lieu du voyage`), affiche jusqu'à 5 résultats + « Sans
 *  position » dans un `choixDetaille` du socle (titre = nom court, détail = adresse
 *  complète) : le premier résultat est pré-sélectionné, l'utilisateur peut en choisir un
 *  autre ou « Sans position » d'un tap. `jeton` identifie cet appel : si une recherche plus
 *  récente a été lancée entre-temps (debounce ou nouveau tap sur le bouton), sa réponse est
 *  ignorée — un seul résultat de recherche peut écrire l'écran (relecture §C). */
async function chercherPosition(form, cb, voyage, poserPosition, jeton) {
  const nom = form.elements.nom.value.trim();
  const conteneur = form.querySelector("#lieu-resultats-recherche");
  const etatEl = form.querySelector("#lieu-position-etat");
  if (!nom) { etatEl.textContent = "Indique d'abord un nom."; conteneur.innerHTML = ""; return; }
  etatEl.textContent = "Recherche en cours…";
  conteneur.innerHTML = "";
  const requete = voyage().lieu ? `${nom}, ${voyage().lieu}` : nom;
  let resultats;
  try {
    resultats = await chercherLieu(requete);
  } catch (e) {
    if (jeton !== jetonCourant(form)) return;
    etatEl.textContent = "Recherche impossible (hors ligne ?).";
    cb.echec(e);
    return;
  }
  if (jeton !== jetonCourant(form)) return; // une recherche plus récente a déjà répondu ou est en vol
  if (!resultats.length) { etatEl.textContent = "Aucun résultat."; return; }
  etatEl.textContent = "";
  const options = [
    ...resultats.map((r, i) => ({ valeur: String(i), titre: titreCourt(r.nom), detail: r.nom })),
    { valeur: SANS_POSITION, titre: "Sans position", detail: "On la cherchera plus tard." },
  ];
  // Premier résultat pré-sélectionné : la position est posée tout de suite, sans attendre un
  // tap (relecture §C) — un tap sur une autre option la remplace, « Sans position » l'efface.
  poserPosition({ lat: resultats[0].lat, lng: resultats[0].lng, adresse: resultats[0].nom });
  conteneur.innerHTML = choixDetaille(options, "0", { attr: "resultat", etiquette: "Où est-ce ?", colonne: true });
  conteneur.querySelectorAll("[data-resultat]").forEach((b) => {
    b.addEventListener("click", () => {
      for (const autre of conteneur.querySelectorAll("[data-resultat]")) {
        autre.classList.toggle("actif", autre === b);
        autre.setAttribute("aria-checked", String(autre === b));
      }
      const v = b.dataset.resultat;
      if (v === SANS_POSITION) { poserPosition(null); return; }
      const r = resultats[Number(v)];
      poserPosition({ lat: r.lat, lng: r.lng, adresse: r.nom });
    });
  });
}

/** Confirmation + appel API pour écarter un lieu (statut `ecarte`), partagé par le bouton de la
 *  feuille et, potentiellement, un futur geste depuis la carte. */
export async function ecarterLieu(api, cb, l, { fermer = true } = {}) {
  try {
    await api.majLieu(l.id, { statut: "ecarte" });
    l.statut = "ecarte";
    if (fermer) fermerFeuille(); // déclenche onFermer -> revenirALaFiche
    toast(`${l.nom} écarté.`);
  } catch (e) { cb.echec(e); }
}

/** Confirmation + appel API pour retirer (supprimer) un lieu — supprime aussi sa photo
 *  (api.supprimerLieu). */
export async function retirerLieu(api, cb, l) {
  if (!(await confirmer(`Retirer « ${l.nom} » ? Une réservation liée resterait sans lieu.`, { ok: "Retirer" }))) return;
  try {
    await api.supprimerLieu(l);
    fermerFeuille(); // déclenche onFermer -> revenirALaFiche
    toast("Lieu retiré.");
  } catch (e) { cb.echec(e); }
}
