import assert from "node:assert/strict";
import { calculer, repartir, versCentimes, montantLigne, regleEffective, montantTheorique } from "../frontend/budget/calc.js";
import { montantHabituel, montantNote, champsDuMontant, montantInchange } from "../frontend/budget/habituel.js";
import { detailRegle, regleBasculee, motPartage } from "../frontend/budget/repartition.js";
import { compteDeCharge, compteSource, optionsCompte, aAutreCompte, choisirCompte, compteCommun } from "../frontend/budget/compte-charge.js";
import { etatDuMois, texteAFaireVide } from "../frontend/budget/etat-mois.js";
import { champsCycle, valeurCourante, valeurAffichee, prochaineValeur, SANS_PRENOM, champsMouvementLie, preparerBascule, appliquerBascule, annulerBascule, ecrireBascule } from "../frontend/budget/coche-ligne.js";
import { construireGroupes, preparerBasculeGroupe, lignesAFaire, lignesFaites } from "../frontend/budget/groupes-virements.js";
import { construireGroupesDestinataires, totalGroupe, comptageValidation, trierGroupesDestinataires, totauxParSource, CLE_COMMUN } from "../frontend/budget/par-destinataire.js";

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

// État du mois (D-042) : salaire, puis charge sans montant, puis validation (virement ou ligne
// de charge) — jamais « tout est fait » tant qu'un salaire ou une charge manque (septembre
// 2026 : deux virements cochés avant la saisie des salaires faisaient dire « Tout est viré »).
// D-046 (Yann 2026-09-29) : chaque ligne de charge se valide aussi, une à une — « à faire »
// compte donc les mouvements non faits ET les lignes de charge saisies non validées.
const moisComplet = {
  mois: 9, membres: [{ prenom: "Yann" }, { prenom: "Claudia" }],
  revenus: { Yann: 280000, Claudia: 250000 },
  charges: [
    { id: 1, actif: true, ponctuel: false }, { id: 2, actif: true, ponctuel: false },
    { id: 3, actif: false, ponctuel: false }, { id: 4, actif: true, ponctuel: true },
  ],
  // Les deux lignes de charges actives sont déjà validées ; « 0 saisi » compte comme rempli
  // (règle inchangée de ui-mois-charges.js::saisie).
  lignes: {
    1: { montant_centimes: -1000, fait_le: "2026-09-13T10:00:00Z", fait_par: "Yann" },
    2: { montant_centimes: 0, fait_le: "2026-09-13T10:00:00Z", fait_par: null },
  },
  mouvements: [{ id: 1, fait_le: "2026-09-13T10:00:00Z" }, { id: 2, fait_le: "2026-09-13T10:00:00Z" }],
  recurrents: [],
};
const fait = etatDuMois(moisComplet);
assert.equal(fait.statut, "fait", "charge inactive et ponctuelle sans ligne ne manquent pas");
assert.equal(fait.phrase, "Tout est validé pour septembre");
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
assert.equal(etatDuMois({ ...moisComplet, lignes: { 1: moisComplet.lignes[1] } }).phrase, "1 charge à remplir");
assert.ok(!texteAFaireVide(chargesVides).includes("Tout est fait"), "jamais « tout est fait » avec une charge vide");

// Un mouvement non fait à valider.
const aVirer = etatDuMois({ ...moisComplet, mouvements: [{ id: 1, fait_le: null }, { id: 2, fait_le: "2026-09-13T10:00:00Z" }] });
assert.equal(aVirer.statut, "virements");
assert.equal(aVirer.phrase, "1 à valider en septembre");
assert.equal(etatDuMois({ ...moisComplet, mouvements: [{ fait_le: null }, { fait_le: null }] }).phrase, "2 à valider en septembre");

// Une ligne de charge saisie mais non validée compte aussi, même si tous les mouvements sont faits.
const ligneAValider = etatDuMois({ ...moisComplet,
  lignes: { ...moisComplet.lignes, 1: { montant_centimes: -1000, fait_le: null, fait_par: null } } });
assert.equal(ligneAValider.statut, "virements");
assert.equal(ligneAValider.phrase, "1 à valider en septembre");
assert.equal(texteAFaireVide(ligneAValider), "Reste 1 à valider dans les catégories.",
  "la carte À faire vide ne dit jamais « tout est fait » s'il reste une ligne à valider");

