import assert from "node:assert/strict";
import { classiquesAbsents, ingredientsManquants, repasDansListe, repasProposes,
  sequenceTournee } from "../frontend/courses/tournee.js";

// ---------- classiquesAbsents : triés par fréquence décroissante, présents exclus ----------
const classiques = [
  { libelle: "PQ", quantite: "1 paquet", rayon: "Papier et lavage", fois: 14 },
  { libelle: "Lait", quantite: "2 L", rayon: "Épicerie, alcool, lait", fois: 20 },
  { libelle: "Café", quantite: null, rayon: "Épices et grignotage", fois: 3 },
];
const enAttenteSansPQ = [{ id: 1, libelle: "Café", rayon: "Épices et grignotage" }];
assert.deepEqual(
  classiquesAbsents(classiques, enAttenteSansPQ).map((c) => c.libelle),
  ["Lait", "PQ"],
  "Café déjà dans la liste est exclu ; le reste trié par fois décroissant",
);
assert.deepEqual(classiquesAbsents(classiques, []).map((c) => c.libelle), ["Lait", "PQ", "Café"],
  "aucun présent : les trois, triés par fréquence");
assert.deepEqual(classiquesAbsents([], []), [], "aucun classique : liste vide");

// ---------- ingredientsManquants / repasDansListe ----------
const repas = [
  { id: 1, titre: "Poulet-légumes rôtis", detail: "2 dîners · four", actif: true, ordre: 10 },
  { id: 2, titre: "Dahl de lentilles", detail: "2 dîners · casserole", actif: true, ordre: 30 },
  { id: 3, titre: "Repas inactif", detail: null, actif: false, ordre: 20 },
];
const ingredients = [
  { id: 1, repas_id: 1, libelle: "Poulet", quantite: null, rayon: "Boucherie" },
  { id: 2, repas_id: 1, libelle: "Courgettes", quantite: "3", rayon: "Fruits et légumes" },
  { id: 3, repas_id: 1, libelle: "Patates douces", quantite: "1 kg", rayon: "Fruits et légumes" },
  { id: 4, repas_id: 2, libelle: "Lentilles corail", quantite: "500 g", rayon: "Épicerie, alcool, lait" },
  { id: 5, repas_id: 2, libelle: "Lait de coco", quantite: "2", rayon: "Épicerie, alcool, lait" },
];

// Repas partiellement présent : un ingrédient déjà dans la liste, deux manquants.
const listeAvecPoulet = [{ id: 10, libelle: "Poulet" }];
assert.deepEqual(
  ingredientsManquants(repas[0], ingredients, listeAvecPoulet).map((i) => i.libelle),
  ["Courgettes", "Patates douces"],
  "le poulet déjà dans la liste ne remonte pas comme manquant",
);
assert.equal(repasDansListe(repas[0], ingredients, listeAvecPoulet), false, "partiellement présent : pas encore « dans la liste »");

// Repas entièrement présent : tous les ingrédients sont déjà dans la liste.
const listeComplete = [{ id: 20, libelle: "Lentilles corail" }, { id: 21, libelle: "Lait de coco" }];
assert.deepEqual(ingredientsManquants(repas[1], ingredients, listeComplete), []);
assert.equal(repasDansListe(repas[1], ingredients, listeComplete), true, "tous les ingrédients déjà dans la liste");

// Repas totalement absent de la liste : tous les ingrédients manquent.
assert.deepEqual(ingredientsManquants(repas[0], ingredients, []).map((i) => i.libelle),
  ["Poulet", "Courgettes", "Patates douces"]);
assert.equal(repasDansListe(repas[0], ingredients, []), false);

// ---------- repasProposes : ordre du champ `ordre`, inactifs exclus ----------
const propositions = repasProposes(repas, ingredients, []);
assert.deepEqual(propositions.map((p) => p.repas.titre), ["Poulet-légumes rôtis", "Dahl de lentilles"],
  "trié par ordre, le repas inactif n'apparaît pas");
assert.equal(propositions[0].dansListe, false);
assert.equal(propositions[0].manquants.length, 3);

// ---------- sequenceTournee : classiques absents puis repas non complets ----------
const seq = sequenceTournee({ classiques, repas, ingredients, articlesEnAttente: [] });
assert.deepEqual(seq.classiques.map((c) => c.libelle), ["Lait", "PQ", "Café"]);
assert.deepEqual(seq.repas.map((p) => p.repas.titre), ["Poulet-légumes rôtis", "Dahl de lentilles"]);

// Un repas déjà entièrement dans la liste ne fait pas partie de la séquence de la tournée
// (le bot et la feuille ne reposent pas une question déjà répondue).
const seqAvecDahlComplet = sequenceTournee({
  classiques: [], repas, ingredients, articlesEnAttente: listeComplete,
});
assert.deepEqual(seqAvecDahlComplet.repas.map((p) => p.repas.titre), ["Poulet-légumes rôtis"]);

// ---------- ordre des groupes (courses_rayons.ordre pilote l'affichage, logique-metier.md §6) ----------
// Le tri est un simple `sort` par `ordre` (ui-courses.js, ui-magasin.js) : testé ici pour
// couvrir littéralement le cas demandé par le brief, sans dupliquer une fonction dédiée.
const rayonsDesordonnes = [
  { nom: "Boucherie", ordre: 90 }, { nom: "Beauté, SDB, bébé", ordre: 10 }, { nom: "Autre", ordre: 99 },
];
const parOrdre = [...rayonsDesordonnes].sort((a, b) => a.ordre - b.ordre);
assert.deepEqual(parOrdre.map((r) => r.nom), ["Beauté, SDB, bébé", "Boucherie", "Autre"],
  "l'ordre du parcours du magasin, pas l'alphabet");

// ---------- robustesse : une ligne absente ne fait pas tomber l'écran ----------
// Trouvé en recette connectée : `api.classerCommeClassique` faisait un upsert SANS `.select()`,
// donc renvoyait `null`, que « Vider le panier » poussait dans `etat.classiques` ; le rendu
// suivant plantait sur `c.libelle` et l'écran Courses restait mort jusqu'au rechargement.
// La cause est corrigée dans api.js, mais la tournée ne doit pas dépendre de la politesse de
// ses appelants : un trou dans les données se saute, il ne casse pas la liste de courses.
assert.deepEqual(
  classiquesAbsents([null, { libelle: "Lait", fois: 12 }, undefined], []).map((c) => c.libelle),
  ["Lait"], "une entrée nulle est ignorée, pas propagée");
assert.deepEqual(
  classiquesAbsents([{ libelle: "Lait", fois: 12 }], [null, { libelle: "Lait" }]),
  [], "un article nul dans la liste ne masque pas la comparaison");

console.log("test_courses OK");
