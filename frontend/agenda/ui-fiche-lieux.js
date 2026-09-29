// Section « Lieux » de la fiche voyage : groupés par jour puis « Sans date » par catégorie,
// statut en un tap (idée → prévu → fait → idée ; « écarté » depuis la feuille du lieu),
// formulaire + Lieu avec recherche Nominatim, « Localiser les n lieux sans position ».
// Brief carnet-voyage.md §Écrans point 4.

import { $, txt, ouvrirFeuille, fermerFeuille, toast, confirmer } from "../socle/ui-base.js";
import { titreSection, choixDetaille } from "../socle/blocs.js";
import { champ, select, zone, lire } from "../socle/blocs-form.js";
import { CATEGORIES_LIEU, lieuxParJour } from "./carnet.js";
import { chercherLieu } from "./geocode.js";

const CYCLE_STATUT = { idee: "prevu", prevu: "fait", fait: "idee" };
const LIBELLE_STATUT = { idee: "Idée", prevu: "Prévu", fait: "Fait", ecarte: "Écarté" };
const SANS_POSITION = "__sans_position__";
const DEBOUNCE_RECHERCHE_MS = 1100;

/** Titre court d'un résultat Nominatim (première composante de `display_name`, ex. « Aquarium
 *  de Trouville ») ; le nom complet reste affiché en détail (relecture carnet-voyage §C : on
 *  ne comprenait pas qu'il fallait choisir parmi des champs de saisie — `choixDetaille` du
 *  socle rend le choix explicite, titre court + adresse complète dessous). */
const titreCourt = (nomComplet) => nomComplet.split(",")[0].trim();

