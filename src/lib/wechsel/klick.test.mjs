// Tests für die Angaben einer Klick-Zeile.
//
// Die Leitregel steht hier im Mittelpunkt: Unbrauchbares wird zu `null`, aber
// NIE zum Abbruch. Ein Klick auf das Wechsel-Angebot ist ein Nutzer auf dem
// Weg zum Partner — der Weg muss durchgehen.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { klickAngabenLesen } from "./klick.ts";

const daten = JSON.parse(
  await readFile(new URL("../tarife/tarife.generated.json", import.meta.url), "utf8")
);

const lies = (query) => klickAngabenLesen(new URLSearchParams(query));

test("vollständige Angaben werden übernommen", () => {
  const angaben = lies({
    anbieter: "Telekom",
    tarif: "bb-dsl-16-mvl-20240201",
    urteil: "unter_min",
    mbps: "48.37",
    messung: "3f2b1c9a-0000-4000-8000-abcdefabcdef",
  });
  assert.deepEqual(angaben, {
    anbieter: "Telekom",
    tarifSlug: "bb-dsl-16-mvl-20240201",
    urteil: "unter_min",
    downloadMbps: 48.37,
    messungId: "3f2b1c9a-0000-4000-8000-abcdefabcdef",
  });
});

test("ohne jede Angabe bleibt alles leer — der Klick geht trotzdem durch", () => {
  assert.deepEqual(lies({}), {
    anbieter: null,
    tarifSlug: null,
    urteil: null,
    downloadMbps: null,
    messungId: null,
  });
});

test("eine fehlende Messung wird nicht zu 0 Mbit/s", () => {
  // Der teuerste Fehler dieser Datei: Number(null) und Number("") sind beide
  // 0. Eine Null hieße in der Auswertung "die Leitung liefert nichts" — aus
  // einer fehlenden Angabe würde eine Behauptung.
  assert.equal(lies({}).downloadMbps, null);
  assert.equal(lies({ mbps: "" }).downloadMbps, null);
  assert.equal(lies({ mbps: "  " }).downloadMbps, null);
  assert.equal(lies({ mbps: "keine" }).downloadMbps, null);
  // Eine echte 0 bleibt dagegen eine 0.
  assert.equal(lies({ mbps: "0" }).downloadMbps, 0);
});

test("unmögliche Messwerte werden verworfen", () => {
  assert.equal(lies({ mbps: "-1" }).downloadMbps, null);
  assert.equal(lies({ mbps: "100001" }).downloadMbps, null);
  assert.equal(lies({ mbps: "Infinity" }).downloadMbps, null);
});

test("nur Anbieter aus der kanonischen Liste", () => {
  // Sonst stünden "Telekom", "telekom" und "Deutsche Telekom" nebeneinander
  // in der Auswertung, und die Trichter-Rechnung wäre wertlos.
  assert.equal(lies({ anbieter: "1&1" }).anbieter, "1&1");
  assert.equal(lies({ anbieter: "PŸUR" }).anbieter, "PŸUR");
  assert.equal(lies({ anbieter: "Sonstiger" }).anbieter, "Sonstiger");
  assert.equal(lies({ anbieter: "telekom" }).anbieter, null);
  assert.equal(lies({ anbieter: "Deutsche Telekom" }).anbieter, null);
  assert.equal(lies({ anbieter: "<script>" }).anbieter, null);
});

test("nur die drei bekannten Urteile", () => {
  for (const ton of ["gut", "unter_norm", "unter_min"]) {
    assert.equal(lies({ urteil: ton }).urteil, ton);
  }
  assert.equal(lies({ urteil: "schlecht" }).urteil, null);
  assert.equal(lies({ urteil: "Anspruch" }).urteil, null);
});

test("nur Slugs in unserer eigenen Schreibweise", () => {
  assert.equal(lies({ tarif: "BB-DSL-16" }).tarifSlug, null, "Großbuchstaben sind nicht unsere");
  assert.equal(lies({ tarif: "bb dsl 16" }).tarifSlug, null);
  assert.equal(lies({ tarif: "a".repeat(161) }).tarifSlug, null);
  assert.equal(lies({ tarif: "" }).tarifSlug, null);
});

test("jeder echte Slug der Tarif-Datenbank wird angenommen", () => {
  // Die Regel wurde an den erzeugten Daten gemessen (längster Slug: 72
  // Zeichen). Ändert das Sammel-Skript die Schreibweise, schlägt das hier auf.
  for (const tarif of daten.tarife) {
    assert.equal(
      lies({ tarif: tarif.slug }).tarifSlug,
      tarif.slug,
      `Slug abgewiesen: ${tarif.slug}`
    );
  }
});

test("nur eine echte Messungs-Nummer", () => {
  assert.equal(lies({ messung: "abc" }).messungId, null);
  assert.equal(lies({ messung: "3f2b1c9a-0000-4000-8000-abcdefabcdeff" }).messungId, null);
  assert.equal(
    lies({ messung: "3F2B1C9A-0000-4000-8000-ABCDEFABCDEF" }).messungId,
    "3F2B1C9A-0000-4000-8000-ABCDEFABCDEF",
    "Großschreibung ist bei UUIDs erlaubt"
  );
});
