// Écran « Courses » : une liste commune, groupée par rayon, cochable dans le magasin.

import { $, txt, toast, confirmer } from "../socle/ui-base.js";
import { ligneCoche, carteListe, chiffres, titreSection, brancherCoches, creerFileEcritures } from "../socle/blocs.js";

export function creerUiCourses(api, etat, cb) {
  const aFaire = () => etat.courses.filter((a) => !a.coche_le);
  const prises = () => etat.courses.filter((a) => a.coche_le);
  const ordreRayon = (nom) => etat.rayons.find((r) => r.nom === nom)?.ordre ?? 999;
  const enFile = creerFileEcritures();

  const ligne = (a) => ligneCoche({
    id: a.id, titre: a.quantite ? `${a.libelle} · ${a.quantite}` : a.libelle,
    sous: a.coche_le ? `Pris par ${a.coche_par ?? "?"}` : (a.ajoute_par ? `Ajouté par ${a.ajoute_par}` : ""),
    cochee: !!a.coche_le, droite: "",
  });

  function rendre() {
    const restants = aFaire();
    const faits = prises();
    $("#sous-courses").textContent = restants.length
      ? `${restants.length} article${restants.length > 1 ? "s" : ""} à prendre`
      : "Liste vide. Ajoute ce qui manque.";
    $("#chiffres-courses").innerHTML = chiffres([
      { etiquette: "À prendre", valeur: String(restants.length), accent: true },
      { etiquette: "Dans le panier", valeur: String(faits.length) },
    ]);

    const parRayon = {};
    for (const a of restants) (parRayon[a.rayon] ??= []).push(a);
    const rayons = Object.keys(parRayon).sort((x, y) => ordreRayon(x) - ordreRayon(y));
    $("#liste-courses").innerHTML = rayons.length
      ? rayons.map((r) => titreSection(r) + carteListe(parRayon[r].map(ligne), "")).join("")
      : `${titreSection("À prendre")}<p class="vide">Rien sur la liste.</p>`;

    // Le panier ne prend de la place que lorsqu'il contient quelque chose.
    $("#panier").hidden = !faits.length;
    $("#courses-panier").innerHTML = carteListe(faits.map(ligne), "");

    brancherCoches($("#ecran-courses"), basculer, null);
  }

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
      const champ = $("#course-libelle");
      const libelle = champ.value.trim();
      if (!libelle) return;
      try {
        const cree = await api.creerCourse({
          libelle, quantite: $("#course-quantite").value.trim() || null,
          rayon: $("#course-rayon").value, ajoute_par: etat.prenom,
        });
        etat.courses.push(cree);
        champ.value = "";
        $("#course-quantite").value = "";
        champ.focus();
        rendre();
      } catch (e) { cb.echec(e); }
    });
  }

  async function viderPanier() {
    const faits = prises();
    if (!faits.length) return;
    if (!(await confirmer(`Retirer les ${faits.length} article${faits.length > 1 ? "s" : ""} pris de la liste ?`, { ok: "Vider" }))) return;
    try {
      await api.supprimerCourses(faits.map((a) => a.id));
      etat.courses = aFaire();
      rendre();
      toast("Panier vidé.");
    } catch (e) { cb.echec(e); }
  }

  function rendreRayons() {
    $("#course-rayon").innerHTML = etat.rayons.map((r) =>
      `<option value="${txt(r.nom)}"${r.nom === "Autre" ? " selected" : ""}>${txt(r.nom)}</option>`).join("");
  }

  brancherAjout();
  $("#btn-vider-panier").addEventListener("click", viderPanier);

  return { rendre, rendreRayons };
}
