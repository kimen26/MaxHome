// Pont Python -> moteur JS. Lit un JSON sur stdin, écrit le résultat JSON sur stdout.
// Un seul moteur de calcul (frontend/budget/calc.js) : le bot ne réimplémente jamais les règles.
// Entrée attendue : { charges, lignes, revenus, ajustements }
import { calculer } from "../../frontend/budget/calc.js";

async function lireStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

async function main() {
  const brut = await lireStdin();
  let entree;
  try {
    entree = JSON.parse(brut);
  } catch (e) {
    process.stderr.write(`JSON invalide : ${e.message}\n`);
    process.exit(1);
  }
  const { charges = [], lignes = {}, revenus = {}, ajustements = [] } = entree;
  try {
    const resultat = calculer(charges, lignes, revenus, ajustements);
    process.stdout.write(JSON.stringify(resultat));
  } catch (e) {
    process.stderr.write(`calcul échoué : ${e.message}\n`);
    process.exit(1);
  }
}

main();
