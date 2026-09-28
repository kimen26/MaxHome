import assert from "node:assert/strict";
import { calculer, repartir, versCentimes, montantLigne, regleEffective, montantTheorique } from "../frontend/budget/calc.js";
import { montantHabituel, montantNote, champsDuMontant, montantInchange } from "../frontend/budget/habituel.js";
import { detailRegle, regleBasculee, motPartage } from "../frontend/budget/repartition.js";
import { compteDeCharge, compteSource, optionsCompte, aAutreCompte, choisirCompte } from "../frontend/budget/compte-charge.js";
import { etatDuMois, texteAFaireVide } from "../frontend/budget/etat-mois.js";

// Cas réel : Comptes 2026, février. Doit TOUJOURS donner Yann -3 236,15 ±1 ct.
const chargesFevrier = [
  { id: 1, libelle: "Crédit", categorie: "Logement", regle: "egales" },
  { id: 2, libelle: "Assurance", categorie: "Logement", regle: "proport" },
];
const lignesFevrier = { 1: -159207, 2: -425271 };
const revenusFevrier = { Yann: 612000, Claudia: 454611 };
const rf = calculer(chargesFevrier, lignesFevrier, revenusFevrier);
assert.equal(rf.total, -584478);
assert.equal(rf.totaux.egales, -159207);
assert.equal(rf.parts.Yann + rf.parts.Claudia, rf.total, "somme des parts = total");
assert.ok(Math.abs(rf.parts.Yann - -323615) <= 1, `Yann ${rf.parts.Yann}`);
assert.ok(Math.abs(rf.parts.Claudia - -260863) <= 1, `Claudia ${rf.parts.Claudia}`);
assert.ok(Math.abs(rf.ratio.Yann - 0.57378) < 1e-4);

// Reste d'arrondi va au premier, somme exacte.
const p = repartir(-1001, { A: 1, B: 1 });
assert.equal(p.A + p.B, -1001);

// Revenus à zéro : pas de division par zéro, proport partagé à parts égales.
const chargesSimples = [
  { id: 1, libelle: "Crédit", categorie: "Logement", regle: "egales" },
  { id: 2, libelle: "Assurance", categorie: "Logement", regle: "proport" },
];
const z = calculer(chargesSimples, lignesFevrier, { Yann: 0, Claudia: 0 });
assert.equal(z.parts.Yann + z.parts.Claudia, z.total);

assert.equal(versCentimes("1 450,37"), 145037);
assert.throws(() => versCentimes("abc"));

// Règle 'cle' : part du 1er membre = cle_pct %.
const chargesCle = [{ id: 1, libelle: "Test clé", categorie: "Autre", regle: "cle", cle_pct: 70 }];
const rc = calculer(chargesCle, { 1: -10000 }, { Yann: 100000, Claudia: 100000 });
assert.equal(rc.partCle.Yann, -7000);
assert.equal(rc.partCle.Claudia, -3000);
assert.equal(rc.parts.Yann + rc.parts.Claudia, -10000);

// Règle 'perso' : payée par une seule personne, hors compte commun, impacte son reste à vivre.
const chargesPerso = [
  { id: 1, libelle: "Commun", categorie: "Logement", regle: "egales" },
  { id: 2, libelle: "Perso Yann", categorie: "Autre", regle: "perso", payeur: "Yann" },
];
const rp = calculer(chargesPerso, { 1: -10000, 2: -5000 }, { Yann: 200000, Claudia: 200000 });
assert.equal(rp.totalCommun, -10000, "perso exclu du total commun");
assert.equal(rp.total, -15000, "perso inclus dans le total global");
assert.equal(rp.reste.Yann, 200000 + rp.aVerser.Yann - 5000, "perso impacte le reste du payeur (dépense de 5000)");
assert.equal(rp.reste.Claudia, 200000 + rp.aVerser.Claudia, "perso n'impacte pas l'autre membre");

// Ajustements : transfèrent montant de 'de' vers 'vers'.
const chargesAdj = [{ id: 1, libelle: "Commun", categorie: "Logement", regle: "egales" }];
const ra = calculer(chargesAdj, { 1: -10000 }, { Yann: 200000, Claudia: 200000 },
  [{ de: "Yann", vers: "Claudia", montant_centimes: 1000 }]);
