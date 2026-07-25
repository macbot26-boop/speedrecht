// Tests für die drei Versandwege.
//
// Beide geprüften Fehler wären LEISE: ein gekürzter E-Mail-Entwurf, der
// vollständig aussieht, und fremder Text, der im Druck-Dokument zu Markup wird.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { briefBauen } from "./text.ts";
import { kontaktFuer } from "./kontakte.ts";
import { MAILTO_MAX_LAENGE, briefHtml, htmlSicher, mailtoUrl } from "./versand.ts";

const daten = JSON.parse(
  await readFile(new URL("../tarife/tarife.generated.json", import.meta.url), "utf8")
);

const magentaL = daten.tarife.find((t) => t.tarifname === "MagentaZuhause L");
const brief = briefBauen({
  tarif: magentaL,
  gemessenMbps: 42,
  datum: "25.07.2026",
  verbindung: "lan",
  kundennummer: "1234567890",
  name: "Erika Mustermann",
});

// ---------------------------------------------------------------------------
// E-Mail-Entwurf
// ---------------------------------------------------------------------------

test("der Entwurf trägt Empfänger, Betreff und Text", () => {
  const { url } = mailtoUrl("kundenservice@pyur.com", brief);
  assert.ok(url.startsWith("mailto:kundenservice%40pyur.com?"));
  assert.ok(url.includes("subject="));
  assert.ok(url.includes("body="));
  const felder = new URLSearchParams(url.slice(url.indexOf("?") + 1));
  assert.equal(felder.get("subject"), brief.betreff);
  assert.equal(felder.get("body"), brief.text, "der Text muss unverändert ankommen");
});

test("ohne Empfänger öffnet der Entwurf trotzdem", () => {
  // Vier von sechs Anbietern veröffentlichen keine Kundenadresse — dann trägt
  // der Nutzer sie selbst ein, statt dass wir eine erfinden.
  const { url, grund } = mailtoUrl(null, brief);
  assert.equal(grund, null);
  assert.ok(url.startsWith("mailto:?"), "leeres An-Feld, aber Betreff und Text sind da");
  const felder = new URLSearchParams(url.slice(url.indexOf("?") + 1));
  assert.equal(felder.get("body"), brief.text);
});

test("Leerzeichen werden als %20 kodiert, nicht als Pluszeichen", () => {
  // Sonst stünden im fertigen Entwurf lauter Pluszeichen statt Leerzeichen.
  const { url } = mailtoUrl(null, brief);
  assert.ok(!url.includes("+"), "kein Pluszeichen im Verweis");
  assert.ok(url.includes("%20"));
});

test("KEIN Entwurf, wenn er gekürzt ankommen könnte", () => {
  const langerTarif = { ...magentaL, tarifname: "X".repeat(500) };
  const langerBrief = briefBauen({
    tarif: langerTarif,
    gemessenMbps: 42,
    datum: "25.07.2026",
    verbindung: "lan",
    kundennummer: "9".repeat(40),
    name: "Y".repeat(200),
  });
  const { url, grund } = mailtoUrl("kundenservice@pyur.com", langerBrief);
  assert.equal(url, null, "lieber kein Entwurf als ein stillschweigend gekürzter");
  assert.equal(grund, "zu_lang");
});

test("jeder echte Tarif der Datenbank passt in einen Entwurf", () => {
  // Der eigentliche Beweis, dass die Grenze im Alltag nicht greift: über ALLE
  // Tarife, mit den längsten Angaben, die die Prüfung überhaupt durchlässt.
  let laengste = 0;
  let schlimmster = null;
  for (const tarif of daten.tarife) {
    const b = briefBauen({
      tarif,
      gemessenMbps: 1,
      datum: "25.07.2026",
      verbindung: "wlan",
      kundennummer: "1".repeat(40), // MAX_LAENGE.kundennummer
      name: "Maximiliane Mustermann-Schmidt",
    });
    const kontakt = kontaktFuer(tarif.anbieter);
    const { url, grund } = mailtoUrl(kontakt?.email ?? null, b);
    assert.equal(grund, null, `${tarif.anbieter} „${tarif.tarifname}" wäre zu lang`);
    if (url.length > laengste) {
      laengste = url.length;
      schlimmster = tarif.tarifname;
    }
  }
  assert.ok(
    laengste < MAILTO_MAX_LAENGE,
    `längster Entwurf: ${laengste} Zeichen („${schlimmster}")`
  );
});

