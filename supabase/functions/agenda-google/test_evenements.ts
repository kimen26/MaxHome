// Test Deno hors ligne (aucun réseau, aucun secret) de la conversion Google → app.
// Lancer : deno test --allow-all --no-lock supabase/functions/agenda-google/test_evenements.ts
// Les événements ci-dessous sont FICTIFS (invariant 1 : aucune donnée réelle du foyer dans le dépôt).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  bornesGoogle, convertirEvenement, convertirEvenements, decalerJour, MAX_JOURS, ORIGINE_PROD, origineAutorisee,
  TITRE_VIDE, validerPeriode,
} from "./evenements.ts";

Deno.test("journée entière : end.date exclusive devient une fin inclusive", () => {
  const e = convertirEvenement({
    id: "x1", summary: "Voyage test", start: { date: "2026-11-30" }, end: { date: "2026-12-05" },
  });
  assertEquals(e, { id: "x1", titre: "Voyage test", debut: "2026-11-30", fin: "2026-12-04", heureDebut: null, heureFin: null });
});

Deno.test("journée entière d'un seul jour : début = fin", () => {
  const e = convertirEvenement({ id: "x2", summary: "Garde", start: { date: "2026-11-04" }, end: { date: "2026-11-05" } });
  assertEquals([e?.debut, e?.fin], ["2026-11-04", "2026-11-04"]);
});

Deno.test("journée entière sans end : un seul jour", () => {
  const e = convertirEvenement({ id: "x3", summary: "Sans fin", start: { date: "2026-02-28" } });
  assertEquals([e?.debut, e?.fin], ["2026-02-28", "2026-02-28"]);
});

Deno.test("fin exclusive au 1er d'un mois : retrait d'un jour franchit le mois et l'année", () => {
  assertEquals(convertirEvenement({ id: "a", start: { date: "2026-12-30" }, end: { date: "2027-01-01" } })?.fin, "2026-12-31");
  assertEquals(convertirEvenement({ id: "b", start: { date: "2028-02-27" }, end: { date: "2028-03-01" } })?.fin, "2028-02-29");
});

Deno.test("événement horaire : heures lues dans la chaîne, sans conversion", () => {
  const e = convertirEvenement({
    id: "x4", summary: "Piscine", start: { dateTime: "2026-11-07T10:40:00+01:00" }, end: { dateTime: "2026-11-07T11:30:00+01:00" },
  });
  assertEquals(e, { id: "x4", titre: "Piscine", debut: "2026-11-07", fin: "2026-11-07", heureDebut: "10:40", heureFin: "11:30" });
});

Deno.test("heure d'été : le décalage +02:00 ne change pas le jour ni l'heure lus", () => {
  const e = convertirEvenement({ id: "x5", summary: "Foot", start: { dateTime: "2027-07-10T23:30:00+02:00" }, end: { dateTime: "2027-07-11T01:00:00+02:00" } });
  assertEquals([e?.debut, e?.heureDebut, e?.fin, e?.heureFin], ["2027-07-10", "23:30", "2027-07-11", "01:00"]);
});

Deno.test("horaire qui finit pile à minuit : l'app le termine la veille", () => {
  const e = convertirEvenement({ id: "x6", summary: "Soirée", start: { dateTime: "2026-11-07T20:00:00+01:00" }, end: { dateTime: "2026-11-08T00:00:00+01:00" } });
  assertEquals([e?.debut, e?.fin, e?.heureFin], ["2026-11-07", "2026-11-07", "00:00"]);
});

Deno.test("titre vide, absent ou blanc : « Sans titre »", () => {
  for (const summary of [undefined, "", "   "]) {
    assertEquals(convertirEvenement({ id: "t", summary, start: { date: "2026-11-04" }, end: { date: "2026-11-05" } })?.titre, TITRE_VIDE);
  }
});

