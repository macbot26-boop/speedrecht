import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  FENSTER_TAGE,
  MINDEST_ABSTAND_MS,
  urteilsFenster,
} from "./fenster.ts";
import {
  MAX_EINTRAEGE,
  SPEICHER_SCHLUESSEL,
  lokalerTag,
  neueKennung,
  verlaufEintragen,
  verlaufLesen,
} from "./speicher.ts";
import { MINDEST_MESSTAGE, vorpruefung } from "../tarife/kriterien.ts";

const daten = JSON.parse(
  readFileSync(new URL("../tarife/tarife.generated.json", import.meta.url), "utf8")
);

/** Ein Tarif, der alle drei Raten führt — nur dann sind alle Kriterien beurteilbar. */
const TARIF = daten.tarife.find(
  (t) =>
    t.download_max_mbps !== null &&
    t.download_normal_mbps !== null &&
    t.download_min_mbps !== null
);

const MINUTE = 60 * 1000;

/** Baut eine Messung. Die Uhrzeit zählt in Minuten ab Mitternacht des Tages. */
function m(tag, minute, mbps, { slug = TARIF.slug, id } = {}) {
  return {
    id: id ?? `${tag}-${minute}`,
    mbps,
    tag,
    zeit: Date.parse(`${tag}T00:00:00Z`) + minute * MINUTE,
    tarifSlug: slug,
    verbindung: "lan",
  };
}

/** Eine Ablage im Arbeitsspeicher — dieselbe Form wie die des Browsers. */
function fakeAblage(start = {}) {
  const inhalt = { ...start };
  return {
    getItem: (k) => (k in inhalt ? inhalt[k] : null),
    setItem: (k, v) => {
      inhalt[k] = v;
    },
    _inhalt: inhalt,
  };
}

// ---------------------------------------------------------------------------
// Das Fenster: welche Messungen ins Urteil gehen
// ---------------------------------------------------------------------------

test("ohne Verlauf kommt ein leeres Fenster, kein Fehler", () => {
  const f = urteilsFenster([], TARIF.slug);
  assert.deepEqual(f.werte, []);
  assert.equal(f.messtage, 0);
  assert.equal(f.zuDicht, 0);
});

test("nur Messungen zum gewählten Tarif zählen", () => {
  // Ein anderer Vertrag heißt ein anderes Produktinformationsblatt — die
  // fremde Messung gegen unsere Messlatte zu halten, wäre schlicht falsch.
  const f = urteilsFenster(
    [m("2026-07-27", 10, 40), m("2026-07-27", 20, 90, { slug: "ein-anderer-tarif" })],
    TARIF.slug
  );
  assert.equal(f.werte.length, 1);
  assert.equal(f.werte[0].mbps, 40);
});

test("Messungen unter 5 Minuten Abstand zählen nur einmal", () => {
  // Zehnmal in zehn Minuten beschreibt eine Viertelstunde, keine Leitung.
  const f = urteilsFenster(
    [m("2026-07-27", 0, 40), m("2026-07-27", 2, 41), m("2026-07-27", 4, 42)],
    TARIF.slug
  );
  assert.equal(f.werte.length, 1);
  assert.equal(f.zuDicht, 2);
});

test("genau 5 Minuten Abstand genügen", () => {
  const f = urteilsFenster([m("2026-07-27", 0, 40), m("2026-07-27", 5, 41)], TARIF.slug);
  assert.equal(f.werte.length, 2);
  assert.equal(f.zuDicht, 0);
  assert.equal(MINDEST_ABSTAND_MS, 5 * MINUTE);
});

test("behalten wird die frühere Messung, nicht die spätere", () => {
  // Sonst verdrängte eine gerade abgeschlossene Messung eine ältere, längst
  // gezählte — der Zähler liefe rückwärts, während der Nutzer zusieht.
  const f = urteilsFenster([m("2026-07-27", 0, 40), m("2026-07-27", 1, 99)], TARIF.slug);
  assert.equal(f.werte[0].mbps, 40);
});

test("beurteilt werden nur die letzten 3 Messtage", () => {
  // Über alle jemals gespeicherten Messungen wären 2 schlechte Tage von 40
  // "auffällig" — ein Daueralarm statt eines Urteils.
  const f = urteilsFenster(
    ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"].map((t) =>
      m(t, 10, 40)
    ),
    TARIF.slug
  );
  assert.equal(f.messtage, MINDEST_MESSTAGE);
  assert.deepEqual(
    f.werte.map((w) => w.tag),
    ["2026-07-22", "2026-07-23", "2026-07-24"]
  );
  assert.equal(f.ausserhalb, 2);
});

