// Tests für die Vorprüfung nach § 57 Abs. 4 TKG — gegen die ECHTE generierte
// Tarif-Tabelle (MagentaZuhause L: bis zu 100, normalerweise 83,8, mindestens 54).
//
// Der teuerste Fehler wäre nicht "auffällig übersehen", sondern das Gegenteil:
// nach einer einzigen Messung einen Anspruch behaupten, den es nicht gibt.
// Die erste Testgruppe sichert genau das ab.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { vorpruefung } from "./kriterien.ts";
import { tarifUrteil } from "./urteil.ts";

const daten = JSON.parse(
  await readFile(new URL("./tarife.generated.json", import.meta.url), "utf8")
);

const magentaL = daten.tarife.find((t) => t.tarifname === "MagentaZuhause L");
assert.ok(magentaL, "MagentaZuhause L muss in den Tarifdaten existieren");
assert.equal(magentaL.download_max_mbps, 100); // 90-%-Schwelle = 90
assert.equal(magentaL.download_normal_mbps, 83.8);
assert.equal(magentaL.download_min_mbps, 54);

/** Kurzschreibweise: `messwerte({ "2026-07-01": [10, 20] })`. */
const messwerte = (nachTag) =>
  Object.entries(nachTag).flatMap(([tag, werte]) => werte.map((mbps) => ({ mbps, tag })));

const kriterium = (ergebnis, name) => ergebnis.kriterien.find((k) => k.name === name);

// --- Eine einzelne Messung darf nie ein Urteil ergeben --------------------

test("eine einzige Messung urteilt über kein Kriterium", () => {
  // Der Wert ist katastrophal (3 statt 100) — trotzdem darf hier nichts
  // "auffällig" heißen: Alle drei Kriterien setzen mehrere Messungen voraus.
  const e = vorpruefung(magentaL, messwerte({ "2026-07-01": [3] }));
  assert.equal(e.gesamt, "zu_wenig_daten");
  for (const k of e.kriterien) assert.equal(k.stand, "zu_wenig_daten", k.name);
});

test("nach einer Messung wird gesagt, wie viel noch fehlt", () => {
  const e = vorpruefung(magentaL, messwerte({ "2026-07-01": [3] }));
  // Die tagesbezogenen Kriterien brauchen noch zwei weitere Messtage …
  assert.equal(kriterium(e, "90_prozent").nochNoetig, 2);
  assert.equal(kriterium(e, "minimum").nochNoetig, 2);
  // … das Üblich-Kriterium neun weitere Messungen.
  assert.equal(kriterium(e, "ueblich").nochNoetig, 9);
});

test("auch zwei schlechte Messtage reichen noch nicht", () => {
  const e = vorpruefung(
    magentaL,
    messwerte({ "2026-07-01": [3, 4], "2026-07-02": [3, 4] })
  );
  assert.equal(kriterium(e, "90_prozent").stand, "zu_wenig_daten");
  assert.equal(kriterium(e, "90_prozent").nochNoetig, 1);
  assert.equal(e.gesamt, "zu_wenig_daten");
});

// --- 90-%-Kriterium -------------------------------------------------------

test("an 2 von 3 Tagen nie 90 % erreicht → auffällig", () => {
  const e = vorpruefung(
    magentaL,
    messwerte({
      "2026-07-01": [95], // erreicht 90
      "2026-07-02": [50], // nicht erreicht
      "2026-07-03": [40], // nicht erreicht
    })
  );
  assert.equal(kriterium(e, "90_prozent").stand, "auffaellig");
  assert.equal(e.kennzahlen.tageOhne90, 2);
});

test("nur 1 von 3 Tagen ohne 90 % → unauffällig", () => {
  const e = vorpruefung(
    magentaL,
    messwerte({ "2026-07-01": [95], "2026-07-02": [92], "2026-07-03": [40] })
  );
  assert.equal(kriterium(e, "90_prozent").stand, "unauffaellig");
  assert.equal(e.kennzahlen.tageOhne90, 1);
});

