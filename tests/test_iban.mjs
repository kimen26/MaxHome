// Validation IBAN — IBAN d'exemple PUBLICS de la norme (jamais un vrai compte du foyer).
import assert from "node:assert/strict";
import { nettoyerIban, erreurIban, formaterIban, derniersCaracteres } from "../frontend/budget/iban.js";

// Exemples publics : FR (fr.wikipedia.org/wiki/IBAN) et GB (norme ISO 13616 / exemple officiel).
const IBAN_FR = "FR1420041010050500013M02606";
const IBAN_GB = "GB82WEST12345698765432";

// nettoyerIban
assert.equal(nettoyerIban(" fr14 2004 1010 0505 0001 3m02 606 "), IBAN_FR);
assert.equal(nettoyerIban(""), "");
assert.equal(nettoyerIban(null), "");

// erreurIban — cas valides
assert.equal(erreurIban(IBAN_FR), null, "IBAN FR public valide");
assert.equal(erreurIban(IBAN_GB), null, "IBAN GB public valide");
assert.equal(erreurIban("  " + IBAN_FR.toLowerCase() + "  "), null, "espaces et minuscules tolérés");
assert.equal(erreurIban(""), null, "champ vide autorisé");
assert.equal(erreurIban(null), null, "champ null autorisé");
assert.equal(erreurIban(undefined), null, "champ undefined autorisé");

// erreurIban — forme invalide
assert.match(erreurIban("PAS UN IBAN"), /invalide/);
assert.match(erreurIban("FR14"), /invalide/);
assert.match(erreurIban("1234567890123456789012345678"), /invalide/);

// erreurIban — clé de contrôle fausse (dernier chiffre altéré)
const IBAN_FR_FAUX = IBAN_FR.slice(0, -1) + (IBAN_FR.slice(-1) === "6" ? "7" : "6");
assert.match(erreurIban(IBAN_FR_FAUX), /clé de contrôle/);

// formaterIban
assert.equal(formaterIban(IBAN_FR), "FR14 2004 1010 0505 0001 3M02 606");
assert.equal(formaterIban(""), "");

// derniersCaracteres
assert.equal(derniersCaracteres(IBAN_FR), "2606");
assert.equal(derniersCaracteres(IBAN_GB), "5432");
assert.equal(derniersCaracteres(""), null);
assert.equal(derniersCaracteres(null), null);

console.log("test_iban.mjs : OK");
