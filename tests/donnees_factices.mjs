// Données factices pour la recette hors ligne (tests/recette_ecrans.mjs).
// Génériques et sans rien de personnel : prénoms Claudia/Yann (déjà publics dans le code),
// montants ronds inventés, tâches et articles génériques repris des migrations de départ.
// L'enfant s'appelle « Léo » ICI, prénom d'exemple : ce fichier est versionné dans un dépôt
// public (invariant 1). Le vrai prénom vit en base, posé par scripts/renommer_enfant.py.
// Le format de chaque table suit exactement les colonnes lues par frontend/socle/api.js
// (voir supabase/migrations/*.sql pour le schéma).

import { genererQrFactice, genererQrFactieDataUrl } from "./qr_factice.mjs";

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

// Charges en montants NÉGATIFS, comme en base (docs/regles-repartition.md). Chaque état qu'un
// écran sait dire a sa charge : référence fixe, « dernier montant saisi », mois qui diffère de
// la référence (Crédit immobilier), montant du mois pas encore saisi (Impôts), règle rare
// (Assurance, clé fixe), catégorie hors liste (Léo), ligne ponctuelle (Resto), charge terminée
// sans ligne ce mois (Ancienne box internet, D-043 : elle peuple la carte « Terminées » et ne
// doit apparaître nulle part sur l'écran Mois).
export const CHARGES = [
  { id: 1, libelle: "Crédit immobilier", ordre: 10, categorie: "Logement", type: "egales", regle: "egales",
    cle_pct: null, payeur: null, ponctuel: false, montant_defaut: -120000, defaut_dernier: false },
  { id: 2, libelle: "Électricité", ordre: 20, categorie: "Logement", type: "proport", regle: "proport",
    cle_pct: null, payeur: null, ponctuel: false, montant_defaut: -9000, defaut_dernier: false },
  { id: 3, libelle: "Alimentation", ordre: 30, categorie: "Alimentation", type: "egales", regle: "egales",
    cle_pct: null, payeur: null, ponctuel: false, montant_defaut: -60000, defaut_dernier: true },
  { id: 4, libelle: "Impôts", ordre: 40, categorie: "Impôts", type: "proport", regle: "proport",
    cle_pct: null, payeur: null, ponctuel: false, montant_defaut: -25000, defaut_dernier: false },
  { id: 5, libelle: "Crèche", ordre: 50, categorie: "Léo", type: "egales", regle: "egales",
    cle_pct: null, payeur: null, ponctuel: false, montant_defaut: -45000, defaut_dernier: true },
  { id: 6, libelle: "Assurance habitation", ordre: 60, categorie: "Logement", type: "cle", regle: "cle",
    cle_pct: 60, payeur: null, ponctuel: false, montant_defaut: -3890, defaut_dernier: false },
  { id: 7, libelle: "Resto anniversaire", ordre: 70, categorie: "Autre", type: "egales", regle: "egales",
    cle_pct: null, payeur: null, ponctuel: true, montant_defaut: null, defaut_dernier: false },
  { id: 8, libelle: "Ancienne box internet", ordre: 80, categorie: "Logement", type: "egales", regle: "egales",
    cle_pct: null, payeur: null, ponctuel: false, montant_defaut: -3500, defaut_dernier: true, actif: false },
];

