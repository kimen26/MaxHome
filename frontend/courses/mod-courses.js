// Module Courses : une liste commune, cochable dans le magasin, plus repas et classiques.

import { creerUiCourses } from "./ui-courses.js";
import { creerUiMagasin } from "./ui-magasin.js";

export default {
  cle: "courses", nom: "Courses", defaut: "courses", avecMois: false,
  onglets: [["courses", "Liste"]],
  // « Plus » reste la seule porte de sortie d'un module à un onglet (L-015) : Magasin doit
  // y figurer pour rester atteignable depuis Courses comme depuis n'importe quel autre écran.
  plus: [["magasin", "Réglages · Magasin"]],
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
