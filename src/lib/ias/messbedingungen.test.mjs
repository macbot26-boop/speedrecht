import test from "node:test";
import assert from "node:assert/strict";

import {
  STILLSTAND_GEDROSSELT_MS,
  STILLSTAND_MS,
  TAKT_MS,
  TAKT_TOLERANZ_MS,
  istEingeschraenkt,
  istHaenger,
  mitLebenszeichen,
  mitSichtbarkeit,
  mitTakt,
  neueBedingungen,
  stillstandGrenze,
} from "./messbedingungen.ts";

/** Ein beliebiger, fester Startzeitpunkt — die Rechnung kennt nur Abstände. */
const T0 = 1_700_000_000_000;

/** Ein Lauf, der im Vordergrund beginnt. */
function sichtbarerLauf() {
  return neueBedingungen(T0, false);
}

/**
 * Lässt Herzschläge vergehen. `abstand` ist der tatsächliche Abstand zwischen
 * zwei Schlägen — bei `TAKT_MS` ist alles in Ordnung, darüber war die Seite zu
 * langsam.
 */
function takte(stand, anzahl, abstand = TAKT_MS) {
  let jetzt = stand.letzterTakt;
  let ergebnis = stand;
  for (let i = 0; i < anzahl; i++) {
    jetzt += abstand;
    ergebnis = mitTakt(ergebnis, jetzt);
  }
  return ergebnis;
}

// ---------------------------------------------------------------------------
// Erkennung: wurde die Seite ausgebremst?
// ---------------------------------------------------------------------------

test("ein Lauf im Vordergrund gilt nicht als eingeschränkt", () => {
  const stand = takte(sichtbarerLauf(), 30);
  assert.equal(istEingeschraenkt(stand), false);
});

test("normales Zappeln der Timer kennzeichnet nicht", () => {
  // 300 ms Verspätung je Schlag: währenddessen laufen vier Datenströme, das
  // ist der Normalfall und darf keine Messung entwerten.
  const stand = takte(sichtbarerLauf(), 30, TAKT_MS + 300);
  assert.equal(istEingeschraenkt(stand), false);
});

test("ein Lauf, der im Hintergrund beginnt, ist sofort eingeschränkt", () => {
  assert.equal(istEingeschraenkt(neueBedingungen(T0, true)), true);
});

test("ein einziger Moment im Hintergrund kennzeichnet den ganzen Lauf", () => {
  let stand = takte(sichtbarerLauf(), 5);
  stand = mitSichtbarkeit(stand, true); // Nutzer wechselt den Tab
  stand = mitSichtbarkeit(stand, false); // … und kommt zurück
  stand = takte(stand, 20);
  assert.equal(
    istEingeschraenkt(stand),
    true,
    "einmal verborgen bleibt verborgen — welche Sekunden betroffen waren, lässt sich nicht mehr trennen"
  );
});

test("ein sichtbarer, aber ausgebremster Lauf wird über die Verspätung erkannt", () => {
  // Der Fall, den `visibilityState` nicht sieht: sichtbares Fenster, komplett
  // von einem anderen verdeckt.
  const stand = takte(sichtbarerLauf(), 3, TAKT_MS + TAKT_TOLERANZ_MS);
  assert.equal(stand.jeVerborgen, false);
  assert.equal(istEingeschraenkt(stand), true);
});

test("knapp unter der Toleranz wird nicht gekennzeichnet", () => {
  const stand = takte(sichtbarerLauf(), 10, TAKT_MS + TAKT_TOLERANZ_MS - 1);
  assert.equal(istEingeschraenkt(stand), false);
});

test("die grösste Verspätung zählt, nicht die letzte", () => {
  let stand = takte(sichtbarerLauf(), 1, TAKT_MS + TAKT_TOLERANZ_MS);
  stand = takte(stand, 10); // danach wieder alles ruhig
  assert.equal(istEingeschraenkt(stand), true);
});

test("mitSichtbarkeit gibt denselben Stand zurück, wenn sich nichts ändert", () => {
  const stand = sichtbarerLauf();
  assert.equal(mitSichtbarkeit(stand, false), stand);
});

// ---------------------------------------------------------------------------
// Wächter: steht die Messung?
// ---------------------------------------------------------------------------

test("solange die Messbibliothek meldet, hängt nichts", () => {
  let stand = sichtbarerLauf();
  let jetzt = T0;
  for (let i = 0; i < 60; i++) {
    jetzt += 500;
    stand = mitLebenszeichen(stand, jetzt);
    assert.equal(istHaenger(stand, jetzt), false);
  }
});

test("kurz vor der Grenze schlägt der Wächter noch nicht an", () => {
  const stand = sichtbarerLauf();
  assert.equal(istHaenger(stand, T0 + STILLSTAND_MS - 1), false);
});

test("nach der Grenze schlägt der Wächter an", () => {
  const stand = sichtbarerLauf();
  assert.equal(istHaenger(stand, T0 + STILLSTAND_MS), true);
});

test("ein Lebenszeichen setzt den Wächter zurück", () => {
  let stand = sichtbarerLauf();
  const fastZuSpaet = T0 + STILLSTAND_MS - 1;
  stand = mitLebenszeichen(stand, fastZuSpaet);
  assert.equal(istHaenger(stand, fastZuSpaet + STILLSTAND_MS - 1), false);
  assert.equal(istHaenger(stand, fastZuSpaet + STILLSTAND_MS), true);
});

test("eine gedrosselte Seite bekommt deutlich mehr Zeit", () => {
  const stand = neueBedingungen(T0, true);
  assert.equal(stillstandGrenze(stand), STILLSTAND_GEDROSSELT_MS);
  assert.equal(
    istHaenger(stand, T0 + STILLSTAND_MS + 1),
    false,
    "eine gedrosselte Seite arbeitet nur noch etwa einmal pro Minute — das ist langsam, aber kein Stillstand"
  );
  assert.equal(istHaenger(stand, T0 + STILLSTAND_GEDROSSELT_MS), true);
});

test("die gedrosselte Grenze überlebt einen Aufruf pro Minute", () => {
  // Genau der Rhythmus, den ein stark gedrosselter Tab noch bekommt: Alle
  // 60 Sekunden ein Lebenszeichen. Dieser Lauf misst — langsam, aber er misst.
  let stand = neueBedingungen(T0, true);
  let jetzt = T0;
  for (let minute = 0; minute < 10; minute++) {
    jetzt += 60_000;
    assert.equal(istHaenger(stand, jetzt), false, `Minute ${minute + 1}`);
    stand = mitLebenszeichen(stand, jetzt);
  }
});

test("ein gedrosselter Lauf ohne jedes Lebenszeichen wird abgebrochen", () => {
  const stand = neueBedingungen(T0, true);
  assert.equal(istHaenger(stand, T0 + STILLSTAND_GEDROSSELT_MS + 1), true);
});
