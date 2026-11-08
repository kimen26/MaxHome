// Note d'une charge (D-065) : règle d'écriture (vide, inchangée, trop longue), date « 8 nov. »,
// HTML échappé. Valeurs inventées (jamais de vraie donnée, invariant 1).
import assert from "node:assert/strict";
import { NOTE_MAX, dateNote, aUneNote, champsNote, htmlChampNote, htmlRepereNote }
  from "../frontend/budget/note-charge.js";

const MAINTENANT = "2026-11-08T10:00:00.000Z";

// ---------- dateNote ----------
assert.equal(dateNote("2026-11-08T09:00:00"), "8 nov.");
assert.equal(dateNote("2026-03-01T09:00:00"), "1 mars");
assert.equal(dateNote("2026-12-31T09:00:00"), "31 déc.");
assert.equal(dateNote(null), "");
assert.equal(dateNote("pas une date"), "");

// ---------- aUneNote ----------
assert.equal(aUneNote({ note: "x" }), true);
assert.equal(aUneNote({ note: "   " }), false);
assert.equal(aUneNote({ note: null }), false);
assert.equal(aUneNote(undefined), false);

// ---------- champsNote ----------
// Nouvelle note : texte rogné + date de maintenant.
assert.deepEqual(champsNote("  Hausse de la copro  ", { note: null }, MAINTENANT),
  { note: "Hausse de la copro", note_le: MAINTENANT });
// Note modifiée : la date est remise à maintenant.
assert.deepEqual(champsNote("Nouveau texte", { note: "Ancien", note_le: "2026-01-01T00:00:00Z" }, MAINTENANT),
  { note: "Nouveau texte", note_le: MAINTENANT });
// Champ vidé : note ET date effacées.
assert.deepEqual(champsNote("   ", { note: "Ancien", note_le: "2026-01-01T00:00:00Z" }, MAINTENANT),
  { note: null, note_le: null });
// Rien à effacer, rien à écrire.
assert.equal(champsNote("", { note: null }, MAINTENANT), null);
// Texte inchangé (aux espaces près) : on n'écrit pas, la date ne bouge pas.
assert.equal(champsNote("Ancien ", { note: "Ancien", note_le: "2026-01-01T00:00:00Z" }, MAINTENANT), null);
// Limite : 500 passe, 501 est refusé avec un message.
assert.deepEqual(champsNote("a".repeat(NOTE_MAX), {}, MAINTENANT), { note: "a".repeat(NOTE_MAX), note_le: MAINTENANT });
assert.match(champsNote("a".repeat(NOTE_MAX + 1), {}, MAINTENANT), /501 caractères, 500 au plus/);

// ---------- HTML ----------
const c = { note: 'Copro <b>420</b> & "travaux"', note_le: "2026-11-08T09:00:00" };
const champ = htmlChampNote(c);
assert.ok(champ.includes("<textarea"), "champ multiligne");
assert.ok(champ.includes('maxlength="500"'));
assert.ok(champ.includes("Copro &lt;b&gt;420&lt;/b&gt; &amp; &quot;travaux&quot;"), "note échappée");
assert.ok(!champ.includes("<b>420</b>"), "aucune balise brute");
assert.ok(champ.includes("Pourquoi ce montant, ce qui a changé"));
assert.ok(champ.includes("notée le 8 nov."));
assert.ok(!htmlChampNote({ note: null, note_le: null }).includes("notée le"), "pas de date sans note");
assert.ok(!/height\s*:/i.test(champ), "aucune hauteur fixe");

assert.ok(htmlRepereNote(c).includes("Note"), "le repère dit « Note » en toutes lettres");
assert.equal(htmlRepereNote({ note: null }), "");

console.log("test_note_charge : OK");