const MONTANT_DU_MOIS = { 1: -125000, 7: -8640 }; // Crédit immobilier ≠ référence ; Resto ponctuel
// Impôts : pas encore saisi ce mois. Ancienne box internet : terminée AVANT ce mois, sans ligne
// (D-043) — c'est la seule façon qu'elle n'apparaisse nulle part sur l'écran Mois.
const SANS_MONTANT = new Set([4, 8]);
export const LIGNES = CHARGES.filter((c) => !SANS_MONTANT.has(c.id)).map((c) => ({
  annee: ANNEE, mois: MOIS, charge_id: c.id, montant_centimes: MONTANT_DU_MOIS[c.id] ?? c.montant_defaut, regle: null,
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
    compte_de: 2, compte_vers: 1, montant_centimes: 120000, qui: "Claudia", consigne: null,
    fait_le: null, fait_par: null },
  { id: 2, annee: ANNEE, mois: MOIS, recurrent_id: 2, titre: "Virement au commun — Yann",
    compte_de: 3, compte_vers: 1, montant_centimes: 134000, qui: "Yann", consigne: null,
    fait_le: new Date().toISOString(), fait_par: "Yann" },
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
    parts_quart: 4, obligatoire: true, partageable: false, ecart_prenom: null, minutes: 15, moment: "matin", cree_le: ilYAHeure(400, 0),
    // Part spé (D-038) : la dépose coûte plus à Claudia — la ligne « Parts de chacun » apparaît.
    parts_spe: { Claudia: 8, Yann: 4 } },
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
  // -- D-041 : créneaux (midi le week-end), tâche à étapes (dont une facultative), variantes,
  // répétable. Le rythme des étapes vient de leur parent ; le parent ne crée aucune occurrence.
  { id: 30, titre: "Faire manger Léo", categorie: "Enfant", frequence: "quotidien", fois: 3, ordre: 5, actif: true,
    attribue_a: null, consigne: null, parts_quart: 12, obligatoire: true, minutes: 15, moment: null, repetable: false,
    creneaux: [{ moment: "matin", jours: "tous" }, { moment: "midi", jours: "tous" }, { moment: "soir", jours: "tous" }], cree_le: ilYAHeure(400, 0) },
  { id: 31, titre: "Débarrasser", categorie: "Cuisine", frequence: "quotidien", fois: 1, ordre: 125, actif: true,
    attribue_a: null, consigne: null, parts_quart: 8, obligatoire: false, minutes: 10, moment: null,
    creneaux: [{ moment: "soir", jours: "tous" }], cree_le: ilYAHeure(400, 0) },
  { id: 32, parent_id: 31, titre: "Vider et nettoyer la table", categorie: "Cuisine", frequence: "quotidien", fois: 1, ordre: 1, actif: true,
    attribue_a: null, consigne: null, parts_quart: 4, obligatoire: false, minutes: 5, moment: null, cree_le: ilYAHeure(400, 0) },
  { id: 33, parent_id: 31, titre: "Remplir le lave-vaisselle", categorie: "Cuisine", frequence: "quotidien", fois: 1, ordre: 2, actif: true,
    attribue_a: null, consigne: null, parts_quart: 4, obligatoire: false, minutes: 5, moment: null, cree_le: ilYAHeure(400, 0) },
  { id: 34, parent_id: 31, titre: "Vaisselle à la main", categorie: "Cuisine", frequence: "quotidien", fois: 1, ordre: 3, actif: true,
    attribue_a: null, consigne: null, parts_quart: 8, obligatoire: false, minutes: 10, moment: null, facultatif: true, cree_le: ilYAHeure(400, 0) },
  { id: 35, titre: "Faire à manger", categorie: "Cuisine", frequence: "quotidien", fois: 1, ordre: 124, actif: true,
    attribue_a: null, consigne: null, parts_quart: 4, obligatoire: true, minutes: 5, moment: null,
    creneaux: [{ moment: "soir", jours: "tous" }],
    variantes: [{ nom: "Réchauffer", minutes: 5 }, { nom: "Commandé", minutes: 5 }, { nom: "Cuisiner", minutes: 40 }], cree_le: ilYAHeure(400, 0) },
  { id: 36, titre: "Laver les biberons", categorie: "Enfant", frequence: "quotidien", fois: 1, ordre: 6, actif: true,
    attribue_a: null, consigne: null, parts_quart: 4, obligatoire: true, minutes: 5, moment: null, repetable: true,
    creneaux: [{ moment: "soir", jours: "tous" }], cree_le: ilYAHeure(400, 0) },
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
    rang: 1, qui: "Claudia", qui2: "Yann", fait_le: maintenant, points: 3, parts_quart: 12,
    // À deux depuis 017 (D-038) : chacun ses parts, Yann au tiers ; l'autre ligne à deux reste
    // au format d'avant (base divisée) pour que les deux formes soient rendues.
    parts_quart2: 12, tiers: 3, tiers2: 1 },
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
  { id: 1, titre: "Week-end à la mer", lieu: "Normandie", debut: ilYA(1), fin: ilYA(-1), note: "Train de 9 h", cree_par: "Yann", cree_le: ilYA(30),
    topo: "## À savoir\nLe **camping** ferme à 22 h. Prévoir des bottes si marée haute.\n\n- Marché le dimanche matin\n- [Météo locale](https://meteo.example/normandie)",
    topo_le: ilYA(2) },
  { id: 2, titre: "Ski en famille", lieu: "Le Lioran", debut: ilYA(-40), fin: ilYA(-47), note: null, cree_par: "Claudia", cree_le: ilYA(10) },
];
export const PARAMETRES = [{ cle: "zone", valeur: "Zone C" }];
export const VACANCES_CACHE = [
  { titre: "Vacances d'exemple", zone: "Zone C", debut: ilYA(-10), fin: ilYA(-25), anneeScolaire: `${ANNEE}-${ANNEE + 1}` },
  { titre: "Vacances suivantes", zone: "Zone C", debut: ilYA(-70), fin: ilYA(-85), anneeScolaire: `${ANNEE}-${ANNEE + 1}` },
];

// ---------- module Agenda : carnet de voyage (voyage 1, « Week-end à la mer ») ----------
// 3 résas : vol avec code (payé par Yann), logement (sans payeur — teste « non payé »),
// voiture (annulée — exclue des totaux, carnet.js::totauxResas).
export const VOYAGE_RESAS = [
  { id: 1, voyage_id: 1, type: "vol", titre: "Aller Paris → Deauville", debut: `${ilYA(1)}T07:30:00`, fin: `${ilYA(1)}T08:45:00`,
    prestataire: "Air Littoral", code: "XR7K2P", prix_centimes: 8900, paye_par: "Yann", statut: "reserve",
    lieu_id: null, note: null, cree_par: "Yann", cree_le: ilYA(30) },
  { id: 2, voyage_id: 1, type: "logement", titre: "Gîte les Embruns", debut: `${ilYA(1)}T15:00:00`, fin: `${ilYA(-1)}T10:00:00`,
    prestataire: "Gîtes de France", code: null, prix_centimes: 24000, paye_par: null, statut: "reserve",
    lieu_id: null, note: "Code boîte à clés envoyé par SMS la veille.", cree_par: "Yann", cree_le: ilYA(28) },
  { id: 3, voyage_id: 1, type: "voiture", titre: "Location voiture gare", debut: `${ilYA(1)}T09:00:00`, fin: `${ilYA(-1)}T18:00:00`,
    prestataire: "Europcar", code: "LOC4419", prix_centimes: 6500, paye_par: "Claudia", statut: "annule",
    lieu_id: null, note: "Annulée : covoiturage avec les Martin finalement.", cree_par: "Claudia", cree_le: ilYA(20) },
];

