// Test Deno hors ligne (aucun réseau, aucun secret) de la logique pure du vote.
// Lancer : deno test --allow-all --no-lock supabase/functions/sondage-voter/test_vote.ts
// Les prénoms et sondages ci-dessous sont FICTIFS (invariant 1 : aucune donnée réelle dans le dépôt).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  clePrenom, ERR_JOURS_INVALIDES, ERR_JOURS_VIDES, ERR_PRENOM_LONG, ERR_PRENOM_VIDE, estJeton, jourLisible,
  messageTelegram, nettoyerPrenom, validerVote, type JourSondage,
} from "./vote.ts";

const SONDAGE: JourSondage[] = [
  { jour: "2026-11-21", libre: true },
  { jour: "2026-11-22", libre: true, ferie: null, vacances: "Toussaint" },
  { jour: "2026-11-23", libre: false },
  { jour: "2026-11-24", libre: true, ferie: "Jour test" },
];

Deno.test("estJeton : uuid seulement", () => {
  assertEquals(estJeton("123e4567-e89b-12d3-a456-426614174000"), true);
  assertEquals([estJeton("abc"), estJeton(42), estJeton(null), estJeton("")], [false, false, false, false]);
});

Deno.test("nettoyerPrenom : espaces repliés, contrôles retirés, non-texte vide", () => {
  assertEquals(nettoyerPrenom("  Paul \t  Émile\n"), "Paul Émile");
  assertEquals(nettoyerPrenom("Pa\u0000u​l"), "Paul");
  assertEquals([nettoyerPrenom(null), nettoyerPrenom(12), nettoyerPrenom("   ")], ["", "", ""]);
});

Deno.test("clePrenom : sans casse ni accents", () => {
  assertEquals(clePrenom("Zoé"), clePrenom("ZOE"));
  assertEquals(clePrenom("  Jean-Éric  Test "), "jean-eric test");
});

Deno.test("jourLisible : format court français", () => {
  assertEquals(jourLisible("2026-11-21"), "sam. 21 nov.");
  assertEquals(jourLisible("2026-11-22"), "dim. 22 nov.");
  assertEquals(jourLisible("2027-01-01"), "ven. 1 janv.");
});

Deno.test("validerVote : cas nominal, jours triés et dédoublonnés", () => {
  const v = validerVote({ prenom: " Paul ", jours: ["2026-11-22", "2026-11-21", "2026-11-22"] }, SONDAGE);
  assertEquals(v, { prenom: "Paul", cle: "paul", jours: ["2026-11-21", "2026-11-22"] });
});

Deno.test("validerVote : prénom vide, trop long (compté en caractères)", () => {
  assertEquals(validerVote({ prenom: "  ", jours: ["2026-11-21"] }, SONDAGE), { erreur: ERR_PRENOM_VIDE });
  assertEquals(validerVote({ jours: ["2026-11-21"] }, SONDAGE), { erreur: ERR_PRENOM_VIDE });
  assertEquals(validerVote({ prenom: "é".repeat(41), jours: ["2026-11-21"] }, SONDAGE), { erreur: ERR_PRENOM_LONG });
  assertEquals("erreur" in validerVote({ prenom: "é".repeat(40), jours: ["2026-11-21"] }, SONDAGE), false);
});

Deno.test("validerVote : jours vides, non tableau, mal formés, pris ou hors sondage", () => {
  assertEquals(validerVote({ prenom: "Paul", jours: [] }, SONDAGE), { erreur: ERR_JOURS_VIDES });
  assertEquals(validerVote({ prenom: "Paul", jours: "2026-11-21" }, SONDAGE), { erreur: ERR_JOURS_VIDES });
  assertEquals(validerVote({ prenom: "Paul", jours: ["demain"] }, SONDAGE), { erreur: ERR_JOURS_INVALIDES });
  assertEquals(validerVote({ prenom: "Paul", jours: [21] }, SONDAGE), { erreur: ERR_JOURS_INVALIDES });
  assertEquals(validerVote({ prenom: "Paul", jours: ["2026-11-23"] }, SONDAGE), { erreur: ERR_JOURS_INVALIDES });
  assertEquals(validerVote({ prenom: "Paul", jours: ["2026-11-21", "2030-01-01"] }, SONDAGE), { erreur: ERR_JOURS_INVALIDES });
  assertEquals(validerVote({ prenom: "Paul", jours: Array(63).fill("2026-11-21") }, SONDAGE), { erreur: ERR_JOURS_INVALIDES });
});

Deno.test("messageTelegram : nouveau vote et revote", () => {
  const base = { prenom: "Paul", titre: "Raclette", jours: ["2026-11-21", "2026-11-22"] };
  assertEquals(messageTelegram({ ...base, remplace: false }), "Paul est dispo pour « Raclette » : sam. 21 nov., dim. 22 nov.");
  assertEquals(messageTelegram({ ...base, remplace: true }), "Paul a changé son vote pour « Raclette » : sam. 21 nov., dim. 22 nov.");
});