export function creerFicheLieux(api, etat, cb, { voyage, lieux, rafraichir, revenirALaFiche }) {
  function ligneLieu(l) {
    const cat = CATEGORIES_LIEU.find((c) => c.valeur === l.categorie) ?? CATEGORIES_LIEU.at(-1);
    const sansPosition = l.lat == null;
    return `<div class="ligne-lieu${l.statut === "ecarte" ? " ecarte" : ""}" data-lieu="${l.id}">
      <button type="button" class="lieu-statut cible44" data-statut="${l.id}" aria-label="Statut : ${txt(LIBELLE_STATUT[l.statut])}, tap pour changer">
        ${txt(LIBELLE_STATUT[l.statut])}
      </button>
      <button type="button" class="lieu-corps" data-ouvrir-lieu="${l.id}">
        <span class="lieu-nom">${txt(l.nom)}</span>
        <span class="lieu-categorie"><span class="lieu-puce" style="background:${cat.couleur}"></span>${txt(cat.libelle)}</span>
      </button>
      ${sansPosition && l.statut !== "ecarte" ? `<span class="lieu-alocaliser">à localiser</span>` : ""}
    </div>`;
  }

  function html() {
    const groupes = lieuxParJour(lieux().filter((l) => l.statut !== "ecarte"));
    const sansPositionCount = lieux().filter((l) => l.lat == null && l.statut !== "ecarte").length;
    return `<div class="fiche-lieux">
      ${titreSection("Lieux")}
      ${groupes.length ? groupes.map((g) => `
        <div class="lieux-groupe">
          <h4 class="lieux-groupe-titre">${g.jour ? txt(formatJour(g.jour)) : "Sans date"}</h4>
          ${g.lieux.map(ligneLieu).join("")}
        </div>`).join("") : `<p class="vide">Aucun lieu pour l'instant.</p>`}
      ${sansPositionCount ? `<button type="button" class="btn-lien" data-localiser-tous>Localiser les ${sansPositionCount} lieux sans position</button>` : ""}
      <button type="button" class="btn btn-tirets" data-nouveau-lieu>+ Lieu</button>
    </div>`;
  }

  /** `toLocaleDateString` rend déjà tout en minuscules en fr-FR (« lundi 28 septembre ») : la
   *  seule majuscule voulue est celle du tout premier caractère (relecture carnet-voyage §H —
   *  le CSS ne doit plus le faire, `text-transform:capitalize` mettait une majuscule à CHAQUE
   *  mot, y compris septembre). Posée ici, à la source, pas en CSS. */
  function formatJour(iso) {
    const texte = new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    return texte.charAt(0).toUpperCase() + texte.slice(1);
  }

  function rendre() {
    $("#fiche-lieux-corps").innerHTML = html();
    brancher();
  }

  function brancher() {
    const racine = $("#fiche-lieux-corps");
    for (const b of racine.querySelectorAll("[data-statut]")) {
      b.addEventListener("click", () => basculerStatut(Number(b.dataset.statut)));
    }
    for (const b of racine.querySelectorAll("[data-ouvrir-lieu]")) {
      b.addEventListener("click", () => formulaireLieu(lieux().find((l) => l.id === Number(b.dataset.ouvrirLieu))));
    }
    racine.querySelector("[data-nouveau-lieu]").addEventListener("click", () => formulaireLieu(null));
    racine.querySelector("[data-localiser-tous]")?.addEventListener("click", localiserTous);
  }

  /** Optimiste, avec rollback : le tap doit répondre tout de suite (D-024 esprit), mais reste
   *  cohérent si l'écriture échoue — pas de creerCheckList ici (pensé pour un aside PC que
   *  cette fiche n'a pas), donc un petit cycle local, comme ui-charge-feuille.js. */
  async function basculerStatut(id) {
    const l = lieux().find((x) => x.id === id);
    if (!l) return;
    const avant = l.statut;
    l.statut = CYCLE_STATUT[l.statut] ?? "idee";
    rendre();
    try {
      await api.majLieu(id, { statut: l.statut });
      toast(`${l.nom} : ${LIBELLE_STATUT[l.statut]}.`);
    } catch (e) {
      l.statut = avant;
      rendre();
      cb.echec(e);
    }
  }

  // ---------- formulaire lieu (création/édition + recherche Nominatim) ----------
  function formulaireLieu(l) {
    ouvrirFeuille(`<form class="pile" data-form-lieu>
      <h2>${l ? "Modifier le lieu" : "Nouveau lieu"}</h2>
      ${champ("nom", "Nom", { valeur: l?.nom, requis: true, placeholder: "ex. Musée du Prado" })}
      ${select("categorie", "Catégorie", CATEGORIES_LIEU.map((c) => [c.valeur, c.libelle]), l?.categorie ?? "a_voir")}
      ${champ("jour", "Jour (optionnel)", { type: "date", valeur: l?.jour, attrs: `min="${voyage().debut}" max="${voyage().fin}"` })}
      ${zone("note", "Note", l?.note, { lignes: 2 })}
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
    // Jeton de course, posé sur le form lui-même (relu par jetonCourant()) : seule la réponse
    // de la DERNIÈRE recherche lancée peut écrire son résultat — geocode.js sérialise déjà les
    // appels réseau, mais une frappe pendant qu'une recherche précédente est encore en vol ne
    // doit jamais laisser une réponse périmée remplacer des résultats plus récents (relecture
    // §C : un seul appel en vol).
    let minuteurDebounce = null;
    const lancerRecherche = () => {
      form.dataset.jetonRecherche = String(jetonCourant(form) + 1);
      chercherPosition(form, poserPosition, jetonCourant(form));
    };

    const poserPosition = (p) => { position = p; };

    form.querySelector("[data-ecarter-lieu]")?.addEventListener("click", () => ecarterLieu(l));
    form.querySelector("[data-retirer-lieu]")?.addEventListener("click", () => retirerLieu(l));
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
        nom: v.nom, categorie: v.categorie, jour: v.jour || null, note: v.note,
        lat: position?.lat ?? null, lng: position?.lng ?? null, adresse: position?.adresse ?? null,
      };
      try {
        if (l) await api.majLieu(l.id, champs);
        else await api.creerLieu({ ...champs, voyage_id: voyage().id, statut: "idee", cree_par: etat.prenom });
        fermerFeuille(); // déclenche onFermer -> revenirALaFiche (rafraîchit + scroll Lieux)
        toast(l ? "Lieu enregistré." : "Lieu ajouté.");
      } catch (e) { cb.echec(e); }
    });
  }

  async function ecarterLieu(l) {
    try {
      await api.majLieu(l.id, { statut: "ecarte" });
      l.statut = "ecarte";
      fermerFeuille(); // déclenche onFermer -> revenirALaFiche
      toast(`${l.nom} écarté.`);
    } catch (e) { cb.echec(e); }
  }

  async function retirerLieu(l) {
    if (!(await confirmer(`Retirer « ${l.nom} » ? Une réservation liée resterait sans lieu.`, { ok: "Retirer" }))) return;
    try {
      await api.supprimerLieu(l.id);
      fermerFeuille(); // déclenche onFermer -> revenirALaFiche
      toast("Lieu retiré.");
    } catch (e) { cb.echec(e); }
  }

  /** Cherche via Nominatim (`nom, lieu du voyage`), affiche jusqu'à 5 résultats + « Sans
   *  position » dans un `choixDetaille` du socle (titre = nom court, détail = adresse
   *  complète) : le premier résultat est pré-sélectionné, l'utilisateur peut en choisir un
   *  autre ou « Sans position » d'un tap. `jeton` identifie cet appel : si une recherche plus
   *  récente a été lancée entre-temps (debounce ou nouveau tap sur le bouton), sa réponse est
   *  ignorée — un seul résultat de recherche peut écrire l'écran (relecture §C). */
  async function chercherPosition(form, poserPosition, jeton) {
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
  /** Compteur de course exposé sur le formulaire lui-même : évite un état de fermeture
   *  supplémentaire à faire voyager entre `formulaireLieu` et `chercherPosition`. */
  function jetonCourant(form) { return form.dataset.jetonRecherche ? Number(form.dataset.jetonRecherche) : 0; }

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
    rendre();
    toast(trouves ? `${trouves} lieu(x) localisé(s).` : "Aucune position trouvée.");
  }

  return { rendre };
}
