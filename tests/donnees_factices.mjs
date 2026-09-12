// Données factices pour la recette hors ligne (tests/recette_ecrans.mjs).
// Génériques et sans rien de personnel : prénoms Claudia/Yann (déjà publics dans le code),
// montants ronds inventés, tâches et articles génériques repris des migrations de départ.
// Le format de chaque table suit exactement les colonnes lues par frontend/socle/api.js
// (voir supabase/migrations/*.sql pour le schéma).

const AUJOURDHUI = new Date();
// Date LOCALE, jamais toISOString() : passé 22h en été, l'UTC est déjà au lendemain et toutes
// les échéances factices glisseraient d'un jour — la recette virerait au rouge le soir sans
// qu'une ligne de code applicatif ait bougé. Même règle que jourIso() dans taches.js (L-004).
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const auj = iso(AUJOURDHUI);
const ilYA = (n) => { const d = new Date(AUJOURDHUI); d.setDate(d.getDate() - n); return iso(d); };
// Fin de la période d'une tâche mensuelle, comme la calcule taches.js::echeance("mensuel").
const finDuMois = iso(new Date(AUJOURDHUI.getFullYear(), AUJOURDHUI.getMonth() + 1, 0));
const ANNEE = AUJOURDHUI.getFullYear();
const MOIS = AUJOURDHUI.getMonth() + 1;

export const MEMBRES = [
  { prenom: "Claudia", email: "claudia@exemple.fr", ordre: 1 },
  { prenom: "Yann", email: "yann@exemple.fr", ordre: 2 },
];

export const COMPTES = [
  { id: 1, nom: "Compte commun", titulaire: null, iban_masque: "1234", note: null, commun: true },
  { id: 2, nom: "Compte Claudia", titulaire: "Claudia", iban_masque: "5678", note: null, commun: false },
  { id: 3, nom: "Compte Yann", titulaire: "Yann", iban_masque: "9012", note: null, commun: false },
];

export const CHARGES = [
  { id: 1, libelle: "Crédit immobilier", ordre: 10, categorie: "Logement", type: "egales", regle: "egales",
    cle_pct: null, payeur: null, ponctuel: false, montant_defaut: 120000, defaut_dernier: true },
  { id: 2, libelle: "Électricité", ordre: 20, categorie: "Logement", type: "proport", regle: "proport",
    cle_pct: null, payeur: null, ponctuel: false, montant_defaut: 9000, defaut_dernier: true },
  { id: 3, libelle: "Alimentation", ordre: 30, categorie: "Alimentation", type: "egales", regle: "egales",
    cle_pct: null, payeur: null, ponctuel: false, montant_defaut: 60000, defaut_dernier: true },
  { id: 4, libelle: "Impôts", ordre: 40, categorie: "Impôts", type: "proport", regle: "proport",
    cle_pct: null, payeur: null, ponctuel: false, montant_defaut: 25000, defaut_dernier: true },
  { id: 5, libelle: "Crèche", ordre: 50, categorie: "Max", type: "egales", regle: "egales",
    cle_pct: null, payeur: null, ponctuel: false, montant_defaut: 45000, defaut_dernier: true },
];

export const LIGNES = CHARGES.map((c) => ({
  annee: ANNEE, mois: MOIS, charge_id: c.id, montant_centimes: c.montant_defaut, regle: null,
}));

export const REVENUS = [
  { annee: ANNEE, mois: MOIS, prenom: "Claudia", montant_centimes: 250000 },
  { annee: ANNEE, mois: MOIS, prenom: "Yann", montant_centimes: 280000 },
];

export const AJUSTEMENTS = [
  { id: 1, annee: ANNEE, mois: MOIS, de: "Claudia", vers: "Yann", montant_centimes: 3000, motif: "Avance courses" },
];

export const MOUVEMENTS_RECURRENTS = [
  { id: 1, titre: "Virement au commun — Claudia", compte_de: 2, compte_vers: 1, mode: "part",
    montant_centimes: null, charge_id: null, prenom_part: "Claudia", qui: "Claudia", jour: 5,
    consigne: null, ordre: 1, actif: true },
  { id: 2, titre: "Virement au commun — Yann", compte_de: 3, compte_vers: 1, mode: "part",
    montant_centimes: null, charge_id: null, prenom_part: "Yann", qui: "Yann", jour: 5,
    consigne: null, ordre: 2, actif: true },
];