// 8 lieux : 2 sans position (« à localiser »), 3 datés sur 2 jours différents, le reste sans
// date. Catégories variées pour peupler la légende de la carte (carnet.js::CATEGORIES_LIEU).
export const VOYAGE_LIEUX = [
  { id: 1, voyage_id: 1, nom: "Plage de Deauville", categorie: "a_voir", statut: "prevu", jour: ilYA(1), ordre: 1,
    lat: 49.3573, lng: 0.0708, adresse: "Plage de Deauville, 14800 Deauville", note: "Planches en bois célèbres.", lien: null, cree_par: "Yann", cree_le: ilYA(29) },
  { id: 2, voyage_id: 1, nom: "Marché de Deauville", categorie: "a_voir", statut: "idee", jour: ilYA(1), ordre: 2,
    lat: 49.3565, lng: 0.0721, adresse: "Marché, place Morny, 14800 Deauville", note: null, lien: null, cree_par: "Yann", cree_le: ilYA(29) },
  { id: 3, voyage_id: 1, nom: "Restaurant Le Ponton", categorie: "resto", statut: "prevu", jour: ilYA(0), ordre: 1,
    lat: 49.3601, lng: 0.0755, adresse: "Le Ponton, quai de la Marine, 14800 Deauville", note: "Réserver pour 19 h 30.", lien: null, cree_par: "Claudia", cree_le: ilYA(15) },
  { id: 4, voyage_id: 1, nom: "Gîte les Embruns", categorie: "logement", statut: "prevu", jour: null, ordre: 0,
    lat: 49.3540, lng: 0.0690, adresse: "12 rue des Embruns, 14800 Deauville", note: null, lien: null, cree_par: "Yann", cree_le: ilYA(28) },
  { id: 5, voyage_id: 1, nom: "Gare de Deauville", categorie: "transport", statut: "fait", jour: null, ordre: 0,
    lat: 49.3465, lng: 0.0819, adresse: "Gare de Deauville-Trouville", note: null, lien: null, cree_par: "Yann", cree_le: ilYA(30) },
  { id: 6, voyage_id: 1, nom: "Aquarium de Trouville", categorie: "activite", statut: "idee", jour: null, ordre: 0,
    lat: null, lng: null, adresse: null, note: "À localiser : deux communes portent ce nom.", lien: null, cree_par: "Claudia", cree_le: ilYA(12) },
  { id: 7, voyage_id: 1, nom: "Vieille ville", categorie: "a_voir", statut: "idee", jour: null, ordre: 0,
    lat: null, lng: null, adresse: null, note: null, lien: null, cree_par: "Claudia", cree_le: ilYA(11) },
  { id: 8, voyage_id: 1, nom: "Cabane à huîtres oubliée", categorie: "resto", statut: "ecarte", jour: null, ordre: 0,
    lat: 49.3610, lng: 0.0740, adresse: "Cabane à huîtres, Deauville", note: "Fermée hors saison.", lien: null, cree_par: "Yann", cree_le: ilYA(9) },
];

// Une pièce image qui RESSEMBLE à un QR (damier 21x21 + 3 carrés de repérage, tests/qr_factice.mjs),
// servie en data: par le bouchon Storage — jamais un vrai QR encodé, la recette ne scanne rien,
// mais assez pour juger si une vignette/un plein écran affiche un QR lisible (relecture §F : un
// carré noir uniforme ne permettait pas de juger l'affichage).
export const PIECE_QR_PNG_DATA_URL = genererQrFactieDataUrl();
export const VOYAGE_PIECES = [
  { id: 1, voyage_id: 1, resa_id: 1, nom: "Billet-avion.png", chemin: "1/billet-avion.png", type_mime: "image/png",
    taille: genererQrFactice().length, cree_par: "Yann", cree_le: ilYA(30) },
];

export const COURSES_CLASSIQUES = [
  { libelle: "Lait", quantite: "2 L", rayon: "Épicerie, alcool, lait", fois: 12, dernier_le: "2026-09-10T10:00:00Z" },
  { libelle: "Œufs", quantite: "1 boîte", rayon: "Épicerie, alcool, lait", fois: 9, dernier_le: "2026-09-18T10:00:00Z" },
  { libelle: "Papier toilette", quantite: "1 pack", rayon: "Papier et lavage", fois: 5, dernier_le: "2026-09-01T10:00:00Z" },
];
