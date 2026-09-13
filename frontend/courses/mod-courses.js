// Module Courses : une liste commune, cochable dans le magasin, plus repas et classiques.

import { creerUiCourses } from "./ui-courses.js";
import { creerUiMagasin } from "./ui-magasin.js";

export default {
  cle: "courses", nom: "Courses", defaut: "courses", avecMois: false,
  // Aucun onglet segmenté : l'en-tête porte directement le titre « Courses » et le bouton
  // « On fait le tour » (D-036 §3, un seul écran de contenu pour ce module).
  onglets: [],
  reglages: [["magasin", "Magasin"]],
  etatInitial: { rayons: [], courses: [], repas: [], repasIngredients: [], classiques: [] },
  referentiels: (api) => ({ rayons: api.rayons() }),

  creer(api, etat, cb) {
    const liste = creerUiCourses(api, etat, cb);
    const magasin = creerUiMagasin(api, etat, cb);
    liste.rendreRayons();
    return {
      ecrans: { courses: liste.rendre, magasin: magasin.rendre },
      async charger() {
        const [courses, repas, repasIngredients, classiques] = await Promise.all([
          api.courses(), api.repas(), api.repasIngredients(), api.classiques(),
        ]);
        etat.courses = courses;
        etat.repas = repas;
        etat.repasIngredients = repasIngredients;
        etat.classiques = classiques;
      },
      resume() {
        const n = etat.courses.filter((a) => !a.coche_le).length;
        return n ? `${n} article${n > 1 ? "s" : ""} à prendre` : "Liste vide";
      },
    };
  },
};