assert.equal(ra.aVerser.Yann, ra.parts.Yann + 1000);
assert.equal(ra.aVerser.Claudia, ra.parts.Claudia - 1000);
assert.equal(ra.aVerser.Yann + ra.aVerser.Claudia, ra.parts.Yann + ra.parts.Claudia, "ajustement neutre sur la somme");

// Totaux par catégorie.
const chargesCat = [
  { id: 1, libelle: "A", categorie: "Logement", regle: "egales" },
  { id: 2, libelle: "B", categorie: "Alimentation", regle: "proport" },
];
const rcat = calculer(chargesCat, { 1: -1000, 2: -2000 }, { Yann: 100000, Claudia: 100000 });
assert.equal(rcat.parCategorie.Logement, -1000);
assert.equal(rcat.parCategorie.Alimentation, -2000);

// Règle du mois : lignes au format objet, `regle` surcharge celle de la charge.
const chargesRegle = [{ id: 1, libelle: "Alimentation", categorie: "Alimentation", regle: "egales" }];
const revDeuxTiers = { Yann: 200000, Claudia: 100000 };
const parDefaut = calculer(chargesRegle, { 1: { montant_centimes: -30000 } }, revDeuxTiers);
assert.equal(parDefaut.totaux.egales, -30000, "sans regle de mois, la charge garde la sienne");
assert.equal(parDefaut.parts.Yann, -15000, "egales = moitie chacun");

const surchargee = calculer(chargesRegle, { 1: { montant_centimes: -30000, regle: "proport" } }, revDeuxTiers);
assert.equal(surchargee.totaux.egales, 0, "la regle du mois retire la charge des egales");
assert.equal(surchargee.totaux.proport, -30000);
assert.equal(surchargee.parts.Yann, -20000, "prorata 2/3 pour Yann");

// La surcharge vaut aussi pour 'cle' et 'perso'.
const versCle = calculer([{ id: 1, libelle: "X", categorie: "Autre", regle: "egales", cle_pct: 80 }],
  { 1: { montant_centimes: -10000, regle: "cle" } }, { Yann: 100000, Claudia: 100000 });
assert.equal(versCle.partCle.Yann, -8000, "cle_pct de la charge s'applique a la regle du mois");

const versPerso = calculer([{ id: 1, libelle: "X", categorie: "Autre", regle: "egales", payeur: "Yann" }],
  { 1: { montant_centimes: -5000, regle: "perso" } }, { Yann: 200000, Claudia: 200000 });
assert.equal(versPerso.totalCommun, 0, "passee en perso, la charge sort du commun");
assert.equal(versPerso.reste.Yann, 195000);

// Format ancien (nombre nu) et nouveau (objet) donnent le meme resultat.
const ancien = calculer(chargesFevrier, lignesFevrier, revenusFevrier);
const nouveau = calculer(chargesFevrier, { 1: { montant_centimes: -159207 }, 2: { montant_centimes: -425271 } }, revenusFevrier);
assert.deepEqual(nouveau.parts, ancien.parts, "les deux formats de lignes sont equivalents");

assert.equal(montantLigne(-500), -500);
assert.equal(montantLigne({ montant_centimes: -500 }), -500);
assert.equal(montantLigne(undefined), 0);
assert.equal(regleEffective({ regle: "egales" }, { regle: "proport" }), "proport");
assert.equal(regleEffective({ regle: "egales" }, { regle: null }), "egales");
assert.equal(regleEffective({ regle: "egales" }, -500), "egales");

// montantTheorique : fixe / suit une charge / part d'une personne ; mode inconnu = erreur.
const contexte = { lignes: { 7: { montant_centimes: -12345, regle: null } }, resultat: { aVerser: { Yann: -323615 } } };
assert.equal(montantTheorique(null, contexte), null, "ponctuel : pas de théorique");
assert.equal(montantTheorique({ mode: "fixe", montant_centimes: 5000 }, contexte), 5000);
assert.equal(montantTheorique({ mode: "charge", charge_id: 7 }, contexte), -12345);
assert.equal(montantTheorique({ mode: "charge", charge_id: 99 }, contexte), 0, "charge sans montant ce mois");
assert.equal(montantTheorique({ mode: "part", prenom_part: "Yann" }, contexte), 323615, "part = virement positif");
assert.throws(() => montantTheorique({ mode: "??" }, contexte), /inconnu/);

