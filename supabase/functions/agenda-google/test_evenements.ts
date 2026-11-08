// Test Deno hors ligne (aucun réseau, aucun secret) de la conversion Google → app.
// Lancer : deno test --allow-all --no-lock supabase/functions/agenda-google/test_evenements.ts
// Les événements ci-dessous sont FICTIFS (invariant 1 : aucune donnée réelle du foyer dans le dépôt).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  bornesGoogle, CLE_PERSONNE, convertirEvenement, convertirEvenements, corpsGoogle, decalerJour, MAX_JOURS, ORIGINE_PROD,
  origineAutorisee, TITRE_MAX, TITRE_VIDE, validerId, validerPeriode, validerSaisie, type EvenementGoogle, type Saisie,
} from "./evenements.ts";

Deno.test("journée entière : end.date exclusive devient une fin inclusive", () => {
  const e = convertirEvenement({
    id: "x1", summary: "Voyage test", start: { date: "2026-11-30" }, end: { date: "2026-12-05" },
  });
  assertEquals(e, { id: "x1", titre: "Voyage test", debut: "2026-11-30", fin: "2026-12-04", heureDebut: null, heureFin: null, personne: null });
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
  assertEquals(e, { id: "x4", titre: "Piscine", debut: "2026-11-07", fin: "2026-11-07", heureDebut: "10:40", heureFin: "11:30", personne: null });
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
  assertEquals(Object.keys(e ?? {}).sort(), ["debut", "fin", "heureDebut", "heureFin", "id", "personne", "titre"]);
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

// ---------- « pour qui » lu dans l'événement ----------

Deno.test("personne : lue dans extendedProperties.private, null si absente ou inconnue", () => {
  const base = { id: "p", summary: "Garde", start: { date: "2026-11-04" }, end: { date: "2026-11-05" } };
  const avec = (v?: string): EvenementGoogle => ({ ...base, extendedProperties: { private: v === undefined ? {} : { [CLE_PERSONNE]: v } } });
  assertEquals(convertirEvenement(avec("Claudia"))?.personne, "Claudia");
  assertEquals(convertirEvenement(avec("Famille"))?.personne, "Famille");
  assertEquals(convertirEvenement(avec("Inconnu"))?.personne, null);
  assertEquals(convertirEvenement(avec())?.personne, null);
  assertEquals(convertirEvenement(base)?.personne, null);
  const horaire = convertirEvenement({
    id: "q", start: { dateTime: "2026-11-07T10:40:00+01:00" }, end: { dateTime: "2026-11-07T11:30:00+01:00" },
    extendedProperties: { private: { [CLE_PERSONNE]: "Max" } },
  });
  assertEquals(horaire?.personne, "Max");
});

// ---------- écriture : validation ----------

const bonne = { titre: "Piscine", personne: "Max", debut: "2027-01-15", fin: "2027-01-15" };
const erreurDe = (corps: unknown) => {
  const r = validerSaisie(corps);
  return "erreur" in r ? r.erreur : null;
};

Deno.test("saisie valide : titre rogné, heures absentes → journée entière", () => {
  const attendue: Saisie = { titre: "Piscine", personne: "Max", debut: "2027-01-15", fin: "2027-01-15", heureDebut: null, heureFin: null };
  assertEquals(validerSaisie({ ...bonne, titre: "  Piscine  " }), attendue);
  assertEquals(validerSaisie({ ...bonne, heureDebut: "", heureFin: null }), attendue);
  assertEquals(validerSaisie({ ...bonne, fin: "2027-01-17" }), { ...attendue, fin: "2027-01-17" });
});

Deno.test("titre : 1 à 200 caractères après rognage", () => {
  assertEquals(erreurDe({ ...bonne, titre: "" }), "Donnez un titre à l'événement.");
  assertEquals(erreurDe({ ...bonne, titre: "   " }), "Donnez un titre à l'événement.");
  assertEquals(erreurDe({ ...bonne, titre: 12 }), "Donnez un titre à l'événement.");
  assertEquals(erreurDe({ ...bonne, titre: "x".repeat(TITRE_MAX) }), null);
  assertEquals(erreurDe({ ...bonne, titre: ` ${"x".repeat(TITRE_MAX)} ` }), null);
  assertEquals(erreurDe({ ...bonne, titre: "x".repeat(TITRE_MAX + 1) })?.includes("trop long"), true);
});

Deno.test("personne : Max, Yann, Claudia ou Famille, rien d'autre", () => {
  for (const p of ["Max", "Yann", "Claudia", "Famille"]) assertEquals(erreurDe({ ...bonne, personne: p }), null, p);
  for (const p of ["max", "Maxime", "", null, undefined, 3]) {
    assertEquals(erreurDe({ ...bonne, personne: p })?.startsWith("Choisissez pour qui"), true, String(p));
  }
});

Deno.test("dates : réelles, fin >= début", () => {
  assertEquals(erreurDe({ ...bonne, debut: "2027-02-30", fin: "2027-03-01" })?.includes("début"), true);
  assertEquals(erreurDe({ ...bonne, debut: "15/01/2027" })?.includes("début"), true);
  assertEquals(erreurDe({ ...bonne, fin: "2027-13-01" })?.includes("fin"), true);
  assertEquals(erreurDe({ ...bonne, fin: undefined })?.includes("fin"), true);
  assertEquals(erreurDe({ ...bonne, fin: "2027-01-14" }), "La date de fin est avant la date de début.");
  assertEquals(erreurDe({ ...bonne, debut: "2028-02-29", fin: "2028-02-29" }), null);
});

Deno.test("heures : les deux ou aucune, HH:MM valides, même jour, fin après début", () => {
  assertEquals(erreurDe({ ...bonne, heureDebut: "10:00", heureFin: "11:30" }), null);
  assertEquals(erreurDe({ ...bonne, heureDebut: "00:00", heureFin: "23:59" }), null);
  assertEquals(erreurDe({ ...bonne, heureDebut: "10:00" })?.startsWith("Indiquez les deux heures"), true);
  assertEquals(erreurDe({ ...bonne, heureFin: "10:00" })?.startsWith("Indiquez les deux heures"), true);
  for (const h of ["24:00", "9:00", "10:60", "10h30", "abc", 1030]) {
    assertEquals(erreurDe({ ...bonne, heureDebut: h, heureFin: "23:00" })?.includes("heure de début"), true, String(h));
  }
  assertEquals(erreurDe({ ...bonne, heureDebut: "10:00", heureFin: "25:00" })?.includes("heure de fin"), true);
  assertEquals(erreurDe({ ...bonne, heureDebut: "10:00", heureFin: "10:00" }), "L'heure de fin doit être après l'heure de début.");
  assertEquals(erreurDe({ ...bonne, heureDebut: "11:00", heureFin: "10:00" }), "L'heure de fin doit être après l'heure de début.");
  assertEquals(erreurDe({ ...bonne, fin: "2027-01-16", heureDebut: "10:00", heureFin: "11:00" })?.includes("un seul jour"), true);
});

Deno.test("corps de la demande : objet obligatoire", () => {
  for (const c of [null, undefined, "x", 3]) assertEquals(erreurDe(c), "Demande illisible.");
});

Deno.test("id : caractères d'un id Google, jamais / ? # ni vide", () => {
  for (const id of ["abc123", "a_b-c", "k4t5n9_20261115T100000Z", "x".repeat(1024)]) assertEquals(validerId(id), { id }, id.slice(0, 20));
  for (const id of ["", "a/b", "a?b", "a#b", "a b", "../x", "x".repeat(1025), null, undefined, 5]) {
    assertEquals("erreur" in validerId(id), true, String(id));
  }
});

// ---------- écriture : corps envoyé à Google ----------

const saisie = (o: Partial<Saisie> = {}): Saisie => ({
  titre: "Piscine", personne: "Max", debut: "2027-01-15", fin: "2027-01-15", heureDebut: null, heureFin: null, ...o,
});

Deno.test("création en journée entière : end.date exclusive, personne en propriété privée", () => {
  assertEquals(corpsGoogle(saisie(), false), {
    summary: "Piscine", start: { date: "2027-01-15" }, end: { date: "2027-01-16" },
    extendedProperties: { private: { [CLE_PERSONNE]: "Max" } },
  });
  assertEquals((corpsGoogle(saisie({ fin: "2027-01-31" }), false).end as { date: string }).date, "2027-02-01", "fin exclusive franchit le mois");
  assertEquals((corpsGoogle(saisie({ debut: "2026-12-31", fin: "2026-12-31" }), false).end as { date: string }).date, "2027-01-01");
});

Deno.test("création horaire : dateTime sans décalage + fuseau de Paris", () => {
  const c = corpsGoogle(saisie({ heureDebut: "09:30", heureFin: "11:00", personne: "Famille" }), false);
  assertEquals(c.start, { dateTime: "2027-01-15T09:30:00", timeZone: "Europe/Paris" });
  assertEquals(c.end, { dateTime: "2027-01-15T11:00:00", timeZone: "Europe/Paris" });
  assertEquals(c.extendedProperties, { private: { [CLE_PERSONNE]: "Famille" } });
});

Deno.test("modification : l'autre forme de date est mise à null, aucun champ hors périmètre", () => {
  const journee = corpsGoogle(saisie(), true);
  assertEquals(journee.start, { date: "2027-01-15", dateTime: null, timeZone: null });
  assertEquals(journee.end, { date: "2027-01-16", dateTime: null, timeZone: null });
  const horaire = corpsGoogle(saisie({ heureDebut: "09:30", heureFin: "11:00" }), true);
  assertEquals(horaire.start, { dateTime: "2027-01-15T09:30:00", timeZone: "Europe/Paris", date: null });
  assertEquals(Object.keys(journee).sort(), ["end", "extendedProperties", "start", "summary"], "ni description ni rappels");
});