test("ein einziger guter Wert rettet den Tag — gefordert ist 'mindestens einmal'", () => {
  // Neun schlechte Messungen, eine gute: Der Tag zählt als erreicht. Wer hier
  // den Durchschnitt oder das Minimum nähme, würde das Gesetz verschärfen.
  const e = vorpruefung(
    magentaL,
    messwerte({
      "2026-07-01": [10, 10, 10, 10, 10, 10, 10, 10, 10, 95],
      "2026-07-02": [10],
      "2026-07-03": [10],
    })
  );
  assert.equal(e.kennzahlen.tageOhne90, 2);
  assert.equal(kriterium(e, "90_prozent").stand, "auffaellig");
});

test("die 90-%-Schwelle wird als Referenz genannt, nicht die Maximalrate", () => {
  const e = vorpruefung(magentaL, messwerte({ "2026-07-01": [50] }));
  assert.equal(kriterium(e, "90_prozent").referenzMbps, 90); // nicht 100
});

// --- Üblich-Kriterium -----------------------------------------------------

test("8 von 10 Messungen erreichen die normale Rate → auffällig (unter 90 %)", () => {
  const e = vorpruefung(
    magentaL,
    messwerte({ "2026-07-01": [90, 90, 90, 90, 90, 90, 90, 90, 50, 50] })
  );
  assert.equal(kriterium(e, "ueblich").stand, "auffaellig");
  assert.equal(e.kennzahlen.anteilNormal, 0.8);
});

test("9 von 10 Messungen → unauffällig (Grenze 90 % ist inklusiv)", () => {
  const e = vorpruefung(
    magentaL,
    messwerte({ "2026-07-01": [90, 90, 90, 90, 90, 90, 90, 90, 90, 50] })
  );
  assert.equal(kriterium(e, "ueblich").stand, "unauffaellig");
  assert.equal(e.kennzahlen.anteilNormal, 0.9);
});

test("9 schlechte Messungen bleiben unbeurteilt — erst ab 10 wird geurteilt", () => {
  const e = vorpruefung(
    magentaL,
    messwerte({ "2026-07-01": [3, 3, 3, 3, 3, 3, 3, 3, 3] })
  );
  assert.equal(kriterium(e, "ueblich").stand, "zu_wenig_daten");
  assert.equal(kriterium(e, "ueblich").nochNoetig, 1);
});

// --- Minimal-Kriterium ----------------------------------------------------

test("an 2 von 3 Tagen unter der Mindestrate → auffällig", () => {
  const e = vorpruefung(
    magentaL,
    messwerte({
      "2026-07-01": [60], // über 54
      "2026-07-02": [50], // darunter
      "2026-07-03": [30], // darunter
    })
  );
  assert.equal(kriterium(e, "minimum").stand, "auffaellig");
  assert.equal(e.kennzahlen.tageUnterMin, 2);
});

test("eine einzige Unterschreitung am Tag genügt für diesen Tag", () => {
  const e = vorpruefung(
    magentaL,
    messwerte({
      "2026-07-01": [95, 95, 30], // ein Ausrutscher zählt
      "2026-07-02": [95, 95, 30],
      "2026-07-03": [95],
    })
  );
  assert.equal(e.kennzahlen.tageUnterMin, 2);
  assert.equal(kriterium(e, "minimum").stand, "auffaellig");
});

// --- Gesamtstand ----------------------------------------------------------

test("ein auffälliges Kriterium genügt für den Gesamtstand ('oder' im Gesetz)", () => {
  // 90 % werden jeden Tag erreicht, das Minimum nie unterschritten — nur das
  // Üblich-Kriterium fällt durch. Das reicht.
  const e = vorpruefung(
    magentaL,
    messwerte({
      "2026-07-01": [95, 95, 95, 60],
      "2026-07-02": [95, 95, 95, 60],
      "2026-07-03": [95, 60],
    })
  );
  assert.equal(kriterium(e, "90_prozent").stand, "unauffaellig");
  assert.equal(kriterium(e, "minimum").stand, "unauffaellig");
  assert.equal(kriterium(e, "ueblich").stand, "auffaellig");
  assert.equal(e.gesamt, "auffaellig");
});