// Montant habituel (D-040) : « Toujours le même » = le montant noté ; « Change chaque mois » =
// le dernier saisi, à défaut le montant noté ; rien à proposer = null.
const derniers = { 1: -5500 };
assert.equal(montantHabituel({ id: 1, defaut_dernier: false, montant_defaut: -120000 }, derniers), -120000, "fixe : le noté, même s'il y a un dernier");
assert.equal(montantHabituel({ id: 1, defaut_dernier: true, montant_defaut: -9000 }, derniers), -5500, "variable : le dernier");
assert.equal(montantHabituel({ id: 2, defaut_dernier: true, montant_defaut: -9000 }, derniers), -9000, "variable sans dernier : le noté");
assert.equal(montantHabituel({ id: 2, defaut_dernier: true, montant_defaut: null }, derniers), null);
assert.equal(montantHabituel({ id: 2, defaut_dernier: false, montant_defaut: null }, derniers), null);

// Part de chacun affichée sous chaque règle : le second complète à 100, jamais 101 %.
const etatDetail = { membres: [{ prenom: "Yann" }, { prenom: "Claudia" }],
  resultat: { totalRevenus: 1000, ratio: { Yann: 0.57378, Claudia: 0.42622 } } };
assert.equal(detailRegle("egales", etatDetail), "Y 50 % · C 50 %");
assert.equal(detailRegle("proport", etatDetail), "Y 57 % · C 43 %");
assert.equal(detailRegle("proport", { ...etatDetail, resultat: { totalRevenus: 0, ratio: {} } }), "salaires à saisir");
assert.equal(detailRegle("cle", etatDetail, { cle_pct: 60 }), "Y 60 % · C 40 %");
assert.equal(detailRegle("perso", etatDetail, { payeur: "Claudia" }), "payé par Claudia");
assert.throws(() => detailRegle("??", etatDetail), /inconnue/);

// État du mois (D-042) : salaire, puis charge sans montant, puis virement — jamais « tout est
// fait » tant qu'un salaire ou une charge manque (septembre 2026 : deux virements cochés avant
// la saisie des salaires faisaient dire « Tout est viré »).
const moisComplet = {
  mois: 9, membres: [{ prenom: "Yann" }, { prenom: "Claudia" }],
  revenus: { Yann: 280000, Claudia: 250000 },
  charges: [
    { id: 1, actif: true, ponctuel: false }, { id: 2, actif: true, ponctuel: false },
    { id: 3, actif: false, ponctuel: false }, { id: 4, actif: true, ponctuel: true },
  ],
  lignes: { 1: { montant_centimes: -1000 }, 2: { montant_centimes: 0 } }, // 0 saisi = rempli
  mouvements: [{ id: 1, fait_le: "2026-09-13T10:00:00Z" }, { id: 2, fait_le: "2026-09-13T10:00:00Z" }],
};
const fait = etatDuMois(moisComplet);
assert.equal(fait.statut, "fait", "charge inactive et ponctuelle sans ligne ne manquent pas");
assert.equal(fait.phrase, "Tout est viré pour septembre");
assert.equal(texteAFaireVide(fait), "Tout est fait pour ce mois.");

const unSalaire = etatDuMois({ ...moisComplet, revenus: { Yann: 280000, Claudia: 0 } });
assert.equal(unSalaire.statut, "salaires", "virements tous cochés mais salaire manquant");
assert.equal(unSalaire.phrase, "Salaire de Claudia à noter");
assert.equal(texteAFaireVide(unSalaire), "Salaire de Claudia à noter avant de faire les virements.");
const deuxSalaires = etatDuMois({ ...moisComplet, revenus: {}, lignes: {} });
assert.equal(deuxSalaires.phrase, "Salaires à noter", "le salaire passe avant les charges");

const chargesVides = etatDuMois({ ...moisComplet, lignes: {} });
assert.equal(chargesVides.statut, "charges");
assert.equal(chargesVides.phrase, "2 charges à remplir");
assert.equal(etatDuMois({ ...moisComplet, lignes: { 1: { montant_centimes: -1000 } } }).phrase, "1 charge à remplir");
assert.ok(!texteAFaireVide(chargesVides).includes("Tout est fait"), "jamais « tout est fait » avec une charge vide");

const aVirer = etatDuMois({ ...moisComplet, mouvements: [{ id: 1, fait_le: null }, { id: 2, fait_le: "2026-09-13T10:00:00Z" }] });
assert.equal(aVirer.statut, "virements");
assert.equal(aVirer.phrase, "1 virement à faire en septembre");
assert.equal(etatDuMois({ ...moisComplet, mouvements: [{ fait_le: null }, { fait_le: null }] }).phrase, "2 virements à faire en septembre");