export const MOUVEMENTS = [
  { id: 1, annee: ANNEE, mois: MOIS, recurrent_id: 1, titre: "Virement au commun — Claudia",
    compte_de: 2, compte_vers: 1, montant_centimes: 120000, qui: "Claudia", consigne: null, fait_le: null },
  { id: 2, annee: ANNEE, mois: MOIS, recurrent_id: 2, titre: "Virement au commun — Yann",
    compte_de: 3, compte_vers: 1, montant_centimes: 134000, qui: "Yann", consigne: null,
    fait_le: new Date().toISOString() },
];

// ---------- module Tâches ----------
export const TACHES_RECURRENTES = [
  { id: 1, titre: "Laver les biberons", categorie: "Enfant", frequence: "quotidien", fois: 2,
    penibilite: 1, importance: 3, attribue_a: null, consigne: null, ordre: 10, actif: true,
    parts_quart: 4, obligatoire: true, partageable: false, ecart_prenom: null, minutes: 5, moment: "matin" },
  { id: 2, titre: "Faire à manger", categorie: "Cuisine", frequence: "quotidien", fois: 2,
    penibilite: 3, importance: 3, attribue_a: null, consigne: null, ordre: 20, actif: true,
    parts_quart: 12, obligatoire: true, partageable: true, ecart_prenom: null, minutes: 30, moment: "soir" },
  { id: 3, titre: "Lancer une machine", categorie: "Linge", frequence: "hebdo", fois: 3,
    penibilite: 1, importance: 2, attribue_a: null, consigne: null, ordre: 30, actif: true,
    parts_quart: 4, obligatoire: true, partageable: false, ecart_prenom: null, minutes: 10 },
  { id: 4, titre: "Courses", categorie: "Courses", frequence: "hebdo", fois: 1,
    penibilite: 3, importance: 3, attribue_a: null, consigne: null, ordre: 40, actif: true,
    parts_quart: 12, obligatoire: true, partageable: true, ecart_prenom: null, minutes: 45 },
  { id: 5, titre: "Aspirateur et sols", categorie: "Ménage", frequence: "hebdo", fois: 1,
    penibilite: 3, importance: 2, attribue_a: null, consigne: null, ordre: 50, actif: true,
    parts_quart: 12, obligatoire: false, partageable: false, ecart_prenom: null, minutes: 20 },
  // Les quatre cadences doivent être représentées, sinon des branches entières du rendu ne
  // sont jamais capturées : le « 1× » figé du mensuel, la carte « Ce mois », et les tâches
  // « au besoin » qui ne génèrent aucune occurrence. Un écran qu'aucune donnée n'atteint est
  // un écran que la recette dit vert sans l'avoir vu.
  { id: 6, titre: "Salle de bain", categorie: "Ménage", frequence: "mensuel", fois: 1,
    penibilite: 5, importance: 1, attribue_a: null, consigne: "Le gros morceau du mois.",
    ordre: 60, actif: true,
    parts_quart: 32, obligatoire: false, partageable: true, ecart_prenom: "Yann", minutes: 90 },
  { id: 7, titre: "Sortir la poubelle", categorie: "Déchets", frequence: "au_besoin", fois: 1,
    penibilite: 2, importance: 2, attribue_a: null, consigne: null, ordre: 70, actif: true,
    parts_quart: 4, obligatoire: true, partageable: false, ecart_prenom: null, minutes: 5 },
];

// Occurrences : une en retard, une aujourd'hui, quelques faites dans les 7 derniers jours
// (pour peupler balance/semaine), une au besoin.
export const TACHES = [
  { id: 1, recurrent_id: 1, titre: "Laver les biberons", categorie: "Enfant", echeance: ilYA(1),
    rang: 1, qui: null, qui2: null, fait_le: null, points: 0, parts_quart: 0 },
  { id: 2, recurrent_id: 2, titre: "Faire à manger", categorie: "Cuisine", echeance: auj,
    rang: 1, qui: null, qui2: null, fait_le: null, points: 0, parts_quart: 0 },
  { id: 3, recurrent_id: 3, titre: "Lancer une machine", categorie: "Linge", echeance: auj,
    rang: 1, qui: "Claudia", qui2: null, fait_le: new Date().toISOString(), points: 1, parts_quart: 4 },
  { id: 4, recurrent_id: 4, titre: "Courses", categorie: "Courses", echeance: ilYA(2),
    rang: 1, qui: "Yann", qui2: null, fait_le: new Date().toISOString(), points: 3, parts_quart: 12 },
  { id: 5, recurrent_id: 2, titre: "Faire à manger", categorie: "Cuisine", echeance: ilYA(3),
    rang: 2, qui: "Claudia", qui2: "Yann", fait_le: new Date().toISOString(), points: 3, parts_quart: 12 },
  { id: 6, recurrent_id: null, titre: "Monter l'étagère", categorie: "Ménage", echeance: ilYA(1),
    rang: 1, qui: "Yann", qui2: null, fait_le: new Date().toISOString(), points: 2, parts_quart: 8 },
  // Mensuelle non faite : peuple la carte « Ce mois » de l'écran Jour et la cadence
  // « Chaque mois » des Réglages (colonne figée à « 1× »), sinon jamais rendues.
  { id: 7, recurrent_id: 6, titre: "Salle de bain", categorie: "Ménage", echeance: finDuMois,
    rang: 1, qui: null, qui2: null, fait_le: null, points: 0, parts_quart: 0 },
];

