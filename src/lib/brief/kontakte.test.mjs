// Tests für das Anbieter-Kontaktverzeichnis.
//
// Der teuerste Fehler hier ist leise: Eine falsche oder erfundene Adresse fällt
// niemandem auf — der Brief geht raus und kommt nie an. Zwei Wächter dagegen:
// jeder Eintrag muss belegt und datiert sein, und eine Impressums-Adresse darf
// nie als Kundenkontakt durchgehen.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ANBIETER_KONTAKTE, anschriftZeilen, kontaktFuer } from "./kontakte.ts";
import { FESTNETZ_ANBIETER } from "../netz/anbieter.ts";

const daten = JSON.parse(
  await readFile(new URL("../tarife/tarife.generated.json", import.meta.url), "utf8")
);

/** Anbieter, für die es überhaupt Tarife gibt — nur die können einen Brief auslösen. */
const anbieterMitTarifen = [...new Set(daten.tarife.map((t) => t.anbieter))];

test("jeder Anbieter mit Tarifen hat einen Kontakt", () => {
  assert.ok(anbieterMitTarifen.length >= 6, "es sollten mindestens sechs Anbieter Tarife haben");
  for (const anbieter of anbieterMitTarifen) {
    assert.ok(
      kontaktFuer(anbieter),
      `für "${anbieter}" gibt es Tarife, aber keinen Kontakt — der Brief hätte keinen Empfänger`
    );
  }
});

test("kein Kontakt zeigt auf einen Anbieter, den es gar nicht gibt", () => {
  for (const anbieter of Object.keys(ANBIETER_KONTAKTE)) {
    assert.ok(
      FESTNETZ_ANBIETER.includes(anbieter),
      `"${anbieter}" steht nicht in FESTNETZ_ANBIETER`
    );
  }
});

test("unbekannter Anbieter gibt null statt zu raten", () => {
  assert.equal(kontaktFuer("Gibt-Es-Nicht"), null);
  assert.equal(kontaktFuer(""), null);
  // Kein Durchgriff auf ererbte Eigenschaften des Objekts.
  assert.equal(kontaktFuer("toString"), null);
  assert.equal(kontaktFuer("constructor"), null);
});

test("jeder Eintrag ist belegt und datiert", () => {
  for (const [anbieter, kontakt] of Object.entries(ANBIETER_KONTAKTE)) {
    assert.ok(kontakt.beleg.length > 30, `Beleg für ${anbieter} ist zu dünn`);
    assert.match(
      kontakt.geprueft,
      /^\d{4}-\d{2}-\d{2}$/,
      `Prüfdatum für ${anbieter} muss "JJJJ-MM-TT" sein`
    );
  }
});

test("jeder Eintrag trägt Gesellschaft und Ort", () => {
  for (const [anbieter, kontakt] of Object.entries(ANBIETER_KONTAKTE)) {
    assert.ok(kontakt.gesellschaft.length > 0, `${anbieter} ohne Gesellschaft`);
    assert.match(kontakt.ort, /^\d{5} \S/, `${anbieter}: Ort muss mit der Postleitzahl beginnen`);
  }
});

test("eine Impressums-Adresse gilt nie als Kundenkontakt", () => {
  // Genau diese Verwechslung lag nahe: Telekom, Vodafone, o2 und Deutsche
  // Glasfaser nennen in ihren Impressen eine E-Mail — aber ausdrücklich für
  // das Impressum, nicht für Vertragsfragen. Als Kundenkontakt eingetragen,
  // landete der Brief an einer Stelle, die ihn nicht bearbeitet.
  for (const [anbieter, kontakt] of Object.entries(ANBIETER_KONTAKTE)) {
    if (kontakt.email === null) continue;
    assert.ok(
      !kontakt.email.startsWith("impressum@"),
      `${anbieter}: impressum@ ist keine Kundenadresse`
    );
    assert.ok(
      !kontakt.email.startsWith("business@"),
      `${anbieter}: business@ ist für Geschäftskunden, nicht für Privatkunden`
    );
    assert.match(kontakt.email, /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/, `${anbieter}: keine gültige E-Mail`);
  }
});

test("fehlende E-Mail ist null und wird nicht durch Leerstring vorgetäuscht", () => {
  for (const [anbieter, kontakt] of Object.entries(ANBIETER_KONTAKTE)) {
    assert.ok(
      kontakt.email === null || kontakt.email.length > 0,
      `${anbieter}: E-Mail muss null oder echt sein, nie ""`
    );
  }
});

test("die Anschrift lässt eine fehlende Straße einfach weg", () => {
  // Deutsche Glasfaser hat eine Großempfänger-Postleitzahl und gar keine
  // Straße — daraus darf keine Leerzeile im Briefkopf werden.
  const dg = kontaktFuer("Deutsche Glasfaser");
  assert.equal(dg.strasse, null);
  assert.deepEqual(anschriftZeilen(dg), ["Deutsche Glasfaser Wholesale GmbH", "40463 Düsseldorf"]);

  const telekom = kontaktFuer("Telekom");
  assert.deepEqual(anschriftZeilen(telekom), [
    "Telekom Deutschland GmbH",
    "Landgrabenweg 149",
    "53227 Bonn",
  ]);
});

test("keine Anschriftszeile ist leer", () => {
  for (const [anbieter, kontakt] of Object.entries(ANBIETER_KONTAKTE)) {
    for (const zeile of anschriftZeilen(kontakt)) {
      assert.ok(zeile.trim().length > 0, `${anbieter} hat eine leere Anschriftszeile`);
    }
  }
});

test("die Vertragsgesellschaft ist eingetragen, nicht die Marke", () => {
  // Lehre aus dem Rechnungs-Scan: Im Briefkopf steht die abrechnende
  // Gesellschaft. Bei 1&1 ist der Unterschied greifbar — das Impressum der
  // Website nennt die "1&1 Telecommunication SE", die Blätter durchgehend die
  // "1&1 Telecom GmbH". Der Vertrag besteht mit letzterer.
  assert.equal(kontaktFuer("1&1").gesellschaft, "1&1 Telecom GmbH");
  assert.equal(kontaktFuer("o2").gesellschaft, "Telefónica Germany GmbH & Co. OHG");
  for (const [anbieter, kontakt] of Object.entries(ANBIETER_KONTAKTE)) {
    assert.match(
      kontakt.gesellschaft,
      /(GmbH|AG|SE|OHG|KG)/,
      `${anbieter}: "${kontakt.gesellschaft}" sieht nicht nach einer Gesellschaft aus`
    );
  }
});
