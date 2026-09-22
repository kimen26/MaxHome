// Données factices pour la recette hors ligne (tests/recette_ecrans.mjs).
// Génériques et sans rien de personnel : prénoms Claudia/Yann (déjà publics dans le code),
// montants ronds inventés, tâches et articles génériques repris des migrations de départ.
// L'enfant s'appelle « Léo » ICI, prénom d'exemple : ce fichier est versionné dans un dépôt
// public (invariant 1). Le vrai prénom vit en base, posé par scripts/renommer_enfant.py.
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
// Fin de la période d'une tâche hebdo (le dimanche qui suit ou clôt la semaine courante),
// comme la calcule taches.js::echeance("hebdo") : jour + (7 - jour.getDay()) % 7.
const echeanceSemaine = ilYA(-((7 - AUJOURDHUI.getDay()) % 7));
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
  { id: 5, libelle: "Crèche", ordre: 50, categorie: "Léo", type: "egales", regle: "egales",
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
// Les 24 récurrentes réelles (reprises telles quelles, cf. brief) : sept le matin, cinq le
// soir, cinq hebdo, deux mensuelles, quatre au besoin. Sept tâches seulement masquait la carte
// MATIN et laissait l'écran Jour quasi vide sur les captures — la recette disait vert sans
// avoir vu la vraie densité (L-009 : une capture se regarde).
// `cree_le` (014_cree_le.sql) : date de création de la tâche récurrente, lue par la feuille
// Todo (« ajouté il y a 12 j · 45 min », bug 6). Les « au besoin » (Todo) portent des dates
// étalées pour peupler la recette avec les trois formes du libellé (aujourd'hui / hier / il y
// a N j) ; les autres portent une ancienneté arbitraire, sans effet sur leur propre écran.
const ilYAHeure = (jours, minutes) => { const d = new Date(AUJOURDHUI); d.setDate(d.getDate() - jours); d.setMinutes(d.getMinutes() - minutes); return d.toISOString(); };

export const TACHES_RECURRENTES = [
  // -- quotidien / matin --
  { id: 1, titre: "Biberons", categorie: "Enfant", frequence: "quotidien", fois: 2,
    penibilite: 1, importance: 3, attribue_a: null, consigne: null, ordre: 10, actif: true,
    parts_quart: 4, obligatoire: true, partageable: false, ecart_prenom: null, minutes: 5, moment: "matin", cree_le: ilYAHeure(400, 0) },
  { id: 2, titre: "Petit déj Léo", categorie: "Enfant", frequence: "quotidien", fois: 1,
    penibilite: 1, importance: 3, attribue_a: null, consigne: null, ordre: 20, actif: true,
    parts_quart: 4, obligatoire: true, partageable: false, ecart_prenom: null, minutes: 10, moment: "matin", cree_le: ilYAHeure(400, 0) },
  { id: 3, titre: "Habiller Léo", categorie: "Enfant", frequence: "quotidien", fois: 1,
    penibilite: 1, importance: 2, attribue_a: null, consigne: null, ordre: 30, actif: true,
    parts_quart: 2, obligatoire: true, partageable: false, ecart_prenom: null, minutes: 5, moment: "matin", cree_le: ilYAHeure(400, 0) },
  { id: 4, titre: "Dents Léo", categorie: "Enfant", frequence: "quotidien", fois: 1,
    penibilite: 1, importance: 2, attribue_a: null, consigne: null, ordre: 40, actif: true,
    parts_quart: 2, obligatoire: false, partageable: false, ecart_prenom: null, minutes: 2, moment: "matin", cree_le: ilYAHeure(400, 0) },
  { id: 5, titre: "Dépose école", categorie: "Enfant", frequence: "quotidien", fois: 1,
    penibilite: 2, importance: 3, attribue_a: null, consigne: null, ordre: 50, actif: true,
    parts_quart: 4, obligatoire: true, partageable: false, ecart_prenom: null, minutes: 15, moment: "matin", cree_le: ilYAHeure(400, 0) },
  { id: 6, titre: "Table", categorie: "Cuisine", frequence: "quotidien", fois: 1,
    penibilite: 1, importance: 1, attribue_a: null, consigne: null, ordre: 60, actif: true,
    parts_quart: 2, obligatoire: false, partageable: false, ecart_prenom: null, minutes: 5, moment: "matin", cree_le: ilYAHeure(400, 0) },
  { id: 7, titre: "LV - ranger", categorie: "Cuisine", frequence: "quotidien", fois: 1,
    penibilite: 1, importance: 1, attribue_a: null, consigne: null, ordre: 70, actif: true,
    parts_quart: 2, obligatoire: false, partageable: false, ecart_prenom: null, minutes: 5, moment: "matin", cree_le: ilYAHeure(400, 0) },
  // -- quotidien / soir --
  { id: 8, titre: "Chercher Léo", categorie: "Enfant", frequence: "quotidien", fois: 1,
    penibilite: 2, importance: 3, attribue_a: null, consigne: null, ordre: 80, actif: true,
    parts_quart: 4, obligatoire: true, partageable: false, ecart_prenom: null, minutes: 15, moment: "soir", cree_le: ilYAHeure(400, 0) },
  { id: 9, titre: "Bain", categorie: "Enfant", frequence: "quotidien", fois: 1,
    penibilite: 2, importance: 2, attribue_a: null, consigne: null, ordre: 90, actif: true,
    parts_quart: 4, obligatoire: true, partageable: false, ecart_prenom: null, minutes: 15, moment: "soir", cree_le: ilYAHeure(400, 0) },
  { id: 10, titre: "Préparer le lait", categorie: "Enfant", frequence: "quotidien", fois: 1,
    penibilite: 1, importance: 2, attribue_a: null, consigne: null, ordre: 100, actif: true,
    parts_quart: 2, obligatoire: true, partageable: false, ecart_prenom: null, minutes: 5, moment: "soir", cree_le: ilYAHeure(400, 0) },
  { id: 11, titre: "Cuisine", categorie: "Cuisine", frequence: "quotidien", fois: 1,
    penibilite: 3, importance: 3, attribue_a: null, consigne: null, ordre: 110, actif: true,
    parts_quart: 12, obligatoire: true, partageable: true, ecart_prenom: null, minutes: 30, moment: "soir", cree_le: ilYAHeure(400, 0) },
  { id: 12, titre: "LV - vider", categorie: "Cuisine", frequence: "quotidien", fois: 1,
    penibilite: 1, importance: 1, attribue_a: null, consigne: null, ordre: 120, actif: true,
    parts_quart: 2, obligatoire: false, partageable: false, ecart_prenom: null, minutes: 5, moment: "soir", cree_le: ilYAHeure(400, 0) },
  // -- hebdo (moment null) --
  { id: 13, titre: "Courses", categorie: "Courses", frequence: "hebdo", fois: 1,
    penibilite: 3, importance: 3, attribue_a: null, consigne: null, ordre: 130, actif: true,
    parts_quart: 12, obligatoire: false, partageable: true, ecart_prenom: null, minutes: 45, moment: null, cree_le: ilYAHeure(400, 0) },
  { id: 14, titre: "Lessive", categorie: "Linge", frequence: "hebdo", fois: 1,
    penibilite: 1, importance: 2, attribue_a: null, consigne: null, ordre: 140, actif: true,
    parts_quart: 4, obligatoire: false, partageable: false, ecart_prenom: null, minutes: 10, moment: null, cree_le: ilYAHeure(400, 0) },
  { id: 15, titre: "Sols", categorie: "Ménage", frequence: "hebdo", fois: 1,
    penibilite: 3, importance: 2, attribue_a: null, consigne: null, ordre: 150, actif: true,
    parts_quart: 12, obligatoire: false, partageable: false, ecart_prenom: null, minutes: 20, moment: null, cree_le: ilYAHeure(400, 0) },
  { id: 16, titre: "Linge", categorie: "Linge", frequence: "hebdo", fois: 1,
    penibilite: 2, importance: 1, attribue_a: null, consigne: null, ordre: 160, actif: true,
    parts_quart: 8, obligatoire: false, partageable: false, ecart_prenom: null, minutes: 15, moment: null, cree_le: ilYAHeure(400, 0) },
  { id: 17, titre: "Draps", categorie: "Linge", frequence: "hebdo", fois: 1,
    penibilite: 2, importance: 1, attribue_a: null, consigne: null, ordre: 170, actif: true,
    parts_quart: 8, obligatoire: false, partageable: false, ecart_prenom: null, minutes: 15, moment: null, cree_le: ilYAHeure(400, 0) },
  // -- mensuel (moment null) --
  { id: 18, titre: "Salle de bain", categorie: "Ménage", frequence: "mensuel", fois: 1,
    penibilite: 5, importance: 1, attribue_a: null, consigne: "Le gros morceau du mois.",
    ordre: 180, actif: true,
    parts_quart: 32, obligatoire: false, partageable: true, ecart_prenom: "Yann", minutes: 90, moment: null, cree_le: ilYAHeure(400, 0) },
  { id: 19, titre: "Vitres", categorie: "Ménage", frequence: "mensuel", fois: 1,
    penibilite: 4, importance: 1, attribue_a: null, consigne: null, ordre: 190, actif: true,
    parts_quart: 20, obligatoire: false, partageable: false, ecart_prenom: null, minutes: 45, moment: null, cree_le: ilYAHeure(400, 0) },
  // -- au_besoin (moment null, jamais d'occurrence — cf. Todo) : dates étalées pour montrer les
  // trois formes du libellé (aujourd'hui / hier / il y a N j) sur la capture de la feuille.
  { id: 20, titre: "Poubelle", categorie: "Déchets", frequence: "au_besoin", fois: 1,
    penibilite: 2, importance: 2, attribue_a: null, consigne: null, ordre: 200, actif: true,
    parts_quart: 2, obligatoire: false, partageable: false, ecart_prenom: null, minutes: 5, moment: null, cree_le: ilYAHeure(12, 45) },
  { id: 21, titre: "Verre", categorie: "Déchets", frequence: "au_besoin", fois: 1,
    penibilite: 1, importance: 1, attribue_a: null, consigne: null, ordre: 210, actif: true,
    parts_quart: 2, obligatoire: false, partageable: false, ecart_prenom: null, minutes: 5, moment: null, cree_le: ilYAHeure(9, 30) },
  { id: 22, titre: "Garage", categorie: "Ménage", frequence: "au_besoin", fois: 1,
    penibilite: 3, importance: 1, attribue_a: null, consigne: null, ordre: 220, actif: true,
    parts_quart: 12, obligatoire: false, partageable: false, ecart_prenom: null, minutes: 30, moment: null, cree_le: ilYAHeure(26, 90) },
  { id: 23, titre: "Cadres", categorie: "Ménage", frequence: "au_besoin", fois: 1,
    penibilite: 1, importance: 1, attribue_a: null, consigne: null, ordre: 230, actif: true,
    parts_quart: 4, obligatoire: false, partageable: false, ecart_prenom: null, minutes: 10, moment: null, cree_le: ilYAHeure(5, 20) },
  { id: 24, titre: "Étagère", categorie: "Ménage", frequence: "au_besoin", fois: 1,
    penibilite: 2, importance: 1, attribue_a: null, consigne: null, ordre: 240, actif: true,
    parts_quart: 8, obligatoire: false, partageable: false, ecart_prenom: null, minutes: 20, moment: null, cree_le: ilYAHeure(1, 10) },
];

// Occurrences du jour pour les quotidiennes (fois occurrences chacune), des hebdo à l'échéance
// de la semaine (le dimanche, cf. taches.js::echeance) et des mensuelles à la fin du mois.
// Aucune pour les au_besoin (L-consigne du brief : elles vivent dans le Todo).
// 9 occurrences déjà faites (fait_le renseigné, qui/qui2, parts_quart figé) dont deux à deux
// (Cuisine et Courses, qui portent qui2) pour que la case « CY » apparaisse sur les captures.
const maintenant = new Date().toISOString();

export const TACHES = [
  // Matin : Biberons (2×, une faite), Petit déj fait, Habiller à faire, Dents à faire,
  // Dépose école faite, Table à faire, LV - ranger faite.
  { id: 1, recurrent_id: 1, titre: "Biberons", categorie: "Enfant", echeance: auj,
    rang: 1, qui: "Claudia", qui2: null, fait_le: maintenant, points: 1, parts_quart: 4 },
  { id: 2, recurrent_id: 1, titre: "Biberons", categorie: "Enfant", echeance: auj,
    rang: 2, qui: null, qui2: null, fait_le: null, points: 0, parts_quart: 0 },
  { id: 3, recurrent_id: 2, titre: "Petit déj Léo", categorie: "Enfant", echeance: auj,
    rang: 1, qui: "Yann", qui2: null, fait_le: maintenant, points: 1, parts_quart: 4 },
  { id: 4, recurrent_id: 3, titre: "Habiller Léo", categorie: "Enfant", echeance: auj,
    rang: 1, qui: null, qui2: null, fait_le: null, points: 0, parts_quart: 0 },
  { id: 5, recurrent_id: 4, titre: "Dents Léo", categorie: "Enfant", echeance: auj,
    rang: 1, qui: null, qui2: null, fait_le: null, points: 0, parts_quart: 0 },
  { id: 6, recurrent_id: 5, titre: "Dépose école", categorie: "Enfant", echeance: auj,
    rang: 1, qui: "Claudia", qui2: null, fait_le: maintenant, points: 1, parts_quart: 4 },
  { id: 7, recurrent_id: 6, titre: "Table", categorie: "Cuisine", echeance: auj,
    rang: 1, qui: null, qui2: null, fait_le: null, points: 0, parts_quart: 0 },
  { id: 8, recurrent_id: 7, titre: "LV - ranger", categorie: "Cuisine", echeance: auj,
    rang: 1, qui: "Yann", qui2: null, fait_le: maintenant, points: 1, parts_quart: 2 },
  // Soir : Chercher Léo et Bain à faire, Préparer le lait faite, Cuisine faite à deux,
  // LV - vider à faire.
  { id: 9, recurrent_id: 8, titre: "Chercher Léo", categorie: "Enfant", echeance: auj,
    rang: 1, qui: null, qui2: null, fait_le: null, points: 0, parts_quart: 0 },
  { id: 10, recurrent_id: 9, titre: "Bain", categorie: "Enfant", echeance: auj,
    rang: 1, qui: null, qui2: null, fait_le: null, points: 0, parts_quart: 0 },
  { id: 11, recurrent_id: 10, titre: "Préparer le lait", categorie: "Enfant", echeance: auj,
    rang: 1, qui: "Claudia", qui2: null, fait_le: maintenant, points: 1, parts_quart: 2 },
  { id: 12, recurrent_id: 11, titre: "Cuisine", categorie: "Cuisine", echeance: auj,
    rang: 1, qui: "Claudia", qui2: "Yann", fait_le: maintenant, points: 3, parts_quart: 12 },
  { id: 13, recurrent_id: 12, titre: "LV - vider", categorie: "Cuisine", echeance: auj,
    rang: 1, qui: null, qui2: null, fait_le: null, points: 0, parts_quart: 0 },
  // Hebdo, à échéance de la semaine (dimanche) : Courses faite à deux, les autres à faire.
  { id: 14, recurrent_id: 13, titre: "Courses", categorie: "Courses", echeance: echeanceSemaine,
    rang: 1, qui: "Yann", qui2: "Claudia", fait_le: maintenant, points: 3, parts_quart: 12 },
  { id: 15, recurrent_id: 14, titre: "Lessive", categorie: "Linge", echeance: echeanceSemaine,
    rang: 1, qui: null, qui2: null, fait_le: null, points: 0, parts_quart: 0 },
  { id: 16, recurrent_id: 15, titre: "Sols", categorie: "Ménage", echeance: echeanceSemaine,
    rang: 1, qui: null, qui2: null, fait_le: null, points: 0, parts_quart: 0 },
  { id: 17, recurrent_id: 16, titre: "Linge", categorie: "Linge", echeance: echeanceSemaine,
    rang: 1, qui: "Yann", qui2: null, fait_le: maintenant, points: 2, parts_quart: 8 },
  { id: 18, recurrent_id: 17, titre: "Draps", categorie: "Linge", echeance: echeanceSemaine,
    rang: 1, qui: null, qui2: null, fait_le: null, points: 0, parts_quart: 0 },
  // Mensuel, à fin de mois : Vitres faite, Salle de bain à faire (peuple la carte « Ce mois »).
  { id: 19, recurrent_id: 18, titre: "Salle de bain", categorie: "Ménage", echeance: finDuMois,
    rang: 1, qui: null, qui2: null, fait_le: null, points: 0, parts_quart: 0 },
  { id: 20, recurrent_id: 19, titre: "Vitres", categorie: "Ménage", echeance: finDuMois,
    rang: 1, qui: "Claudia", qui2: null, fait_le: maintenant, points: 5, parts_quart: 20 },
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

// Agenda : deux voyages autour d'aujourd'hui (un en cours, un à venir), la zone du foyer, et
// un cache de vacances scolaires (même forme que frontend/agenda/vacances.js) pour ne toucher
// AUCUN réseau pendant la recette.
export const VOYAGES = [
  { id: 1, titre: "Week-end à la mer", lieu: "Normandie", debut: ilYA(1), fin: ilYA(-1), note: "Train de 9 h", cree_par: "Yann", cree_le: ilYA(30) },
  { id: 2, titre: "Ski en famille", lieu: "Le Lioran", debut: ilYA(-40), fin: ilYA(-47), note: null, cree_par: "Claudia", cree_le: ilYA(10) },
];
export const PARAMETRES = [{ cle: "zone", valeur: "Zone C" }];
export const VACANCES_CACHE = [
  { titre: "Vacances d'exemple", zone: "Zone C", debut: ilYA(-10), fin: ilYA(-25), anneeScolaire: `${ANNEE}-${ANNEE + 1}` },
  { titre: "Vacances suivantes", zone: "Zone C", debut: ilYA(-70), fin: ilYA(-85), anneeScolaire: `${ANNEE}-${ANNEE + 1}` },
];

export const COURSES_CLASSIQUES = [
  { libelle: "Lait", quantite: "2 L", rayon: "Épicerie, alcool, lait", fois: 12, dernier_le: "2026-09-10T10:00:00Z" },
  { libelle: "Œufs", quantite: "1 boîte", rayon: "Épicerie, alcool, lait", fois: 9, dernier_le: "2026-09-18T10:00:00Z" },
  { libelle: "Papier toilette", quantite: "1 pack", rayon: "Papier et lavage", fois: 5, dernier_le: "2026-09-01T10:00:00Z" },
];