// ---------- module Courses ----------
export const RAYONS = [
  { nom: "Beauté, SDB, bébé", ordre: 10 },
  { nom: "Vêtements, livres, jeux", ordre: 20 },
  { nom: "Papier et lavage", ordre: 30 },
  { nom: "Fruits et légumes", ordre: 40 },
  { nom: "Frais, jus, yaourts", ordre: 50 },
  { nom: "Surgelés", ordre: 60 },
  { nom: "Épices et grignotage", ordre: 70 },
  { nom: "Épicerie, alcool, lait", ordre: 80 },
  { nom: "Boucherie", ordre: 90 },
  { nom: "Autre", ordre: 99 },
];

export const COURSES = [
  { id: 1, libelle: "Pommes", quantite: "1 kg", rayon: "Fruits et légumes", ajoute_par: "Claudia",
    ajoute_le: new Date().toISOString(), coche_le: null, coche_par: null },
  { id: 2, libelle: "Yaourts nature", quantite: "1 pack", rayon: "Frais, jus, yaourts", ajoute_par: "Yann",
    ajoute_le: new Date().toISOString(), coche_le: null, coche_par: null },
  { id: 3, libelle: "Riz basmati", quantite: "1 kg", rayon: "Épicerie, alcool, lait", ajoute_par: "Claudia",
    ajoute_le: new Date().toISOString(), coche_le: null, coche_par: null },
  { id: 4, libelle: "Escalopes de poulet", quantite: "4", rayon: "Boucherie", ajoute_par: "Yann",
    ajoute_le: new Date().toISOString(), coche_le: new Date().toISOString(), coche_par: "Yann" },
];

export const REPAS = [
  { id: 1, titre: "Poulet-légumes rôtis", detail: "2 dîners · four", actif: true, ordre: 10 },
  { id: 2, titre: "Saumon, riz, brocolis", detail: "2 dîners · plaque", actif: true, ordre: 20 },
  { id: 3, titre: "Dahl de lentilles", detail: "2 dîners · casserole", actif: true, ordre: 30 },
];

export const REPAS_INGREDIENTS = [
  { id: 1, repas_id: 1, libelle: "Poulet", quantite: null, rayon: "Boucherie" },
  { id: 2, repas_id: 1, libelle: "Courgettes", quantite: "3", rayon: "Fruits et légumes" },
  { id: 3, repas_id: 1, libelle: "Patates douces", quantite: "1 kg", rayon: "Fruits et légumes" },
  { id: 4, repas_id: 2, libelle: "Pavés de saumon", quantite: "4", rayon: "Boucherie" },
  { id: 5, repas_id: 2, libelle: "Riz basmati", quantite: "1 kg", rayon: "Épicerie, alcool, lait" },
  { id: 6, repas_id: 2, libelle: "Brocolis", quantite: "2", rayon: "Fruits et légumes" },
  { id: 7, repas_id: 3, libelle: "Lentilles corail", quantite: "500 g", rayon: "Épicerie, alcool, lait" },
  { id: 8, repas_id: 3, libelle: "Lait de coco", quantite: "2", rayon: "Épicerie, alcool, lait" },
  { id: 9, repas_id: 3, libelle: "Épinards", quantite: null, rayon: "Fruits et légumes" },
];

export const COURSES_CLASSIQUES = [
  { libelle: "Lait", quantite: "2 L", rayon: "Épicerie, alcool, lait", fois: 12 },
  { libelle: "Œufs", quantite: "1 boîte", rayon: "Épicerie, alcool, lait", fois: 9 },
  { libelle: "Papier toilette", quantite: "1 pack", rayon: "Papier et lavage", fois: 5 },
];
