// Libellé à mettre sur le virement bancaire (D-050) — règle pure, portée par le COMPTE
// destinataire. Exemples factices (jamais de vrai libellé de Yann, invariant 1) : un compte
// « Syndic » à libellé FIXE (code client), un compte « École » à libellé VARIABLE (numéro de
// facture du mois).
import assert from "node:assert/strict";
import { libelleEffectif, libelleACompleter, modeleLibelle } from "../frontend/budget/libelle-virement.js";

const COMPTE_FIXE = { id: 1, nom: "Syndic", libelle_virement: "CL-0001", libelle_variable: false };
const COMPTE_VARIABLE = { id: 2, nom: "École", libelle_virement: "Enfant Dupont Facture n°", libelle_variable: true };
const COMPTE_SANS_LIBELLE = { id: 3, nom: "Livret", libelle_virement: null, libelle_variable: false };

// ---------- libelleEffectif ----------

// Compte fixe, pas de surcharge du mois : le modèle du compte sert tel quel.
assert.equal(libelleEffectif({ libelle_virement: null }, COMPTE_FIXE), "CL-0001");

// Compte fixe, surcharge du mois présente (cas rare mais permis) : la surcharge gagne.
assert.equal(libelleEffectif({ libelle_virement: "CL-0001-BIS" }, COMPTE_FIXE), "CL-0001-BIS");

// Compte variable, mois pas encore saisi : aucune valeur effective (à compléter).
assert.equal(libelleEffectif({ libelle_virement: null }, COMPTE_VARIABLE), null);

// Compte variable, valeur du mois saisie : elle prime, le modèle n'est qu'un repère.
assert.equal(libelleEffectif({ libelle_virement: "Enfant Dupont Facture n°12" }, COMPTE_VARIABLE),
  "Enfant Dupont Facture n°12");

// Mouvement absent (compte connu seul, cas du détail avant ouverture) : lit le compte.
assert.equal(libelleEffectif(null, COMPTE_FIXE), "CL-0001");
assert.equal(libelleEffectif(undefined, COMPTE_VARIABLE), null);

// Compte sans aucun libellé réglé : rien à afficher, jamais une chaîne vide.
assert.equal(libelleEffectif({ libelle_virement: null }, COMPTE_SANS_LIBELLE), null);

// Pas de compte connu (reste sur le commun) : rien à afficher.
assert.equal(libelleEffectif({ libelle_virement: null }, null), null);

// ---------- libelleACompleter ----------

assert.equal(libelleACompleter({ libelle_virement: null }, COMPTE_VARIABLE), true);
assert.equal(libelleACompleter({ libelle_virement: "Enfant Dupont Facture n°12" }, COMPTE_VARIABLE), false);
assert.equal(libelleACompleter({ libelle_virement: null }, COMPTE_FIXE), false, "fixe : jamais à compléter");
assert.equal(libelleACompleter({ libelle_virement: null }, null), false, "pas de compte : rien à compléter");
assert.equal(libelleACompleter(null, COMPTE_VARIABLE), true, "mouvement pas encore créé, compte variable");

// ---------- modeleLibelle ----------

assert.equal(modeleLibelle(COMPTE_VARIABLE), "Enfant Dupont Facture n°");
assert.equal(modeleLibelle(COMPTE_FIXE), null, "le modèle ne sert qu'au placeholder d'un compte variable");
assert.equal(modeleLibelle(COMPTE_SANS_LIBELLE), null);
assert.equal(modeleLibelle(null), null);

console.log("test_libelles.mjs : OK");

// ---------- virementDeCharge : feuille d'une charge (compte final, mouvement du mois) ----------
import { virementDeCharge, recurrentReserveDe, mouvementPaiementDe } from "../frontend/budget/virement-charge.js";

const COMPTES = [
  { id: 1, nom: "Commun", libelle_virement: null, libelle_variable: false },
  { id: 5, nom: "Tampon", libelle_virement: null, libelle_variable: false },
  COMPTE_FIXE, COMPTE_VARIABLE, COMPTE_SANS_LIBELLE,
];
const charge = (id) => ({ id });
const rec = (id, chargeId, vers, extra = {}) => ({ id, actif: true, mode: "charge", charge_id: chargeId, compte_vers: vers, ...extra });
// Réserve : tampon 5 -> final (relais_vers), payé tous les 3 mois, départ en mois 3 (3, 6, 9, 12).
const reserve = (id, chargeId, final) => rec(id, chargeId, 5, { relais_vers: final, relais_tous_les: 3, relais_depart: 3 });
const etat = (recurrents, mouvements, mois) => ({ recurrents, comptes: COMPTES, mouvements, mois });