test("Januar und März werden nicht zu drei Messtagen verschmolzen", () => {
  // Ohne die 14-Tage-Klammer vermischte das Urteil zehn Wochen.
  const f = urteilsFenster(
    [m("2026-01-01", 10, 40), m("2026-01-02", 10, 40), m("2026-03-15", 10, 40)],
    TARIF.slug
  );
  assert.equal(f.messtage, 1);
  assert.deepEqual(
    f.werte.map((w) => w.tag),
    ["2026-03-15"]
  );
  assert.equal(f.ausserhalb, 2);
});

test("die 14-Tage-Spanne schließt den 14. Tag ein und den 15. aus", () => {
  const gerade = urteilsFenster(
    [m("2026-07-15", 10, 40), m("2026-07-28", 10, 40)],
    TARIF.slug
  );
  assert.equal(gerade.messtage, 2, "13 Tage Abstand liegen noch im Fenster");

  const knappDraussen = urteilsFenster(
    [m("2026-07-14", 10, 40), m("2026-07-28", 10, 40)],
    TARIF.slug
  );
  assert.equal(knappDraussen.messtage, 1, "14 Tage Abstand fallen heraus");
  assert.equal(FENSTER_TAGE, 14);
});

test("gleiche Zeitstempel ergeben immer dieselbe Reihenfolge", () => {
  // Sonst hinge das Urteil an der Reihenfolge im Speicher.
  const a = m("2026-07-27", 10, 40, { id: "aaa" });
  const b = m("2026-07-27", 10, 50, { id: "bbb" });
  assert.deepEqual(
    urteilsFenster([a, b], TARIF.slug).werte,
    urteilsFenster([b, a], TARIF.slug).werte
  );
});

// ---------------------------------------------------------------------------
// Der Sprung, um den es in dieser Phase geht
// ---------------------------------------------------------------------------

test("aus „zu wenig Daten“ wird nach 3 Messtagen ein echtes Urteil", () => {
  const min = TARIF.download_min_mbps;
  const schlecht = Math.max(0, min - 10);

  // Eine einzelne Messung — so sah es vor dieser Phase IMMER aus.
  const eine = urteilsFenster([m("2026-07-26", 10, schlecht)], TARIF.slug);
  assert.equal(vorpruefung(TARIF, eine.werte).gesamt, "zu_wenig_daten");

  // Dieselbe schlechte Leitung, jetzt an drei Messtagen belegt.
  const drei = urteilsFenster(
    [
      m("2026-07-26", 10, schlecht),
      m("2026-07-27", 10, schlecht),
      m("2026-07-28", 10, schlecht),
    ],
    TARIF.slug
  );
  const urteil = vorpruefung(TARIF, drei.werte);
  assert.equal(urteil.gesamt, "auffaellig");
  assert.equal(urteil.kennzahlen.messtage, 3);
  assert.equal(urteil.kennzahlen.tageUnterMin, 3);

  // Und die Gegenprobe: eine gute Leitung an drei Tagen bleibt unauffällig.
  const gut = urteilsFenster(
    ["2026-07-26", "2026-07-27", "2026-07-28"].map((t) =>
      m(t, 10, TARIF.download_max_mbps)
    ),
    TARIF.slug
  );
  assert.equal(vorpruefung(TARIF, gut.werte).gesamt, "unauffaellig");
});

// ---------------------------------------------------------------------------
// Der Speicher — er darf nie ein Urteil verhindern
// ---------------------------------------------------------------------------

test("was geschrieben wurde, kommt zurück", () => {
  const ablage = fakeAblage();
  const eintrag = m("2026-07-27", 10, 42);
  assert.deepEqual(verlaufEintragen(eintrag, ablage), [eintrag]);
  assert.deepEqual(verlaufLesen(ablage), [eintrag]);
});

test("dieselbe Kennung überschreibt, statt doppelt zu zählen", () => {
  // Wer im Ergebnis den Tarif korrigiert, hat nicht neu gemessen.
  const ablage = fakeAblage();
  const erst = m("2026-07-27", 10, 42, { id: "gleich" });
  verlaufEintragen(erst, ablage);
  const korrigiert = { ...erst, tarifSlug: "anderer-vertrag" };
  const nachher = verlaufEintragen(korrigiert, ablage);
  assert.equal(nachher.length, 1);
  assert.equal(nachher[0].tarifSlug, "anderer-vertrag");
});

