// Écran « Courses » : liste groupée par rayon (ordre du magasin, deux colonnes), repas de la
// semaine, panier, classiques. Affichage : socle/blocs.js. Comportement propre à l'écran ici ;
// la séquence de la feuille « On fait le tour » vit dans tournee.js (pure, partagée avec le bot).

import { $, txt, toast, confirmer, ouvrirFeuille, fermerFeuille } from "../socle/ui-base.js";
import { ligneCoche, carteListe, chiffres, titreSection, brancherCoches, creerFileEcritures } from "../socle/blocs.js";
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
  function ouvrirTournee() {
    const seq = sequenceTournee({
      classiques: etat.classiques, repas: etat.repas,
      ingredients: etat.repasIngredients, articlesEnAttente: aFaire(),
    });
    const etapes = [
      ...seq.classiques.map((c) => ({ type: "classique", classique: c })),
      ...seq.repas.map((p) => ({ type: "repas", proposition: p })),
    ];
    let i = 0;
    afficherEtape();

    function afficherEtape() {
      if (i >= etapes.length) return afficherBilan();
      const e = etapes[i];
      ouvrirFeuille(e.type === "classique" ? htmlEtapeClassique(e.classique) : htmlEtapeRepas(e.proposition));
      $("#tournee-oui")?.addEventListener("click", () => { agirEtape(e, true); });
      $("#tournee-non")?.addEventListener("click", () => { agirEtape(e, false); });
      $("#tournee-passer-menus")?.addEventListener("click", () => {
        i = etapes.findIndex((x, k) => k >= i && x.type === "repas");
        if (i === -1) i = etapes.length;
        afficherEtape();
      });
    }

    async function agirEtape(e, oui) {
      try {
        if (oui && e.type === "classique") await remonterClassique(e.classique.libelle);
        if (oui && e.type === "repas") await verserRepas(e.proposition.repas.id);
      } catch (err) { cb.echec(err); }
      i += 1;
      afficherEtape();
    }

    function htmlEtapeClassique(c) {
      return `<div class="pile tournee-etape">
        <p class="tournee-question">${txt(c.libelle)} ?</p>
        <p class="sous">${txt(c.rayon)} · pris ${c.fois} fois${c.quantite ? ` · d’habitude ${txt(c.quantite)}` : ""}</p>
        <div class="detail-actions">
          <button type="button" class="btn grandir" id="tournee-non">Non, on a</button>
          <button type="button" class="btn btn-vert grandir" id="tournee-oui">Oui, ajoute</button>
        </div>
        <button type="button" class="btn-lien centre" id="tournee-passer-menus">Passer aux menus →</button>
      </div>`;
    }

    function htmlEtapeRepas(p) {
      return `<div class="pile tournee-etape">
        <p class="tournee-question">${txt(p.repas.titre)} ?</p>
        <p class="sous">${txt(p.repas.detail ?? "")}${p.repas.detail ? " · " : ""}${txt(p.manquants.map((m) => m.libelle).join(", "))}</p>
        <div class="detail-actions">
          <button type="button" class="btn grandir" id="tournee-non">Non merci</button>
          <button type="button" class="btn btn-vert grandir" id="tournee-oui">Oui, ajoute</button>
        </div>
      </div>`;
    }

    function afficherBilan() {
      ouvrirFeuille(`<div class="pile tournee-etape">
        <h2>Tournée terminée</h2>
        <p class="sous">La liste est à jour. Bonnes courses !</p>
        <button type="button" class="btn btn-bleu grandir" id="tournee-fermer">Fermer</button>
      </div>`);
      $("#tournee-fermer").addEventListener("click", fermerFeuille);
    }
  }

  // ---------- rendu global ----------
  function rendre() {
    const restants = aFaire();
    $("#sous-courses").textContent = restants.length
      ? `${restants.length} article${restants.length > 1 ? "s" : ""} à prendre`
      : "Liste vide. Ajoute ce qui manque.";
    $("#chiffres-courses").innerHTML = chiffres([
      { etiquette: "À prendre", valeur: String(restants.length), accent: true },
      { etiquette: "Dans le panier", valeur: String(prises().length) },
    ]);
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