// Un mouvement en mode "charge" n'est plus compté comme mouvement (sa case est sur sa ligne) ;
// tant que sa ligne est validée, il ne pèse pas deux fois dans « à faire ».
const modeChargeOk = etatDuMois({ ...moisComplet,
  mouvements: [{ id: 3, recurrent_id: 9, fait_le: null }],
  recurrents: [{ id: 9, mode: "charge", charge_id: 1 }] });
assert.equal(modeChargeOk.statut, "fait", "mouvement mode charge exclu, sa ligne est déjà validée");

const sansMouvement = etatDuMois({ ...moisComplet, mouvements: [], lignes: {}, charges: [] });
assert.equal(sansMouvement.statut, "aucun");
assert.equal(sansMouvement.phrase, "Aucun virement prévu");
assert.equal(texteAFaireVide(sansMouvement), "Aucun virement prévu. Ajoute les virements dans Réglages · Comptes.");
assert.equal(texteAFaireVide(etatDuMois({ ...moisComplet, mouvements: [], lignes: {}, charges: [], revenus: {} })),
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

// Plusieurs comptes communs (courant joint + joint épargne) : « Commun » = le premier de la
// liste (id le plus petit) ; les autres comptes communs sont des destinations comme les autres.
const secondaireCommun = { id: 4, nom: "Joint épargne", titulaire: null, commun: true };
const comptesTMultiCommun = [...comptesT, secondaireCommun];
assert.equal(compteCommun(comptesTMultiCommun).id, 1, "le principal reste le premier compte commun");
assert.deepEqual(optionsCompte(comptesTMultiCommun),
  [["", "Commun"], [2, "Compte Claudia"], [3, "Livret A"], [4, "Joint épargne"]],
  "le commun secondaire est proposé, le principal non");
assert.equal(aAutreCompte([comptesT[0], secondaireCommun]), true, "un commun secondaire compte comme autre compte");

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

// ---------- Cycle de validation (D-048 : rien → moi → l'autre → rien) ----------
{
  const c = champsCycle(null, "Yann", null);
  assert.equal(c.fait_par, "Yann");
  assert.ok(c.fait_le && !Number.isNaN(Date.parse(c.fait_le)), "fait_le est une date ISO valide");
}
// Changement de personne (pas la première coche) : fait_le GARDÉ, pas régénéré.
assert.deepEqual(champsCycle("Yann", "Claudia", "2026-09-29T10:00:00Z"),
  { fait_le: "2026-09-29T10:00:00Z", fait_par: "Claudia" }, "changement de personne : date gardée");
assert.deepEqual(champsCycle("Claudia", null, "2026-09-29T10:00:00Z"),
  { fait_le: null, fait_par: null }, "retour à rien : les deux à null");

// valeurCourante : dérivée de fait_le/fait_par, jamais recalculée à part.
assert.equal(valeurCourante({ fait_le: null, fait_par: null }), null);
assert.equal(valeurCourante({ fait_le: "x", fait_par: "Yann" }), "Yann");
assert.equal(valeurCourante(undefined), null, "pas de ligne du tout : rien");

// ---------- D-048 : coché SANS prénom (coches d'avant D-048, ou posées par le bot) ----------
// Une ligne fait_le posé + fait_par null n'est PAS « rien » : la case doit rester cochée
// (« ✓ » plein, jamais vide), donc valeurCourante renvoie le marqueur dédié SANS_PRENOM.
assert.equal(valeurCourante({ fait_le: "2026-09-25T00:00:00Z", fait_par: null }), SANS_PRENOM,
  "coché sans fait_par (bot, ancienne coche) : SANS_PRENOM, jamais null (case vide = mensonge)");
assert.notEqual(SANS_PRENOM, null, "SANS_PRENOM est distinct de null (rien) par construction");

// valeurAffichee : traduit SANS_PRENOM en `true` pour caseCycle (socle agnostique du Symbol du
// Budget) ; toute autre valeur (null, un prénom) passe inchangée.
assert.equal(valeurAffichee(SANS_PRENOM), true);
assert.equal(valeurAffichee(null), null);
assert.equal(valeurAffichee("Yann"), "Yann");

// prochaineValeur : depuis SANS_PRENOM, avance vers le PREMIER membre du cycle — comme depuis
// null, jamais un indexOf(Symbol) qui retomberait sur la première valeur par défaut ET
// laisserait faussement croire qu'on est reparti de zéro (le cas se confond avec `null` par
// hasard dans l'implémentation naïve de `suivante`, mais la sémantique voulue est la même ici :
// un cran depuis un état déjà validé va vers le premier membre, jamais vers « rien »).
const valeursDeuxMembres = [null, "Yann", "Claudia"];
assert.equal(prochaineValeur(valeursDeuxMembres, SANS_PRENOM), "Yann", "SANS_PRENOM -> premier membre");
assert.equal(prochaineValeur(valeursDeuxMembres, null), "Yann", "null -> premier membre (inchangé)");
assert.equal(prochaineValeur(valeursDeuxMembres, "Yann"), "Claudia", "cycle normal inchangé");
assert.equal(prochaineValeur(valeursDeuxMembres, "Claudia"), null, "dernier membre -> rien");

// champsCycle : depuis SANS_PRENOM (courant), avancer vers un membre GARDE fait_le existant
// (la ligne était déjà cochée, pas de nouvelle date) — même règle que depuis un prénom.
const dejaCoche = "2026-09-25T00:00:00Z";
assert.deepEqual(champsCycle(SANS_PRENOM, "Yann", dejaCoche), { fait_le: dejaCoche, fait_par: "Yann" },
  "avancer depuis SANS_PRENOM : date gardée, jamais régénérée");

// preparerBascule : une ligne fait_le posé sans fait_par (D-048) avance vers le premier membre
// au tap, jamais vers « rien » (ce ne serait pas cohérent avec une case déjà cochée) ; le
// mouvement lié éventuel n'est PAS considéré comme une « première coche » (son montant ne se
// refige pas, il est déjà figé depuis la coche d'origine).
{
  const etat = {
    annee: 2026, mois: 9, prenom: "Yann", membres: [{ prenom: "Yann" }, { prenom: "Claudia" }],
    charges: [{ id: 1, libelle: "Électricité" }],
    recurrents: [{ id: 9, mode: "charge", charge_id: 1, actif: true }],
    mouvements: [{ id: 40, recurrent_id: 9, montant_centimes: -9999, fait_le: dejaCoche, fait_par: null }],
    lignes: { 1: { montant_centimes: -9000, regle: null, fait_le: dejaCoche, fait_par: null } },
  };
  const prep = preparerBascule(etat, 1);
  assert.equal(prep.message, "Validé pour Yann.");
  assert.deepEqual(prep.champsLigne, { fait_le: dejaCoche, fait_par: "Yann" });
  assert.equal(prep.mouvementLie.champs.montant_centimes, undefined,
    "pas de refigeage du montant : ce n'était pas une première coche (fait_le déjà posé)");
}

// Sans mouvement lié (pas de récurrent en mode charge pour cette charge) : rien à écrire côté mouvements.
const etatSansLien = { charges: [{ id: 1, libelle: "Alimentation" }], recurrents: [], mouvements: [] };
assert.equal(champsMouvementLie(etatSansLien, 1, { fait_le: "2026-09-29T10:00:00Z", fait_par: "Yann" }, true), null);

// Charge envoyée vers un compte (mode "charge") : PREMIÈRE coche => mouvement lié figé au
// montant théorique de calc.js::montantTheorique (règle 5 du brief). Décoche => null.
const etatAvecLien = {
  charges: [{ id: 1, libelle: "Crédit" }],
  recurrents: [{ id: 9, mode: "charge", charge_id: 1, actif: true }],
  mouvements: [{ id: 40, recurrent_id: 9, montant_centimes: -100000, fait_le: null, fait_par: null }],
  lignes: { 1: { montant_centimes: -125000 } },
};
const lieCoche = champsMouvementLie(etatAvecLien, 1, { fait_le: "2026-09-29T10:00:00Z", fait_par: "Yann" }, true);
assert.deepEqual(lieCoche, { id: 40, champs: { fait_le: "2026-09-29T10:00:00Z", fait_par: "Yann", montant_centimes: -125000 } },
  "le mouvement lié se fige au montant théorique de la charge, pas à son ancien montant");
// Changement de personne (pas la première coche) : montant PAS recalculé, gardé tel quel.
const lieChangePersonne = champsMouvementLie(etatAvecLien, 1, { fait_le: "2026-09-29T10:00:00Z", fait_par: "Claudia" }, false);
assert.deepEqual(lieChangePersonne, { id: 40, champs: { fait_le: "2026-09-29T10:00:00Z", fait_par: "Claudia" } },
  "changement de personne : pas de montant_centimes dans les champs, jamais recalculé");
const lieDecoche = champsMouvementLie(etatAvecLien, 1, { fait_le: null, fait_par: null }, false);
assert.deepEqual(lieDecoche, { id: 40, champs: { fait_le: null, fait_par: null } });

// Récurrent en mode charge mais SANS mouvement créé ce mois-ci : rien à écrire (pas d'erreur).
assert.equal(champsMouvementLie({ ...etatAvecLien, mouvements: [] }, 1, { fait_le: "x", fait_par: "Yann" }, true), null);

// preparerBascule refuse sans montant saisi (règle 3 du brief) — rien à muter, rien à écrire.
const etatSansMontant = { charges: [{ id: 1, libelle: "Assurance" }], lignes: {}, recurrents: [], mouvements: [], membres: [{ prenom: "Yann" }, { prenom: "Claudia" }], prenom: "Yann" };
const refus = preparerBascule(etatSansMontant, 1);
assert.equal(refus.ok, false);
assert.equal(refus.message, "Saisis d'abord le montant de Assurance.");

// Cycle complet préparer → appliquer (optimiste) → écrire, avec un mouvement lié : rien → Yann
// → Claudia → rien. Le montant du mouvement lié ne se fige qu'à la PREMIÈRE coche.
{
  const appels = [];
  const api = {
    majLigne: async (a, m, id, champs) => { appels.push(["majLigne", id, champs]); },
    majMouvement: async (id, champs) => { appels.push(["majMouvement", id, champs]); },
  };
  const etat = {
    annee: 2026, mois: 9, prenom: "Yann", membres: [{ prenom: "Yann" }, { prenom: "Claudia" }],
    charges: [{ id: 1, libelle: "Crédit" }],
    recurrents: [{ id: 9, mode: "charge", charge_id: 1, actif: true }],
    mouvements: [{ id: 40, recurrent_id: 9, montant_centimes: -100000, fait_le: null, fait_par: null }],
    lignes: { 1: { montant_centimes: -125000, regle: null } },
  };
  const prep = preparerBascule(etat, 1);
  assert.equal(prep.ok, true);
  assert.equal(prep.message, "Validé pour Yann.");
  appliquerBascule(etat, 1, prep);
  assert.ok(etat.lignes[1].fait_le, "mutation optimiste immédiate, avant l'écriture réseau");
  assert.equal(etat.lignes[1].fait_par, "Yann");
  assert.equal(etat.mouvements[0].fait_le, etat.lignes[1].fait_le, "mouvement lié basculé pareil");
  assert.equal(etat.mouvements[0].montant_centimes, -125000, "figé au montant théorique de la charge (première coche)");
  await ecrireBascule(api, etat, 1, prep);
  assert.deepEqual(appels, [
    ["majLigne", 1, prep.champsLigne],
    ["majMouvement", 40, prep.mouvementLie.champs],
  ]);

  // Changement de personne : Yann → Claudia. fait_le gardé, montant PAS recalculé même si le
  // calcul a bougé entre-temps (on force une valeur théorique différente pour le vérifier).
  const faitLeAvant = etat.lignes[1].fait_le;
  etat.lignes[1].montant_centimes = -999999; // le calcul aurait changé le montant théorique
  const prep2 = preparerBascule(etat, 1);
  assert.equal(prep2.message, "Validé pour Claudia.");
  appliquerBascule(etat, 1, prep2);
  assert.equal(etat.lignes[1].fait_le, faitLeAvant, "date gardée au changement de personne");
  assert.equal(etat.lignes[1].fait_par, "Claudia");
  assert.equal(etat.mouvements[0].montant_centimes, -125000, "montant du mouvement lié jamais recalculé au changement de personne");

  // Retour à rien : mouvement lié remis à fait_le/fait_par null.
  const prep3 = preparerBascule(etat, 1);
  assert.equal(prep3.message, "Validation annulée.");
  appliquerBascule(etat, 1, prep3);
  assert.equal(etat.lignes[1].fait_le, null);
  assert.equal(etat.mouvements[0].fait_le, null);
}

// Rollback : preparerBascule + appliquerBascule, puis annulerBascule restaure exactement l'avant.
{
  const etat = {
    annee: 2026, mois: 9, prenom: "Claudia", membres: [{ prenom: "Yann" }, { prenom: "Claudia" }],
    charges: [{ id: 1, libelle: "Électricité" }],
    recurrents: [],
    mouvements: [],
    lignes: { 1: { montant_centimes: -9000, regle: null } },
  };
  const avantLigne = { ...etat.lignes[1] };
  const prep = preparerBascule(etat, 1);
  const restaure = appliquerBascule(etat, 1, prep);
  assert.notEqual(etat.lignes[1].fait_le, null, "muté");
  annulerBascule(etat, 1, restaure, prep.mouvementLie);
  assert.deepEqual(etat.lignes[1], avantLigne, "rollback exact après échec réseau simulé");
}

// ---------- Regroupement des virements par trajet (D-048 §3, groupes-virements.js) ----------
{
  const etat = {
    membres: [{ prenom: "Yann" }, { prenom: "Claudia" }],
    comptes: [
      { id: 1, nom: "Commun", commun: true },
      { id: 2, nom: "Caisse d'Épargne" },
      { id: 3, nom: "Commun épargne", commun: true },
    ],
    charges: [
      { id: 1, libelle: "Crédit immo", categorie: "Logement", regle: "egales", actif: true, ponctuel: false },
      { id: 2, libelle: "Loyer", categorie: "Logement", regle: "egales", actif: true, ponctuel: false }, // reste sur le commun
    ],
    recurrents: [
      { id: 9, mode: "charge", charge_id: 1, actif: true, compte_de: 1, compte_vers: 2 },
    ],
    lignes: {
      1: { montant_centimes: -125000, fait_le: null, fait_par: null },
      2: { montant_centimes: -80000, fait_le: null, fait_par: null }, // pas de récurrent "charge" : reste sur le commun
    },
    mouvements: [
      // Virement personnel au commun de chacun (compte_de null + qui, comme trajet() de ui-mouvements.js).
      { id: 100, recurrent_id: null, titre: "Virement Yann", compte_de: null, qui: "Yann", compte_vers: 1, montant_centimes: -30000, fait_le: null, fait_par: null },
      { id: 101, recurrent_id: null, titre: "Virement Claudia", compte_de: null, qui: "Claudia", compte_vers: 3, montant_centimes: -20000, fait_le: null, fait_par: null },
      // Mouvement du récurrent en mode "charge" : ne doit PAS apparaître seul, déjà représenté par la ligne 1.
      { id: 102, recurrent_id: 9, titre: "Crédit immo → Caisse d'Épargne", compte_de: 1, compte_vers: 2, montant_centimes: -125000, fait_le: null, fait_par: null },
    ],
  };
  const groupes = construireGroupes(etat);

  // La charge qui reste sur le commun (id 2, pas de compteDeCharge) ne forme aucun groupe.
  assert.ok(!groupes.some((g) => g.lignes.some((l) => l.type === "ligne" && l.id === 2)),
    "une charge sans destination autre que le commun n'entre dans aucun groupe (rien à virer)");

  // Le mouvement du récurrent "charge" (id 102) ne compte pas en plus de la ligne de charge liée
  // (id 1) : un seul groupe Commun → Caisse d'Épargne, une seule ligne dedans (pas de doublon).
  const gCredit = groupes.find((g) => g.vers === 2);
  assert.ok(gCredit, "groupe Commun → Caisse d'Épargne trouvé");
  assert.equal(gCredit.lignes.length, 1, "le mouvement lié au récurrent charge ne double pas la ligne de charge");
  assert.equal(gCredit.lignes[0].type, "ligne");
  assert.equal(gCredit.total, -125000);

  // Deux virements personnels vers deux comptes communs différents : deux groupes distincts.
  const gYann = groupes.find((g) => g.vers === 1);
  const gClaudia = groupes.find((g) => g.vers === 3);
  assert.ok(gYann && gClaudia, "un groupe par trajet, même destination commune mais comptes différents");
  assert.equal(gYann.lignes[0].type, "mouvement");
  assert.equal(gYann.total, -30000);

  // Aucune ligne n'est encore validée : aucun groupe n'est "fait".
  assert.ok(groupes.every((g) => !g.fait));

  // ---------- cycle de la case groupe (rien → Yann → Claudia → rien) ----------
  const p1 = preparerBasculeGroupe(gCredit, etat.membres);
  assert.equal(p1.valeurCible, "Yann", "cycle du groupe : rien -> premier membre");
  assert.equal(p1.cibles.length, 1);
  assert.deepEqual(p1.cibles[0], { type: "ligne", id: 1 });

  // Après validation de la ligne 1 par Yann, le groupe est "fait" : un nouveau tap avance vers
  // Claudia (cycle du GROUPE, pas de la ligne individuelle) — toutes les lignes suivent.
  etat.lignes[1] = { ...etat.lignes[1], fait_le: "2026-09-29T10:00:00Z", fait_par: "Yann" };
  const groupes2 = construireGroupes(etat);
  const gCredit2 = groupes2.find((g) => g.vers === 2);
  assert.equal(gCredit2.fait, true, "toutes les lignes du groupe sont validées : le groupe est fait");
  assert.equal(gCredit2.prenom, "Yann");
  const p2 = preparerBasculeGroupe(gCredit2, etat.membres);
  assert.equal(p2.valeurCible, "Claudia", "groupe déjà fait par Yann : le cycle avance vers Claudia");
  assert.equal(p2.cibles.length, 1, "groupe fait : TOUTES ses lignes sont ciblées, pas seulement les non-faites");

  // Groupe à deux lignes, une seule validée : un nouveau tap ne cible QUE la ligne non faite —
  // il ne vole pas la validation déjà posée par quelqu'un sur l'autre ligne.
  const etatMixte = {
    ...etat,
    mouvements: [
      { id: 200, recurrent_id: null, titre: "Virement A", compte_de: null, qui: "Yann", compte_vers: 5, montant_centimes: -10000, fait_le: "2026-09-29T10:00:00Z", fait_par: "Claudia" },
      { id: 201, recurrent_id: null, titre: "Virement B", compte_de: null, qui: "Yann", compte_vers: 5, montant_centimes: -20000, fait_le: null, fait_par: null },
    ],
    comptes: [...etat.comptes, { id: 5, nom: "Livret" }],
  };
  const groupesMixte = construireGroupes(etatMixte);
  const gMixte = groupesMixte.find((g) => g.vers === 5);
  assert.equal(gMixte.fait, false, "une ligne non faite suffit à garder le groupe non fait");
  assert.equal(lignesAFaire(gMixte).length, 1);
  assert.equal(lignesFaites(gMixte).length, 1);
  const pMixte = preparerBasculeGroupe(gMixte, etat.membres);
  assert.equal(pMixte.cibles.length, 1, "seule la ligne NON faite est ciblée, jamais celle déjà validée par Claudia");
  assert.deepEqual(pMixte.cibles[0], { type: "mouvement", id: 201 });

  // « Même personne, même date » (règle 3 du brief) : une date explicite (dateCible), pas un
  // `new Date()` par ligne qui divergerait de quelques millisecondes entre deux lignes ciblées.
  const dateGroupe = "2026-09-30T08:00:00.000Z";
  const etatDeuxLignes = {
    membres: [{ prenom: "Yann" }, { prenom: "Claudia" }],
    comptes: [{ id: 1, nom: "Commun", commun: true }, { id: 6, nom: "Livret 2" }],
    charges: [
      { id: 10, libelle: "Charge A", categorie: "Autre", regle: "egales", actif: true, ponctuel: false },
      { id: 11, libelle: "Charge B", categorie: "Autre", regle: "egales", actif: true, ponctuel: false },
    ],
    recurrents: [
      { id: 90, mode: "charge", charge_id: 10, actif: true, compte_de: 1, compte_vers: 6 },
      { id: 91, mode: "charge", charge_id: 11, actif: true, compte_de: 1, compte_vers: 6 },
    ],
    lignes: {
      10: { montant_centimes: -5000, fait_le: null, fait_par: null },
      11: { montant_centimes: -7000, fait_le: null, fait_par: null },
    },
    mouvements: [],
  };
  const groupesDeuxLignes = construireGroupes(etatDeuxLignes);
  const gDeux = groupesDeuxLignes.find((g) => g.vers === 6);
  assert.equal(gDeux.lignes.length, 2);
  const prepA = preparerBascule(etatDeuxLignes, 10, "Yann", dateGroupe);
  const prepB = preparerBascule(etatDeuxLignes, 11, "Yann", dateGroupe);
  assert.equal(prepA.champsLigne.fait_le, dateGroupe, "date imposée, pas régénérée");
  assert.equal(prepB.champsLigne.fait_le, dateGroupe, "même date exacte sur la seconde ligne du groupe");
  assert.equal(prepA.champsLigne.fait_le, prepB.champsLigne.fait_le, "les deux lignes du groupe partagent EXACTEMENT la même date");
}

// ---------- D-048 : groupe fait mais SANS prénom commun (coches d'avant D-048, ou mélange) ----------
{
  const etatGroupeSansPrenom = {
    membres: [{ prenom: "Yann" }, { prenom: "Claudia" }],
    comptes: [{ id: 1, nom: "Commun", commun: true }, { id: 7, nom: "Livret 3" }],
    charges: [
      { id: 20, libelle: "Charge X", categorie: "Autre", regle: "egales", actif: true, ponctuel: false },
      { id: 21, libelle: "Charge Y", categorie: "Autre", regle: "egales", actif: true, ponctuel: false },
    ],
    recurrents: [
      { id: 92, mode: "charge", charge_id: 20, actif: true, compte_de: 1, compte_vers: 7 },
      { id: 93, mode: "charge", charge_id: 21, actif: true, compte_de: 1, compte_vers: 7 },
    ],
    // Les deux lignes sont cochées (fait_le posé), mais AUCUNE n'a de prénom (coches d'avant
    // D-048, ou posées par le bot) : le groupe est fait, sans prénom commun.
    lignes: {
      20: { montant_centimes: -3000, fait_le: "2026-09-20T00:00:00Z", fait_par: null },
      21: { montant_centimes: -4000, fait_le: "2026-09-21T00:00:00Z", fait_par: null },
    },
    mouvements: [],
  };
  const groupes = construireGroupes(etatGroupeSansPrenom);
  const g = groupes.find((x) => x.vers === 7);
  assert.equal(g.fait, true, "toutes les lignes sont cochées : le groupe est fait");
  assert.equal(g.prenom, SANS_PRENOM, "aucun prénom commun (aucune ligne n'en a) : SANS_PRENOM, jamais null ni un prénom au hasard");

  // Un tap depuis cet état avance vers le PREMIER membre (comme depuis null), jamais vers
  // « rien » — la case affiche déjà « ✓ », un tap ne peut pas la vider directement.
  const prep = preparerBasculeGroupe(g, etatGroupeSansPrenom.membres);
  assert.equal(prep.valeurCible, "Yann", "groupe fait sans prénom commun : le cycle avance vers le premier membre");
  assert.equal(prep.cibles.length, 2, "groupe fait : toutes ses lignes sont ciblées");

  // Mélange : une ligne avec prénom, une autre sans — pas de prénom COMMUN non plus.
  const etatMelange = {
    ...etatGroupeSansPrenom,
    lignes: {
      20: { montant_centimes: -3000, fait_le: "2026-09-20T00:00:00Z", fait_par: "Yann" },
      21: { montant_centimes: -4000, fait_le: "2026-09-21T00:00:00Z", fait_par: null },
    },
  };
  const groupesMelange = construireGroupes(etatMelange);
  const gMelange = groupesMelange.find((x) => x.vers === 7);
  assert.equal(gMelange.fait, true);
  assert.equal(gMelange.prenom, SANS_PRENOM, "prénoms différents entre les lignes (Yann vs sans) : pas de prénom commun");
}

// ---------- Regroupement par destinataire (par-destinataire.js, Yann : « de CB j'ai besoin de X ») ----------
{
  const comptes = [
    { id: 1, nom: "Commun", commun: true },
    { id: 2, nom: "Caisse d'Épargne" },
    { id: 3, nom: "École Max" },
  ];
  const charges = [
    { id: 1, libelle: "Crédit immo", categorie: "Logement", regle: "egales", actif: true, ponctuel: false }, // envoyé vers 2
    { id: 2, libelle: "Loyer", categorie: "Logement", regle: "egales", actif: true, ponctuel: false }, // reste sur commun
    { id: 3, libelle: "École", categorie: "Max", regle: "egales", actif: true, ponctuel: false }, // envoyé vers 3
    { id: 4, libelle: "Resto", categorie: "Autre", regle: "egales", actif: true, ponctuel: true }, // ponctuelle, aucune destination
  ];
  const recurrents = [
    { id: 9, mode: "charge", charge_id: 1, actif: true, compte_de: 1, compte_vers: 2 },
    { id: 10, mode: "charge", charge_id: 3, actif: true, compte_de: 1, compte_vers: 3 },
  ];
  const montantDe = (id) => ({ 1: -125000, 2: -80000, 3: -91000, 4: -8640 })[id] ?? 0;

  const groupes = construireGroupesDestinataires(charges, recurrents, comptes);
  assert.equal(groupes.length, 3, "trois groupes : deux trajets, un seul groupe commun (loyer + resto ensemble)");
  const gCommun = groupes.find((g) => g.cle === CLE_COMMUN);
  assert.ok(gCommun, "groupe « reste sur le commun » trouvé par sa clé stable");
  assert.ok(gCommun.charges.some((c) => c.id === 2), "charge sans destination (Loyer) : reste sur le commun");
  assert.ok(gCommun.charges.some((c) => c.id === 4), "charge ponctuelle sans destination (Resto) : reste sur le commun aussi");
  assert.equal(groupes.find((g) => g.compteId === 2).charges[0].id, 1, "Crédit immo groupé sous son compte de destination (Caisse d'Épargne)");
  assert.equal(groupes.find((g) => g.compteId === 3).charges[0].id, 3, "École groupée sous son compte de destination (École Max)");

  // ---------- tri : trajets par total décroissant, le commun toujours en dernier ----------
  const totalParGroupe = new Map(groupes.map((g) => [g.cle, totalGroupe(g, montantDe)]));
  assert.equal(totalParGroupe.get(gCommun.cle), -88640, "total du groupe commun = loyer + resto");
  const tries = trierGroupesDestinataires(groupes, totalParGroupe);
  assert.equal(tries.at(-1).cle, CLE_COMMUN, "la carte « reste sur le commun » est toujours en dernier");
  assert.equal(tries[0].compteId, 2, "Crédit immo (1250 €) avant École (910 €) : total décroissant");
  assert.equal(tries[1].compteId, 3);

  // ---------- comptage de validation (« x/y validées ») ----------
  const faitDe = (id) => ({ 1: "2026-09-29T09:00:00" }[id] ?? null);
  const gCredit = groupes.find((g) => g.compteId === 2);
  const compte1 = comptageValidation(gCredit, faitDe);
  assert.deepEqual(compte1, { faites: 1, total: 1, complet: true });
  const compteCommunLigne = comptageValidation(gCommun, faitDe);
  assert.deepEqual(compteCommunLigne, { faites: 0, total: 2, complet: false });

  // ---------- pied « Total qui part de <compte> » seulement si plusieurs cartes partagent la source ----------
  // Ici les deux trajets partent tous les deux du Commun (compte_de:1) : un seul pied, Commun.
  const pieds = totauxParSource(tries, totalParGroupe, comptes);
  assert.equal(pieds.length, 1, "une seule source partagée (Commun) entre les deux trajets");
  assert.equal(pieds[0].libelle, "Commun");
  assert.equal(pieds[0].total, -216000, "Crédit immo + École, les deux partant du Commun");

  // Une seule carte depuis une source : pas de pied (rien à cumuler).
  const unSeulTrajet = construireGroupesDestinataires(
    [charges[0], charges[1]], [recurrents[0]], comptes);
  const totalUnSeul = new Map(unSeulTrajet.map((g) => [g.cle, totalGroupe(g, montantDe)]));
  const piedsUnSeul = totauxParSource(unSeulTrajet, totalUnSeul, comptes);
  assert.equal(piedsUnSeul.length, 0, "une seule carte depuis le Commun : pas de pied, rien à cumuler");
}

console.log("test_calc OK");
