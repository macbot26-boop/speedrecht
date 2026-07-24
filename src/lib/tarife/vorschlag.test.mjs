// Tests für den Tarif-Vorschlag — gegen die ECHTE generierte Tarif-Tabelle
// (Telekom-Kernsortiment) plus Mini-Daten für die Bewertungs-Regeln.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tarifVorschlaege } from "./vorschlag.ts";

const daten = JSON.parse(
  await readFile(new URL("./tarife.generated.json", import.meta.url), "utf8")
);

test("85 Mbit/s bei Telekom → 100er-Klasse zuerst (MagentaZuhause L)", () => {
  const v = tarifVorschlaege(daten, "Telekom", 85);
  assert.equal(v[0].tarif.download_max_mbps, 100);
  assert.equal(v[0].tarif.tarifname, "MagentaZuhause L");
  assert.ok(v.length <= 3);
});

test("230 Mbit/s → 250er-Klasse zuerst (XL)", () => {
  const v = tarifVorschlaege(daten, "Telekom", 230);
  assert.equal(v[0].tarif.download_max_mbps, 250);
});

test("12 Mbit/s → 16er-Klasse zuerst", () => {
  const v = tarifVorschlaege(daten, "Telekom", 12);
  assert.equal(v[0].tarif.download_max_mbps, 16);
});

test("900 Mbit/s → Glasfaser 1.000 zuerst", () => {
  const v = tarifVorschlaege(daten, "Telekom", 900);
  assert.equal(v[0].tarif.download_max_mbps, 1000);
  assert.match(v[0].tarif.tarifname, /Glasfaser/);
});

test("45 Mbit/s → 50er zuerst, keine Klasse doppelt", () => {
  const v = tarifVorschlaege(daten, "Telekom", 45);
  assert.equal(v[0].tarif.download_max_mbps, 50);
  const klassen = v.map((x) => x.tarif.download_max_mbps);
  assert.equal(new Set(klassen).size, klassen.length);
});

test("Unbekannter Anbieter oder Unsinnswerte → leer", () => {
  assert.deepEqual(tarifVorschlaege(daten, "Fantasienetz", 50), []);
  assert.deepEqual(tarifVorschlaege(daten, "Telekom", 0), []);
  assert.deepEqual(tarifVorschlaege(daten, "Telekom", -5), []);
  assert.deepEqual(tarifVorschlaege(daten, "Telekom", NaN), []);
});

test("Malus-Regel: Klasse ÜBER dem Messwert schlägt nahegelegene darunter", () => {
  const mini = {
    stand: "2026-01-01",
    quelle: "test",
    tarife: [
      { anbieter: "A", slug: "a-40", tarifname: "A 40", zugang: null, technologie: "vdsl", download_max_mbps: 40, download_normal_mbps: null, download_min_mbps: null, upload_max_mbps: 10, upload_normal_mbps: null, upload_min_mbps: null, monatspreis_eur: null, quelle_url: "x", versionsstand: null },
      { anbieter: "A", slug: "a-60", tarifname: "A 60", zugang: null, technologie: "vdsl", download_max_mbps: 60, download_normal_mbps: null, download_min_mbps: null, upload_max_mbps: 15, upload_normal_mbps: null, upload_min_mbps: null, monatspreis_eur: null, quelle_url: "x", versionsstand: null },
    ],
  };
  // 50 gemessen: 40 wäre linear gleich weit weg wie 60 — aber der eigene
  // Vertrag liegt praktisch nie UNTER dem Messwert → 60 gewinnt.
  const v = tarifVorschlaege(mini, "A", 50);
  assert.equal(v[0].tarif.download_max_mbps, 60);
});

test("Varianten werden gezählt, Repräsentant ist die Basis-Variante", () => {
  const v = tarifVorschlaege(daten, "Telekom", 85);
  assert.ok(v[0].varianten >= 2, "100er-Klasse hat mehrere Vertrags-Varianten");
  assert.ok(!/Flex|On-Net|All-Net/.test(v[0].tarif.tarifname));
});