test("ohne Ablage geht die gerade gemessene Zahl trotzdem ins Urteil", () => {
  // Privater Modus: nichts lässt sich speichern. Der Nutzer muss dasselbe
  // Ergebnis sehen wie bisher — nur seine Vorgeschichte fehlt.
  const eintrag = m("2026-07-27", 10, 42);
  assert.deepEqual(verlaufLesen(null), []);
  assert.deepEqual(verlaufEintragen(eintrag, null), [eintrag]);
});

test("ein blockiertes Schreiben liefert trotzdem die vollständige Liste", () => {
  const gesperrt = {
    getItem: () => JSON.stringify([m("2026-07-26", 10, 40)]),
    setItem: () => {
      throw new Error("QuotaExceeded");
    },
  };
  const neu = m("2026-07-27", 10, 42);
  const liste = verlaufEintragen(neu, gesperrt);
  assert.equal(liste.length, 2, "die alte Messung UND die neue stehen im Urteil");
});

test("ein blockiertes Lesen legt die App nicht lahm", () => {
  const gesperrt = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {},
  };
  assert.deepEqual(verlaufLesen(gesperrt), []);
});

test("beschädigte Daten werden übersprungen, nicht weitergereicht", () => {
  const gesund = m("2026-07-27", 10, 42);
  const ablage = fakeAblage({
    [SPEICHER_SCHLUESSEL]: JSON.stringify([
      gesund,
      null,
      "kein Objekt",
      { ...gesund, id: "", },
      { ...gesund, id: "b", tag: "27.07.2026" },
      { ...gesund, id: "c", mbps: "vierzig" },
      { ...gesund, id: "d", zeit: 0 },
      { ...gesund, id: "e", tarifSlug: 5 },
    ]),
  });
  assert.deepEqual(verlaufLesen(ablage), [gesund], "ein kaputter Eintrag nimmt keine gesunden mit");
});

test("unbekannte Verbindungsart wird zu „unknown“, nicht zum Fehler", () => {
  const ablage = fakeAblage({
    [SPEICHER_SCHLUESSEL]: JSON.stringify([{ ...m("2026-07-27", 10, 42), verbindung: "satellit" }]),
  });
  assert.equal(verlaufLesen(ablage)[0].verbindung, "unknown");
});

test("kaputter Inhalt und fremdes Format ergeben einen leeren Verlauf", () => {
  for (const inhalt of ["{kein json", JSON.stringify({ nicht: "eine Liste" }), ""]) {
    assert.deepEqual(verlaufLesen(fakeAblage({ [SPEICHER_SCHLUESSEL]: inhalt })), []);
  }
});

test("der Speicher wächst nicht unbegrenzt — die ältesten fallen weg", () => {
  const ablage = fakeAblage();
  // Einer mehr als erlaubt, alle mit eigener Zeit.
  for (let i = 0; i <= MAX_EINTRAEGE; i++) {
    verlaufEintragen(m("2026-07-27", i * 6, 40, { id: `nr-${i}` }), ablage);
  }
  const liste = verlaufLesen(ablage);
  assert.equal(liste.length, MAX_EINTRAEGE);
  assert.equal(liste[0].id, "nr-1", "die älteste Messung ist weg, nicht die neueste");
  assert.equal(liste[liste.length - 1].id, `nr-${MAX_EINTRAEGE}`);
});

// ---------------------------------------------------------------------------
// Kalendertag und Kennung
// ---------------------------------------------------------------------------

test("der Messtag ist der LOKALE Tag, nicht der UTC-Tag", () => {
  // Aus lokalen Bestandteilen gebaut: Eine Messung um 00:30 gehört zu dem Tag,
  // den der Nutzer auf seiner Uhr sieht. Über toISOString() gerechnet läge sie
  // östlich von Greenwich auf dem Vortag — der Messtag spränge nachts zurück.
  assert.equal(lokalerTag(new Date(2026, 6, 28, 0, 30)), "2026-07-28");
  assert.equal(lokalerTag(new Date(2026, 6, 28, 23, 59)), "2026-07-28");
  assert.equal(lokalerTag(new Date(2026, 0, 5, 12, 0)), "2026-01-05", "Monat und Tag zweistellig");
});

test("jede Messung bekommt eine eigene Kennung", () => {
  const kennungen = new Set(Array.from({ length: 200 }, neueKennung));
  assert.equal(kennungen.size, 200);
});