Deno.test("aucun champ en plus : ni description, ni participants, ni lieu", () => {
  const brut = {
    id: "x7", summary: "Dîner", description: "SECRET", location: "ADRESSE", attendees: [{ email: "a@b.c" }],
    start: { date: "2026-11-04" }, end: { date: "2026-11-05" },
  };
  const e = convertirEvenement(brut);
  assertEquals(Object.keys(e ?? {}).sort(), ["debut", "fin", "heureDebut", "heureFin", "id", "titre"]);
  assertEquals(JSON.stringify(e).includes("SECRET"), false);
  assertEquals(JSON.stringify(e).includes("ADRESSE"), false);
});

Deno.test("annulé ou illisible : écarté, le reste est gardé dans l'ordre", () => {
  const liste = convertirEvenements([
    { id: "1", summary: "A", start: { date: "2026-11-04" }, end: { date: "2026-11-05" } },
    { id: "2", summary: "Annulé", status: "cancelled", start: { date: "2026-11-04" }, end: { date: "2026-11-05" } },
    { id: "3", summary: "Sans début" },
    { id: "4", summary: "Date folle", start: { date: "2026-02-31" } },
    { id: "5", summary: "B", start: { dateTime: "2026-11-06T09:00:00+01:00" }, end: { dateTime: "2026-11-06T10:00:00+01:00" } },
  ]);
  assertEquals(liste.map((e) => e.id), ["1", "5"]);
});

Deno.test("decalerJour : mois, années bissextiles, aller-retour", () => {
  assertEquals(decalerJour("2026-03-01", -1), "2026-02-28");
  assertEquals(decalerJour("2028-03-01", -1), "2028-02-29");
  assertEquals(decalerJour("2026-12-31", 1), "2027-01-01");
  assertEquals(decalerJour(decalerJour("2026-10-25", 3), -3), "2026-10-25");
});

Deno.test("validerPeriode : période correcte", () => {
  assertEquals(validerPeriode("2026-08-01", "2027-11-30"), { debut: "2026-08-01", fin: "2027-11-30" });
  assertEquals(validerPeriode("2026-11-04", "2026-11-04"), { debut: "2026-11-04", fin: "2026-11-04" });
});

Deno.test("validerPeriode : refus des entrées invalides", () => {
  const refus: unknown[][] = [
    [undefined, "2026-11-04"], ["2026-11-04", null], [20261104, "2026-11-05"], ["04/11/2026", "2026-11-05"],
    ["2026-02-31", "2026-03-01"], ["2026-11-04T10:00", "2026-11-05"], ["2026-11-05", "2026-11-04"], ["", ""],
  ];
  for (const [d, f] of refus) assertEquals("erreur" in validerPeriode(d, f), true, `${d} → ${f}`);
});

Deno.test("validerPeriode : période trop longue refusée", () => {
  assertEquals("erreur" in validerPeriode("2020-01-01", "2026-01-01"), true);
  assertEquals("erreur" in validerPeriode("2026-01-01", decalerJour("2026-01-01", MAX_JOURS)), false);
  assertEquals("erreur" in validerPeriode("2026-01-01", decalerJour("2026-01-01", MAX_JOURS + 1)), true);
});

Deno.test("bornesGoogle : RFC3339 avec décalage explicite, timeMax = lendemain de fin", () => {
  assertEquals(bornesGoogle("2026-08-01", "2027-11-30"), { timeMin: "2026-08-01T00:00:00Z", timeMax: "2027-12-01T00:00:00Z" });
  const { timeMin, timeMax } = bornesGoogle("2026-12-31", "2026-12-31");
  assertEquals([timeMin, timeMax], ["2026-12-31T00:00:00Z", "2027-01-01T00:00:00Z"]);
  for (const b of [timeMin, timeMax]) assertEquals(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/.test(b), true);
});

Deno.test("origineAutorisee : site et localhost renvoyés tels quels, le reste retombe sur le site", () => {
  assertEquals(origineAutorisee(ORIGINE_PROD), ORIGINE_PROD);
  assertEquals(origineAutorisee("http://localhost:54321"), "http://localhost:54321");
  for (const o of [null, "", "https://evil.example", "http://localhost", "http://localhost:80/x", "https://localhost:3000",
    "http://localhost:3000.evil.example", "https://kimen26.github.io.evil.example"]) {
    assertEquals(origineAutorisee(o), ORIGINE_PROD, String(o));
  }
});
