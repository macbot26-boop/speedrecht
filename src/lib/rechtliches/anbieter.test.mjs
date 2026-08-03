// Tests für die Anbieterangaben des Impressums.
//
// Der Fehler, um den es hier geht, ist LEISE und teuer: Ein Impressum, das
// eine erfundene Firma und eine erfundene HRB-Nummer nennt, sieht vollkommen
// normal aus. Niemand merkt es beim Ansehen — auffallen würde es erst durch
// einen Anwaltsbrief. Deshalb hängt die Sichtbarkeit der Rechtsseiten nicht am
// Gedächtnis, sondern an `angabenSindEcht`, und die Sicherung dagegen steht
// hier.
//
// Die gefährliche Richtung ist immer dieselbe: Schalter schon umgelegt, Werte
// noch erfunden. Umgekehrt (echte Werte, Schalter noch true) ist harmlos — dann
// bleiben die Seiten nur länger hinter dem Zugangscode als nötig.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANBIETER,
  BEISPIEL_MARKE,
  angabenSindEcht,
  enthaeltBeispielwerte,
  fehlendePflichtangaben,
} from "./anbieter.ts";

/** Ein vollständiger, echt aussehender Satz Angaben — Grundlage der Varianten. */
const ECHT = {
  firma: "Beispielfirma UG (haftungsbeschränkt)",
  vertreten: "Alex Muster",
  strasse: "c/o Bürodienst, Hauptstraße 12",
  ort: "10115 Berlin",
  land: "Deutschland",
  email: "impressum@speedrecht.de",
  registergericht: "Amtsgericht Charlottenburg",
  hrb: "HRB 123456",
  ustIdNr: "DE123456789",
  platzhalter: false,
};

// ---------------------------------------------------------------------------
// Vollständigkeit der Pflichtangaben
// ---------------------------------------------------------------------------

test("vollständige Angaben lassen keine Pflichtangabe offen", () => {
  assert.deepEqual(fehlendePflichtangaben(ECHT), []);
});

test("jede einzelne Pflichtangabe wird vermisst, wenn sie fehlt", () => {
  // Einzeln durchgespielt, statt nur einen Fall zu prüfen: Ein vergessenes
  // Feld in der Liste PFLICHTFELDER fiele bei einem Sammeltest nicht auf.
  for (const feld of [
    "firma",
    "vertreten",
    "strasse",
    "ort",
    "land",
    "email",
    "registergericht",
    "hrb",
  ]) {
    assert.deepEqual(
      fehlendePflichtangaben({ ...ECHT, [feld]: "" }),
      [feld],
      `${feld} muss als fehlend erkannt werden`
    );
  }
});

test("Leerzeichen gelten nicht als Angabe", () => {
  // Ohne trim() wäre " " eine gefüllte Anschrift — und das Impressum
  // scheinbar vollständig.
  assert.deepEqual(fehlendePflichtangaben({ ...ECHT, strasse: "   " }), ["strasse"]);
});

test("eine fehlende USt-IdNr. ist kein Mangel", () => {
  // Die Angabe ist nur Pflicht, wenn eine Nummer existiert (§ 27a UStG).
  assert.deepEqual(fehlendePflichtangaben({ ...ECHT, ustIdNr: null }), []);
  assert.equal(angabenSindEcht({ ...ECHT, ustIdNr: null }), true);
});

// ---------------------------------------------------------------------------
// Erkennung von Beispielwerten
// ---------------------------------------------------------------------------

test("echte Angaben enthalten keine Beispielwerte", () => {
  assert.equal(enthaeltBeispielwerte(ECHT), false);
});

test("die Beispielmarke wird in jedem Feld gefunden", () => {
  for (const feld of Object.keys(ECHT).filter((f) => f !== "platzhalter")) {
    assert.equal(
      enthaeltBeispielwerte({ ...ECHT, [feld]: `Wert ${BEISPIEL_MARKE}` }),
      true,
      `${feld} muss auf die Beispielmarke geprüft werden`
    );
  }
});

test("eine .invalid-Adresse gilt als Beispielwert", () => {
  // .invalid kann es per RFC 2606 im echten Netz nie geben. Eine solche
  // Adresse im Impressum wäre ein Kontaktweg, der niemanden erreicht.
  assert.equal(enthaeltBeispielwerte({ ...ECHT, email: "post@irgendwo.invalid" }), true);
});

// ---------------------------------------------------------------------------
// Das Tor: angabenSindEcht
// ---------------------------------------------------------------------------

test("nur echte, vollständige Angaben sind veröffentlichungsreif", () => {
  assert.equal(angabenSindEcht(ECHT), true);
});

test("der Schalter platzhalter hält die Seiten auch bei echten Werten zu", () => {
  assert.equal(angabenSindEcht({ ...ECHT, platzhalter: true }), false);
});

test("ein umgelegter Schalter allein macht Beispieldaten nicht echt", () => {
  // DER Fall, um den es geht: halb erledigter Tausch. Firma schon richtig,
  // Registergericht noch erfunden, Schalter aus Versehen schon auf false.
  const halbFertig = {
    ...ECHT,
    registergericht: `Amtsgericht Musterstadt (${BEISPIEL_MARKE})`,
    platzhalter: false,
  };
  assert.equal(angabenSindEcht(halbFertig), false);
});

test("unvollständige Angaben sind nie veröffentlichungsreif", () => {
  assert.equal(angabenSindEcht({ ...ECHT, hrb: "" }), false);
});

// ---------------------------------------------------------------------------
// Der ausgelieferte Stand
// ---------------------------------------------------------------------------

test("die ausgelieferten Angaben sind strukturell vollständig", () => {
  // Auch die Beispieldaten müssen alle Felder füllen — sonst prüft niemand,
  // ob die Seiten mit vollständigen Angaben überhaupt richtig aussehen.
  assert.deepEqual(fehlendePflichtangaben(ANBIETER), []);
});

test("der ausgelieferte Stand ist als Beispiel gekennzeichnet und nicht öffentlich", () => {
  // Diese Zusicherung dreht sich, sobald die echten Firmendaten eingetragen
  // sind. Genau dann MUSS sie umgeschrieben werden — und dieser Test ist die
  // Erinnerung daran, dass mit dem Umschreiben eine Entscheidung fällt: Ab
  // jetzt ist das Impressum öffentlich und muss stimmen.
  assert.equal(ANBIETER.platzhalter, true);
  assert.equal(enthaeltBeispielwerte(ANBIETER), true);
  assert.equal(angabenSindEcht(ANBIETER), false);
});
