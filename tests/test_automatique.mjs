// Virement automatique (D-057) : un récurrent automatique est « fait » pour l'affichage et le
// regroupement, sans coche en base, sans compter dans ce qui reste à valider. Données inventées.
import assert from "node:assert/strict";
import { construireGroupes, preparerBasculeGroupe, lignesAFaire } from "../frontend/budget/groupes-virements.js";
import { construireGroupesCategories, elementsAFaire, elementsFaits } from "../frontend/budget/groupes-categories.js";
import { etatDuMois } from "../frontend/budget/etat-mois.js";
import { AUTOMATIQUE, estAutomatique } from "../frontend/budget/automatique.js";

const base = () => ({
  membres: [{ prenom: "Yann" }, { prenom: "Claudia" }],
  comptes: [{ id: 1, nom: "Commun", commun: true }, { id: 2, nom: "Livret A" }, { id: 3, nom: "Livret B" }],
  charges: [{ id: 1, libelle: "Charge test", categorie: "Autre", regle: "egales", actif: true, ponctuel: false }],
  recurrents: [
    { id: 10, mode: "fixe", montant_centimes: -10000, actif: true, automatique: true, compte_de: 1, compte_vers: 2 },
    { id: 11, mode: "fixe", montant_centimes: -7000, actif: true, automatique: false, compte_de: 1, compte_vers: 3 },
    { id: 12, mode: "charge", charge_id: 1, actif: true, automatique: true, compte_de: 1, compte_vers: 3 },
  ],
  lignes: { 1: { montant_centimes: -5000, fait_le: null, fait_par: null } },
  mouvements: [
    { id: 20, recurrent_id: 10, titre: "Auto", compte_de: 1, compte_vers: 2, montant_centimes: -10000, fait_le: null, fait_par: null },
    { id: 21, recurrent_id: 11, titre: "Manuel", compte_de: 1, compte_vers: 3, montant_centimes: -7000, fait_le: null, fait_par: null },
  ],
});

// Destinataires : groupe entièrement automatique = fait, sans prénom, aucune cible de bascule.
const g1 = construireGroupes(base());
const auto = g1.find((g) => g.vers === 2);
assert.equal(auto.fait, true);
assert.equal(auto.automatique, true);
assert.equal(auto.prenom, null);
assert.equal(auto.lignes[0].valeur, AUTOMATIQUE);
assert.equal(auto.total, -10000, "reste compté");
assert.deepEqual(preparerBasculeGroupe(auto, base().membres).cibles, [], "rien à basculer sur un automatique");

// Groupe mixte (ligne de charge automatique + mouvement manuel vers le même compte) : reste à faire,
// seul l'élément manuel est ciblé, le total à faire l'exclut.
const mixte = g1.find((g) => g.vers === 3);
assert.equal(mixte.fait, false);
assert.equal(mixte.automatique, false);
assert.equal(mixte.total, -12000);
assert.equal(mixte.totalManuel, -7000, "l'automatique n'est pas dans le total à faire");
assert.deepEqual(lignesAFaire(mixte).map((l) => l.id), [21]);
assert.deepEqual(preparerBasculeGroupe(mixte, base().membres).cibles, [{ type: "mouvement", id: 21 }]);

// Une fois l'élément manuel validé, le groupe mixte passe fait avec le prénom du seul manuel.
const e2 = base();
e2.mouvements[1] = { ...e2.mouvements[1], fait_le: "2026-01-05T10:00:00Z", fait_par: "Yann" };
const mixteFait = construireGroupes(e2).find((g) => g.vers === 3);
assert.equal(mixteFait.fait, true);
assert.equal(mixteFait.prenom, "Yann");
assert.equal(preparerBasculeGroupe(mixteFait, e2.membres).cibles.length, 1, "le tap avance le manuel, pas l'automatique");

// Catégories : l'élément automatique est dans les faits, jamais dans les à faire.
const e3 = base();
const cats = construireGroupesCategories(e3.charges, e3.lignes, e3.mouvements, e3.recurrents);
const virements = cats.find((g) => g.cle === "__virements__");
assert.deepEqual(elementsFaits(virements).map((e) => e.id), [20]);
assert.deepEqual(elementsAFaire(virements).map((e) => e.id), [21]);
const autre = cats.find((g) => g.cle === "Autre");
assert.equal(elementsAFaire(autre).length, 0, "ligne de charge automatique : rien à faire");
assert.ok(estAutomatique(autre.elements[0].valeur));

// Compteur « à valider » : sans l'automatique (mouvement ni ligne de charge).
const etat = base();
const sansAuto = etatDuMois({ mois: 1, ...etat, revenus: { Yann: 1, Claudia: 1 } });
assert.equal(sansAuto.aFaire, 1, "seul le mouvement manuel reste à valider");
const toutAuto = base();
toutAuto.recurrents[1].automatique = true;
const fait = etatDuMois({ mois: 1, ...toutAuto, revenus: { Yann: 1, Claudia: 1 } });
assert.equal(fait.aFaire, 0);
assert.equal(fait.statut, "fait");

// Aucune écriture simulée : l'état source n'est pas modifié par le classement.
assert.equal(etat.mouvements[0].fait_le, null);
console.log("test_automatique : ok");