const sansMouvement = etatDuMois({ ...moisComplet, mouvements: [] });
assert.equal(sansMouvement.statut, "aucun");
assert.equal(sansMouvement.phrase, "Aucun virement prévu");
assert.equal(texteAFaireVide(sansMouvement), "Aucun virement prévu. Ajoute les virements dans Réglages · Comptes.");
assert.equal(texteAFaireVide(etatDuMois({ ...moisComplet, mouvements: [], revenus: {} })),
  "Aucun virement prévu. Ajoute les virements dans Réglages · Comptes.", "sans virement, la carte le dit même si un salaire manque");

// ---------- Réglages · Charges en rangées (D-042) ----------
// Partage : un toucher bascule 50/50 ↔ Prorata ; une règle rare ne bascule pas (feuille).
assert.equal(regleBasculee("egales"), "proport");
assert.equal(regleBasculee("proport"), "egales");
assert.equal(regleBasculee("cle"), null);
assert.equal(regleBasculee("perso"), null);
assert.equal(motPartage({ regle: "egales" }), "50/50");
assert.equal(motPartage({ regle: "proport" }), "Prorata");
assert.equal(motPartage({ regle: "cle", cle_pct: 60 }), "Clé 60 %");
assert.equal(motPartage({ regle: "perso", payeur: "Yann" }), "Un seul paie");

// Montant tapé dans la rangée : noté = « Toujours le même », vidé = on reprend le dernier.
assert.equal(montantNote({ defaut_dernier: false, montant_defaut: -120000 }), -120000);
assert.equal(montantNote({ defaut_dernier: true, montant_defaut: -120000 }), null, "variable : rien de noté à montrer");
assert.deepEqual(champsDuMontant("-1 450,37"), { montant_defaut: -145037, defaut_dernier: false });
assert.deepEqual(champsDuMontant("1450,37"), { montant_defaut: 145037, defaut_dernier: false }, "signe : ce qui est tapé, comme l'écran Mois");
assert.deepEqual(champsDuMontant("  "), { defaut_dernier: true });
assert.throws(() => champsDuMontant("abc"), /invalide/);
assert.equal(montantInchange({ defaut_dernier: true }, { defaut_dernier: true }), true);
assert.equal(montantInchange({ defaut_dernier: false, montant_defaut: -9000 }, { defaut_dernier: true }), false);
assert.equal(montantInchange({ defaut_dernier: false, montant_defaut: -9000 }, champsDuMontant("-90")), true);
assert.equal(montantInchange({ defaut_dernier: true, montant_defaut: -9000 }, champsDuMontant("-90")), false, "passe en « Toujours le même »");

// Où va l'argent : le récurrent ACTIF en mode charge de cette charge, sinon Commun (null).
const comptesT = [
  { id: 1, nom: "Compte commun", titulaire: null, commun: true },
  { id: 2, nom: "Compte Claudia", titulaire: "Claudia", commun: false },
  { id: 3, nom: "Livret A", titulaire: null, commun: false },
];
const elec = { id: 2, libelle: "Électricité", regle: "proport" };
const recT = (champs) => ({ id: 9, mode: "charge", charge_id: 2, compte_de: 1, compte_vers: 3, actif: true,
  titre: "Électricité → Livret A", ...champs });
assert.equal(compteDeCharge(elec, []), null, "sans récurrent : Commun");
assert.equal(compteDeCharge(elec, [recT()]), 3);
assert.equal(compteDeCharge(elec, [recT({ actif: false })]), null, "récurrent éteint : Commun");
assert.equal(compteDeCharge(elec, [recT({ charge_id: 5 })]), null, "récurrent d'une autre charge");
assert.equal(compteDeCharge(elec, [recT({ mode: "fixe" })]), null, "pas en mode charge");
assert.deepEqual(optionsCompte(comptesT), [["", "Commun"], [2, "Compte Claudia"], [3, "Livret A"]]);
assert.deepEqual(optionsCompte([]), [["", "Commun"]], "aucun compte en base : Commun seul");
assert.equal(aAutreCompte([comptesT[0]]), false);
assert.equal(aAutreCompte(comptesT), true);
assert.equal(compteSource(elec, comptesT), 1, "le virement part du commun");
assert.equal(compteSource({ ...elec, regle: "perso", payeur: "Claudia" }, comptesT), 2, "un seul paie : du compte du payeur");
assert.equal(compteSource(elec, []), null);

