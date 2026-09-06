// Module Courses : une liste commune, cochable dans le magasin.

import { creerUiCourses } from "./ui-courses.js";

export default {
  cle: "courses", nom: "Courses", defaut: "courses", avecMois: false,
  onglets: [["courses", "Liste"]],
  plus: [],
  etatInitial: { rayons: [], courses: [] },
  referentiels: (api) => ({ rayons: api.rayons() }),

  creer(api, etat, cb) {
    const liste = creerUiCourses(api, etat, cb);
    liste.rendreRayons();
    return {
      ecrans: { courses: liste.rendre },
      async charger() { etat.courses = await api.courses(); },
      resume() {
        const n = etat.courses.filter((a) => !a.coche_le).length;
        return n ? `${n} article${n > 1 ? "s" : ""} à prendre` : "Liste vide";
      },
    };
  },
};
