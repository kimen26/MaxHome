// Réserve relais (D-054) : mois de paiement, montant cumulé (passage d'année, mois sans ligne),
// montant du cycle estimé. Valeurs toutes inventées (L-049) — jamais de vraie donnée.
import assert from "node:assert/strict";
import { aReserve, estMoisPaiement, montantCumule, montantCycleEstime, prochainMoisPaiement }
  from "../frontend/budget/reserve.js";

// ---------- aReserve ----------
assert.equal(aReserve({ relais_vers: null }), false);
assert.equal(aReserve({ relais_vers: 9 }), true);
assert.equal(aReserve(undefined), false);

// ---------- estMoisPaiement ----------
const trimestriel = { relais_vers: 9, relais_tous_les: 3, relais_depart: 2 };
assert.equal(estMoisPaiement(trimestriel, 2), true, "mois de départ = paiement");
assert.equal(estMoisPaiement(trimestriel, 5), true, "3 mois plus tard");
assert.equal(estMoisPaiement(trimestriel, 8), true, "encore 3 mois plus tard");
assert.equal(estMoisPaiement(trimestriel, 3), false);
assert.equal(estMoisPaiement(trimestriel, 1), false, "mois avant le départ, hors cycle (11 mod 3 != 0)");
assert.equal(estMoisPaiement(trimestriel, 11), true, "11 - 2 = 9, multiple de 3");

const mensuel = { relais_vers: 9, relais_tous_les: 1, relais_depart: 1 };
for (let m = 1; m <= 12; m++) assert.equal(estMoisPaiement(mensuel, m), true, `mensuel, mois ${m}`);

const sansDepart = { relais_vers: 9, relais_tous_les: 3, relais_depart: null };
assert.equal(estMoisPaiement(sansDepart, 3), false, "sans relais_depart, jamais de mois de paiement");

assert.equal(estMoisPaiement({ relais_vers: null, relais_tous_les: 3, relais_depart: 2 }, 2), false,
  "sans relais_vers, pas de réserve du tout");

// ---------- montantCumule ----------
const r3 = { relais_tous_les: 3 };
const lignesFactices = { // {annee: {mois: centimes}} — valeurs inventées, jamais réelles (L-049).
  2026: { 1: -1000, 2: -1200, 3: -1100, 10: -900, 11: -950, 12: -1000 },
  2027: { 1: -1050 },
};
const ligneDuMois = (a, m) => lignesFactices[a]?.[m];

assert.equal(
  montantCumule(r3, { annee: 2026, mois: 3 }, ligneDuMois),
  1000 + 1200 + 1100,
  "cumul sur 3 mois, montant cycle inclus",
);

// Passage d'année : décembre 2026 + janvier 2027 (mois 1 du cycle suivant, hors fenêtre).
assert.equal(
  montantCumule(r3, { annee: 2026, mois: 12 }, ligneDuMois),
  900 + 950 + 1000,
  "cumul oct/nov/dec 2026, pas de passage d'année dans la fenêtre",
);
assert.equal(
  montantCumule(r3, { annee: 2027, mois: 1 }, ligneDuMois),
  1050 + 1000 + 950,
  "passage d'année : janvier 2027 cumule avec décembre et novembre 2026",
);

// Mois sans ligne saisie = 0, jamais une erreur ni une valeur devinée.
const r2 = { relais_tous_les: 2 };
assert.equal(montantCumule(r2, { annee: 2026, mois: 1 }, () => undefined), 0, "aucune ligne -> 0");
assert.equal(montantCumule(r2, { annee: 2026, mois: 2 }, (a, m) => (m === 2 ? -500 : undefined)), 500,
  "un seul des deux mois a une ligne, l'autre compte pour 0");

// Le cumul repart après le dernier paiement (payé en septembre, décembre…).
const rSept = { relais_vers: 1, relais_tous_les: 3, relais_depart: 9 };
assert.equal(montantCumule(rSept, { annee: 2026, mois: 10 }, ligneDuMois), 900,
  "octobre, mois qui suit le paiement de septembre : seulement octobre");
assert.equal(montantCumule(rSept, { annee: 2026, mois: 11 }, ligneDuMois), 900 + 950,
  "novembre : octobre + novembre");
assert.equal(montantCumule(rSept, { annee: 2026, mois: 12 }, ligneDuMois), 900 + 950 + 1000,
  "décembre, mois de paiement : le cycle complet");

// ---------- montantCycleEstime ----------
assert.equal(montantCycleEstime({ relais_tous_les: 3 }, -1500), 4500);
assert.equal(montantCycleEstime({ relais_tous_les: 3 }, null), 0, "pas de montant du mois -> estimation 0");

// ---------- prochainMoisPaiement ----------
assert.equal(prochainMoisPaiement(trimestriel, 2), 5, "mois de paiement courant -> le prochain, pas lui-même");
assert.equal(prochainMoisPaiement(trimestriel, 3), 5);
assert.equal(prochainMoisPaiement(trimestriel, 11), 2, "boucle sur l'année suivante");
assert.equal(prochainMoisPaiement(sansDepart, 3), null, "sans relais_depart, aucun prochain mois");

console.log("test_reserve.mjs : OK");