test("alles im Rahmen → unauffällig", () => {
  const gut = [95, 95, 95, 95];
  const e = vorpruefung(
    magentaL,
    messwerte({ "2026-07-01": gut, "2026-07-02": gut, "2026-07-03": [95, 95] })
  );
  assert.equal(e.gesamt, "unauffaellig");
});

// --- Fehlende Referenzwerte: ohne Beleg kein Vorwurf ----------------------

test("ohne normal- und Minimum-Wert im Blatt wird darüber nicht geurteilt", () => {
  const tarif = { download_max_mbps: 100, download_normal_mbps: null, download_min_mbps: null };
  const schlecht = [3, 3, 3, 3];
  const e = vorpruefung(
    tarif,
    messwerte({ "2026-07-01": schlecht, "2026-07-02": schlecht, "2026-07-03": schlecht })
  );
  assert.equal(kriterium(e, "ueblich").stand, "kein_referenzwert");
  assert.equal(kriterium(e, "minimum").stand, "kein_referenzwert");
  assert.equal(kriterium(e, "ueblich").referenzMbps, null);
  // Das 90-%-Kriterium beruht allein auf der Maximalrate und greift weiterhin.
  assert.equal(kriterium(e, "90_prozent").stand, "auffaellig");
  assert.equal(e.gesamt, "auffaellig");
});

test("nur fehlende Referenzwerte → kein_referenzwert, nicht 'unauffaellig'", () => {
  // Konstruiert: Ein Tarif ohne jeden brauchbaren Referenzwert darf kein
  // beruhigendes Urteil erzeugen. (max ist Pflichtfeld, deshalb 0 — damit
  // erreicht jede Messung die Schwelle und das Kriterium ist unauffällig.)
  const tarif = { download_max_mbps: 0, download_normal_mbps: null, download_min_mbps: null };
  const e = vorpruefung(tarif, messwerte({ "2026-07-01": [50] }));
  assert.equal(kriterium(e, "ueblich").stand, "kein_referenzwert");
  assert.equal(kriterium(e, "minimum").stand, "kein_referenzwert");
});

// --- Keine Messungen ------------------------------------------------------

test("leere Messreihe stürzt nicht ab und urteilt nicht", () => {
  const e = vorpruefung(magentaL, []);
  assert.equal(e.gesamt, "zu_wenig_daten");
  assert.equal(e.kennzahlen.messungen, 0);
  assert.equal(e.kennzahlen.messtage, 0);
  assert.equal(e.kennzahlen.anteilNormal, null);
});

// --- Rundung: Kriterien und Urteil dürfen sich nicht widersprechen --------

test("49,96 gilt für Kriterium UND Urteil als die angezeigten 50", () => {
  // Beide Seiten müssen dieselbe Rundung benutzen. Sonst stünde auf dem Schirm
  // "bei dir kommen 50,0 an" neben "Mindestrate 50 unterschritten".
  const tarif = { download_max_mbps: 100, download_normal_mbps: 80, download_min_mbps: 50 };
  const e = vorpruefung(
    tarif,
    messwerte({ "2026-07-01": [49.96], "2026-07-02": [49.96], "2026-07-03": [49.96] })
  );
  assert.equal(e.kennzahlen.tageUnterMin, 0, "49,96 zeigt 50,0 — keine Unterschreitung");
  assert.equal(kriterium(e, "minimum").stand, "unauffaellig");
  assert.notEqual(tarifUrteil(tarif, 49.96), "unter_min"); // dieselbe Aussage
});

test("49,9 bleibt sichtbar unter 50 — beide Seiten sehen die Unterschreitung", () => {
  const tarif = { download_max_mbps: 100, download_normal_mbps: 80, download_min_mbps: 50 };
  const e = vorpruefung(
    tarif,
    messwerte({ "2026-07-01": [49.9], "2026-07-02": [49.9], "2026-07-03": [95] })
  );
  assert.equal(e.kennzahlen.tageUnterMin, 2);
  assert.equal(kriterium(e, "minimum").stand, "auffaellig");
  assert.equal(tarifUrteil(tarif, 49.9), "unter_min"); // dieselbe Aussage
});
