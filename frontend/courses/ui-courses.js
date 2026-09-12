// Écran « Courses » : liste groupée par rayon (ordre du magasin, deux colonnes), repas de la
// semaine, panier, classiques. Affichage : socle/blocs.js. Comportement propre à l'écran ici ;
// la séquence de la feuille « On fait le tour » vit dans tournee.js (pure, partagée avec le bot).

import { $, $$, txt, toast, confirmer, ouvrirFeuille, fermerFeuille } from "../socle/ui-base.js";
import { ligneCoche, carteListe, titreSection, brancherCoches, creerFileEcritures } from "../socle/blocs.js";
import { classiquesAbsents, repasProposes, sequenceTournee } from "./tournee.js";

export function creerUiCourses(api, etat, cb) {
  const aFaire = () => etat.courses.filter((a) => !a.coche_le);
  const prises = () => etat.courses.filter((a) => a.coche_le);
  const ordreRayon = (nom) => etat.rayons.find((r) => r.nom === nom)?.ordre ?? 999;
  const rayonsTries = () => [...etat.rayons].sort((a, b) => a.ordre - b.ordre);
  const enFile = creerFileEcritures();

  const ligne = (a) => ligneCoche({
    id: a.id, titre: a.quantite ? `${a.libelle} · ${a.quantite}` : a.libelle,
    sous: a.coche_le ? `Pris par ${a.coche_par ?? "?"}` : (a.ajoute_par ? `Ajouté par ${a.ajoute_par}` : ""),
    cochee: !!a.coche_le, droite: "",
  });

  // ---------- groupes du magasin, deux colonnes ----------
  function rendreGroupes() {
    const restants = aFaire();
    const parRayon = {};
    for (const a of restants) (parRayon[a.rayon] ??= []).push(a);
    // L'ordre suit courses_rayons (le parcours réel), pas l'alphabet ; un groupe vide ne s'affiche pas.
    const rayons = rayonsTries().map((r) => r.nom).filter((nom) => parRayon[nom]?.length);
    $("#groupes-courses").innerHTML = rayons.length
      ? rayons.map((r) => `<div class="groupe-magasin">${titreSection(r)}${carteListe(parRayon[r].map(ligne), "")}</div>`).join("")
      : `${titreSection("À prendre")}<p class="vide">Rien sur la liste.</p>`;
  }

  // ---------- repas de la semaine ----------
  function ligneRepas({ repas, manquants, dansListe }) {
    const detailIngredients = manquants.length
      ? manquants.map((i) => i.libelle).join(", ")
      : "tout y est déjà";
    return `<div class="repas-ligne" data-repas="${repas.id}">
      <div class="repas-corps">
        <span class="repas-titre">${txt(repas.titre)}</span>
        <span class="repas-detail">${txt(repas.detail ?? "")}${repas.detail ? " · " : ""}${txt(detailIngredients)}</span>
      </div>
      <button type="button" class="repas-action${dansListe ? " dans-liste" : ""}" data-verser="${repas.id}"
        ${dansListe ? "disabled" : ""} aria-label="${dansListe ? `${txt(repas.titre)} : déjà dans la liste` : `Ajouter les ingrédients de ${txt(repas.titre)} à la liste`}">
        ${dansListe ? "Dans la liste" : "Ajouter"}
      </button>
    </div>`;
  }

  function rendreRepas() {
    const propositions = repasProposes(etat.repas, etat.repasIngredients, aFaire());
    $("#carte-repas").hidden = !propositions.length;
    $("#liste-repas").innerHTML = propositions.map(ligneRepas).join("");
    for (const b of $("#liste-repas").querySelectorAll("[data-verser]")) {
      b.addEventListener("click", () => verserRepas(Number(b.dataset.verser)));
    }
  }

  async function verserRepas(repasId) {
    const propositions = repasProposes(etat.repas, etat.repasIngredients, aFaire());
    const p = propositions.find((x) => x.repas.id === repasId);
    if (!p || p.dansListe) return; // inerte : déjà tout dans la liste
    try {
      const lignes = p.manquants.map((i) => ({
        libelle: i.libelle, quantite: i.quantite, rayon: i.rayon, ajoute_par: etat.prenom,
      }));
      const creees = await Promise.all(lignes.map((l) => api.creerCourse(l)));
      etat.courses.push(...creees);
      rendre();
      toast(`${p.repas.titre} : ingrédients ajoutés.`);
    } catch (e) { cb.echec(e); }
  }

  // ---------- panier et classiques ----------
  function rendrePanier() {
    const faits = prises();
    $("#panier").hidden = !faits.length;
    $("#courses-panier").innerHTML = carteListe(faits.map(ligne), "");
  }

  function pucesClassiques() {
    const enAttente = aFaire();
    const absents = classiquesAbsents(etat.classiques, enAttente);
    const presents = etat.classiques.filter((c) => !absents.includes(c));
    // Triés par fréquence : les plus achetés d'abord, absents ou non (README §4).
    const tous = [...absents, ...presents].sort((a, b) => b.fois - a.fois);
    return tous.map((c) => {
      const present = !absents.includes(c);
      return `<button type="button" class="classique${present ? " present" : ""}" data-classique="${txt(c.libelle)}"
        ${present ? "disabled" : ""} aria-label="${present ? `${txt(c.libelle)} : déjà dans la liste` : `Ajouter ${txt(c.libelle)} à la liste`}">
        ${txt(c.libelle)} <span class="mono">×${c.fois}</span>
      </button>`;
    }).join("");
  }

  function rendreClassiques() {
    $("#liste-classiques").innerHTML = etat.classiques.length
      ? pucesClassiques()
      : '<p class="vide">Aucun classique pour l’instant.</p>';
    for (const b of $("#liste-classiques").querySelectorAll("[data-classique]:not([disabled])")) {
      b.addEventListener("click", () => remonterClassique(b.dataset.classique));
    }
  }

  async function remonterClassique(libelle) {
    const c = etat.classiques.find((x) => x.libelle === libelle);
    if (!c) return;
    try {
      const cree = await api.creerCourse({ libelle: c.libelle, quantite: c.quantite, rayon: c.rayon, ajoute_par: etat.prenom });
      etat.courses.push(cree);
      rendre();
      toast(`${c.libelle} ajouté à la liste.`);
    } catch (e) { cb.echec(e); }
  }

  async function viderPanier() {
    const faits = prises();
    if (!faits.length) return;
    if (!(await confirmer(`Retirer les ${faits.length} article${faits.length > 1 ? "s" : ""} pris de la liste ?`, { ok: "Vider" }))) return;
    try {
      // Chaque article pris alimente les classiques (fois + 1) AVANT d'être retiré de la liste :
      // sinon un échec réseau entre les deux perdrait la fréquence sans que rien ne le signale.
      for (const a of faits) {
        const classe = await api.classerCommeClassique(a);
        const i = etat.classiques.findIndex((c) => c.libelle === a.libelle);
        if (i === -1) etat.classiques.push(classe); else etat.classiques[i] = classe;
      }
      await api.supprimerCourses(faits.map((a) => a.id));
      etat.courses = aFaire();
      rendre();
      toast("Panier vidé.");
    } catch (e) { cb.echec(e); }
  }

  // ---------- coche et ajout ----------
  async function basculer(id) {
    const a = etat.courses.find((x) => x.id === id);
    if (!a) return;
    const avant = { coche_le: a.coche_le, coche_par: a.coche_par };
    a.coche_le = a.coche_le ? null : new Date().toISOString();
    a.coche_par = a.coche_le ? etat.prenom : null;
    const champs = { coche_le: a.coche_le, coche_par: a.coche_par };
    rendre();
    try { await enFile(id, () => api.majCourse(id, champs)); }
    catch (e) { Object.assign(a, avant); rendre(); cb.echec(e); }
  }

  /** Ajout rapide : le champ reste ouvert, on enchaîne les articles sans rouvrir de feuille. */
  function brancherAjout() {
    $("#form-course").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const champLibelle = $("#course-libelle");
      const libelle = champLibelle.value.trim();
      if (!libelle) return;
      try {
        const cree = await api.creerCourse({
          libelle, quantite: $("#course-quantite").value.trim() || null,
          rayon: $("#course-rayon").value, ajoute_par: etat.prenom,
        });
        etat.courses.push(cree);
        champLibelle.value = "";
        $("#course-quantite").value = "";
        champLibelle.focus();
        rendre();
      } catch (e) { cb.echec(e); }
    });
  }

  function rendreRayons() {
    $("#course-rayon").innerHTML = rayonsTries().map((r) =>
      `<option value="${txt(r.nom)}"${r.nom === "Autre" ? " selected" : ""}>${txt(r.nom)}</option>`).join("");
  }

  // ---------- feuille « On fait le tour » ----------
  // Deux étapes distinctes, comme la maquette : d'abord les classiques absents, une question
  // à la fois (Non, on a / Oui, ajoute) ; puis les menus, une seule fois, sous forme de
  // plusieurs cartes cliquables (pas une question par repas). « Passer aux menus » saute
  // directement à la deuxième étape sans répondre aux classiques restants.
  function ouvrirTournee() {
    const seq = sequenceTournee({
      classiques: etat.classiques, repas: etat.repas,
      ingredients: etat.repasIngredients, articlesEnAttente: aFaire(),
    });
    const classiquesRestants = [...seq.classiques];
    let ajoutes = 0;
    afficherClassiques();

    function enTete(progres) {
      return `<div class="tournee-tete"><h2>On fait le tour</h2><span class="sous">${txt(progres)}</span></div>`;
    }

    function afficherClassiques() {
      if (!classiquesRestants.length) return afficherMenus();
      const c = classiquesRestants[0];
      ouvrirFeuille(`<div class="pile tournee-etape">
        ${enTete(`${seq.classiques.length - classiquesRestants.length + 1} / ${seq.classiques.length}`)}
        <div class="tournee-question-bloc">
          <span class="tournee-question">${txt(c.libelle)} ?</span>
          <span class="sous">${txt(c.rayon)} · pris ${c.fois} fois${c.quantite ? ` · d’habitude ${txt(c.quantite)}` : ""}</span>
        </div>
        <div class="detail-actions">
          <button type="button" class="btn grandir" id="tournee-non">Non, on a</button>
          <button type="button" class="btn btn-vert grandir" id="tournee-oui">Oui, ajoute</button>
        </div>
        <button type="button" class="btn-lien centre" id="tournee-passer-menus">Passer aux menus →</button>
      </div>`);
      $("#tournee-oui").addEventListener("click", async () => {
        try { await remonterClassique(c.libelle); ajoutes += 1; }
        catch (err) { cb.echec(err); }
        classiquesRestants.shift();
        afficherClassiques();
      });
      $("#tournee-non").addEventListener("click", () => { classiquesRestants.shift(); afficherClassiques(); });
      $("#tournee-passer-menus").addEventListener("click", afficherMenus);
    }

    function afficherMenus() {
      if (!seq.repas.length) return afficherBilan();
      ouvrirFeuille(`<div class="pile tournee-etape">
        ${enTete("Menus")}
        <span class="sous">Trois idées pour la semaine. Le menu choisi envoie ses ingrédients dans les bons rayons.</span>
        <div class="tournee-menus">${seq.repas.map(htmlCarteMenu).join("")}</div>
        <button type="button" class="btn btn-bleu grandir" id="tournee-terminer">Terminer le tour</button>
      </div>`);
      for (const b of $$("[data-choisir-menu]")) {
        b.addEventListener("click", async () => {
          const id = Number(b.dataset.choisirMenu);
          const p = seq.repas.find((x) => x.repas.id === id);
          try { await verserRepas(id); ajoutes += p.manquants.length; } catch (err) { cb.echec(err); }
          afficherBilan();
        });
      }
      $("#tournee-terminer").addEventListener("click", afficherBilan);
    }

    function htmlCarteMenu(p) {
      return `<button type="button" class="tournee-carte-menu" data-choisir-menu="${p.repas.id}">
        <span class="tournee-menu-ligne1">
          <span class="tournee-menu-nom">${txt(p.repas.titre)}</span>
          <span class="sous">${txt(p.repas.detail ?? "")}</span>
        </span>
        <span class="sous">${txt(p.manquants.map((m) => m.libelle).join(", "))}</span>
      </button>`;
    }

    function afficherBilan() {
      ouvrirFeuille(`<div class="pile tournee-etape">
        <div class="tournee-bilan">
          <span class="tournee-bilan-titre">Tour fini</span>
          <span class="sous">${ajoutes} article${ajoutes > 1 ? "s" : ""} ajouté${ajoutes > 1 ? "s" : ""} à la liste.</span>
        </div>
        <button type="button" class="btn btn-bleu grandir" id="tournee-fermer">Fermer</button>
      </div>`);
      $("#tournee-fermer").addEventListener("click", fermerFeuille);
    }
  }

  // ---------- rendu global ----------
  function rendre() {
    const restants = aFaire();
    const nPanier = prises().length;
    const texteRestants = restants.length
      ? `${restants.length} article${restants.length > 1 ? "s" : ""} à prendre`
      : "Liste vide, ajoute ce qui manque";
    // Sous-titre compact façon maquette : « 3 articles à prendre · 1 dans le panier » (README §4).
    $("#sous-courses").textContent = nPanier
      ? `${texteRestants} · ${nPanier} dans le panier`
      : texteRestants;
    rendreGroupes();
    rendreRepas();
    rendrePanier();
    rendreClassiques();
    brancherCoches($("#ecran-courses"), basculer, null);
  }

  brancherAjout();
  $("#btn-vider-panier").addEventListener("click", viderPanier);
  $("#btn-tour").addEventListener("click", ouvrirTournee);

  return { rendre, rendreRayons };
}
