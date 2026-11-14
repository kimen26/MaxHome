// Test Deno hors ligne de la partie pure du choix des destinataires (D-060). Ids et prénoms FICTIFS.
// Lancer : deno test --allow-all --no-lock supabase/functions/_shared/test_telegram_foyer.ts

import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { choisirDestinataires, groupeDepuisParametre } from "./telegram_foyer.ts";

const MEMBRES = [{ telegram_id: 1, prenom: "Alice" }, { telegram_id: 2, prenom: "Bob" }];

Deno.test("sans groupe : chaque membre, pas de groupe", () => {
  assertEquals(choisirDestinataires(null, MEMBRES), { groupe: null, membres: MEMBRES });
});

Deno.test("groupe présent (chaîne ou nombre, id négatif) : groupe retenu, membres gardés pour le repli", () => {
  const attendu = { groupe: { telegram_id: -100123, prenom: "groupe" }, membres: MEMBRES };
  assertEquals(choisirDestinataires("-100123", MEMBRES), attendu);
  assertEquals(choisirDestinataires(-100123, MEMBRES), attendu);
});

Deno.test("identifiant de groupe invalide : erreur explicite", () => {
  for (const mauvais of ["abc", "0", 0, "1.5", ""]) {
    assertThrows(() => groupeDepuisParametre(mauvais), Error, "n'est pas un identifiant de groupe");
  }
});
