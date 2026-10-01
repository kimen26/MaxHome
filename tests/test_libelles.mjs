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