/** Api espionne : note chaque écriture, rend ce que rendrait Supabase. */
function apiEspion() {
  const appels = [];
  return {
    appels,
    creerRecurrent: async (champs) => { appels.push(["creerRecurrent", champs]); return { id: 50, ...champs }; },
    majRecurrent: async (id, champs) => { appels.push(["majRecurrent", id, champs]); },
    majMouvement: async (id, champs) => { appels.push(["majMouvement", id, champs]); },
    supprimerMouvement: async (id) => { appels.push(["supprimerMouvement", id]); },
  };
}
const etatT = (recurrents = [], mouvements = []) => ({ comptes: comptesT, recurrents, mouvements });

{ // Première fois : un récurrent est créé, du commun vers le compte choisi, le 5.
  const api = apiEspion();
  const etat = etatT();
  assert.equal(await choisirCompte(api, etat, elec, 3), true);
  assert.deepEqual(api.appels, [["creerRecurrent", { titre: "Électricité → Livret A", compte_de: 1, compte_vers: 3,
    actif: true, mode: "charge", charge_id: 2, montant_centimes: null, prenom_part: null, qui: null, jour: 5,
    consigne: null, ordre: 100 }]]);
  assert.equal(compteDeCharge(elec, etat.recurrents), 3, "etat.recurrents tenu à jour");
}
{ // Même compte : rien n'est écrit, pas de rechargement.
  const api = apiEspion();
  assert.equal(await choisirCompte(api, etatT([recT()]), elec, 3), false);
  assert.equal(api.appels.length, 0);
}
{ // Autre compte : le récurrent change, le virement NON coché du mois le suit.
  const api = apiEspion();
  const etat = etatT([recT()], [{ id: 40, recurrent_id: 9, fait_le: null, compte_vers: 3 }, { id: 41, recurrent_id: 1, fait_le: null }]);
  assert.equal(await choisirCompte(api, etat, elec, 2), true);
  const champs = { titre: "Électricité → Compte Claudia", compte_de: 1, compte_vers: 2 };
  assert.deepEqual(api.appels, [["majRecurrent", 9, { ...champs, actif: true }], ["majMouvement", 40, champs]]);
  assert.equal(etat.mouvements[0].compte_vers, 2);
  assert.equal(compteDeCharge(elec, etat.recurrents), 2);
}
{ // Retour à Commun : récurrent éteint, virement non coché retiré, virement coché gardé.
  const api = apiEspion();
  const etat = etatT([recT()], [{ id: 40, recurrent_id: 9, fait_le: null }, { id: 42, recurrent_id: 9, fait_le: "2026-02-05" }]);
  assert.equal(await choisirCompte(api, etat, elec, null), true);
  assert.deepEqual(api.appels, [["majRecurrent", 9, { actif: false }], ["supprimerMouvement", 40]]);
  assert.deepEqual(etat.mouvements.map((m) => m.id), [42]);
  assert.equal(compteDeCharge(elec, etat.recurrents), null);
  assert.equal(await choisirCompte(apiEspion(), etat, elec, null), false, "déjà Commun : rien à écrire");
}
{ // Un récurrent éteint est repris (pas de doublon à chaque aller-retour).
  const api = apiEspion();
  const etat = etatT([recT({ actif: false })]);
  assert.equal(await choisirCompte(api, etat, elec, 3), true);
  assert.deepEqual(api.appels, [["majRecurrent", 9, { titre: "Électricité → Livret A", compte_de: 1, compte_vers: 3, actif: true }]]);
  assert.equal(etat.recurrents.length, 1);
}
{ // Deux actifs (donnée abîmée) : un seul reste, AU PLUS UN récurrent actif par charge.
  const api = apiEspion();
  const etat = etatT([recT(), recT({ id: 10, compte_vers: 2 })]);
  await choisirCompte(api, etat, elec, 3);
  assert.equal(etat.recurrents.filter((r) => r.actif).length, 1);
  assert.deepEqual(api.appels, [["majRecurrent", 10, { actif: false }]]);
}
{ // Un seul paie : le virement part du compte du payeur.
  const api = apiEspion();
  await choisirCompte(api, etatT(), { ...elec, regle: "perso", payeur: "Claudia" }, 3);
  assert.equal(api.appels[0][1].compte_de, 2);
}
await assert.rejects(() => choisirCompte(apiEspion(), etatT(), elec, 99), /introuvable/);

console.log("test_calc OK");