// ---------------------------------------------------------------------------
// Druck-Dokument
// ---------------------------------------------------------------------------

test("fremder Text wird maskiert, statt zu Markup zu werden", () => {
  assert.equal(htmlSicher("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(htmlSicher("Tarif & Co."), "Tarif &amp; Co.");
  assert.equal(htmlSicher('a"b\'c'), "a&quot;b&#39;c");
  // Das kaufmännische Und zuerst — sonst würde die eigene Maskierung
  // ein zweites Mal maskiert ("&amp;lt;").
  assert.equal(htmlSicher("&lt;"), "&amp;lt;");
});

test("ein Name mit Markup kann das Druck-Dokument nicht aufbrechen", () => {
  const boese = briefBauen({
    tarif: { ...magentaL, tarifname: "<img src=x onerror=alert(1)>" },
    gemessenMbps: 42,
    datum: "25.07.2026",
    verbindung: "lan",
    kundennummer: "</style><script>alert(2)</script>",
    name: "<b>Erika</b>",
  });
  const html = briefHtml({
    brief: boese,
    kontakt: kontaktFuer("Telekom"),
    datum: "25.07.2026",
    name: "<b>Erika</b>",
  });
  assert.ok(!html.includes("<script>"), "kein eingeschleustes Skript");
  assert.ok(!html.includes("<img"), "kein eingeschleustes Bild");
  assert.ok(!html.includes("<b>Erika</b>"), "auch harmloses Markup wird maskiert");
  assert.ok(html.includes("&lt;script&gt;"), "der Text ist als Text noch da");
});

test("das Druck-Dokument trägt Empfänger, Datum, Betreff und alle Absätze", () => {
  const html = briefHtml({
    brief,
    kontakt: kontaktFuer("Telekom"),
    datum: "25.07.2026",
    name: "Erika Mustermann",
  });
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("Telekom Deutschland GmbH<br>Landgrabenweg 149<br>53227 Bonn"));
  assert.ok(html.includes("25.07.2026"));
  assert.ok(html.includes(htmlSicher(brief.betreff)));
  // Jeder Absatz des Briefes muss als eigener Absatz erscheinen.
  const absaetze = brief.text.split("\n\n").length;
  assert.equal(html.match(/<p>/g).length, absaetze, "ein <p> je Absatz");
});

test("der Zeilenumbruch vor dem Namen bleibt erhalten", () => {
  const html = briefHtml({ brief, kontakt: kontaktFuer("Telekom"), datum: "25.07.2026", name: "Erika Mustermann" });
  assert.ok(
    html.includes("Mit freundlichen Grüßen<br>Erika Mustermann"),
    "sonst klebte der Name an der Grußformel"
  );
});

test("ohne Kontakt bleibt im Briefkopf ein sichtbarer Platzhalter", () => {
  const html = briefHtml({ brief, kontakt: null, datum: "25.07.2026", name: null });
  assert.ok(html.includes("Anschrift deines Anbieters"), "der Nutzer soll sehen, was fehlt");
});

test("das Druck-Dokument enthält kein Skript und keine externen Verweise", () => {
  const html = briefHtml({
    brief,
    kontakt: kontaktFuer("Telekom"),
    datum: "25.07.2026",
    name: "Erika Mustermann",
  });
  assert.ok(!/<script/i.test(html), "kein Skript");
  assert.ok(!/https?:\/\//i.test(html), "keine externen Verweise");
});