// Sans réserve : le compte qui reçoit porte le libellé, mouvement = celui du mois (étape 1 ou null).
{
  const e = etat([rec(10, 1, 1)], [], 5);
  assert.equal(virementDeCharge(charge(1), e), null, "compte commun sans libellé : rien");
}
{
  const m = { id: 90, recurrent_id: 10, etape: null, libelle_virement: null };
  const e = etat([rec(10, 1, 1)], [m], 5);
  e.comptes = [...COMPTES.filter((c) => c.id !== 1), { ...COMPTE_FIXE, id: 1 }];
  const v = virementDeCharge(charge(1), e);
  assert.equal(v.compte.nom, "Syndic");
  assert.equal(v.mouvement, m);
  assert.equal(v.tampon, null);
  assert.equal(v.moisPaiement, null);
}
// Pas de récurrent actif en mode charge (ou éteint) : null.
assert.equal(virementDeCharge(charge(9), etat([], [], 5)), null);
assert.equal(virementDeCharge(charge(1), etat([{ ...rec(10, 1, 1), actif: false }], [], 5)), null);
assert.equal(virementDeCharge(charge(1), etat([{ ...rec(10, 1, 1), mode: "fixe" }], [], 5)), null);

// Réserve vers un compte FINAL à libellé fixe, HORS mois de paiement (mois 5) : le compte qui
// compte est le final (pas le tampon), prochain paiement en juin, pas de mouvement d'étape 2.
{
  const e = etat([reserve(20, 3, 2)], [{ id: 91, recurrent_id: 20, etape: 1 }], 5);
  const v = virementDeCharge(charge(3), e);
  assert.equal(v.compte.id, 2, "libellé du compte FINAL, pas du tampon");
  assert.equal(v.tampon.nom, "Tampon");
  assert.equal(v.aPayerCeMois, false);
  assert.equal(v.moisPaiement, 6);
  assert.equal(v.mouvement, null, "l'étape 1 n'est pas le mouvement du paiement");
}
// Même réserve, MOIS de paiement (6) avec mouvement d'étape 2 : c'est lui qui est rendu.
{
  const m1 = { id: 91, recurrent_id: 20, etape: 1 };
  const m2 = { id: 92, recurrent_id: 20, etape: 2, libelle_virement: "Enfant Dupont Facture n°12" };
  const e = etat([reserve(20, 3, 2)], [m1, m2], 6);
  const v = virementDeCharge(charge(3), e);
  assert.equal(v.aPayerCeMois, true);
  assert.equal(v.moisPaiement, 6);
  assert.equal(v.mouvement, m2);
  assert.equal(libelleEffectif(v.mouvement, v.compte), "Enfant Dupont Facture n°12");
}
// Compte final à libellé VARIABLE, mois de paiement sans mouvement : pas de valeur, modèle à lire.
{
  const e = etat([reserve(20, 3, 2)], [], 6);
  const v = virementDeCharge(charge(3), e);
  assert.equal(v.mouvement, null);
  assert.equal(libelleEffectif(v.mouvement, v.compte), null);
  assert.equal(modeleLibelle(v.compte), "Enfant Dupont Facture n°");
}
// Compte final sans libellé (ni variable) : rien à afficher, même avec une réserve.
assert.equal(virementDeCharge(charge(3), etat([reserve(20, 3, 3)], [], 6)), null);
// Réserve sans mois de départ choisi : pas de mois de paiement connu, pas d'erreur.
{
  const r = { ...reserve(20, 3, 2), relais_depart: null };
  const v = virementDeCharge(charge(3), etat([r], [], 6));
  assert.equal(v.moisPaiement, null);
  assert.equal(v.aPayerCeMois, false);
}
// Helpers partagés avec la liste du mois.
assert.equal(recurrentReserveDe([rec(10, 1, 1)], 1), null, "sans relais_vers : pas une réserve");
assert.equal(recurrentReserveDe([reserve(20, 3, 2)], 3).id, 20);
assert.equal(mouvementPaiementDe([{ recurrent_id: 20, etape: 1 }], { id: 20 }), null);

console.log("test_libelles : OK (virementDeCharge)");