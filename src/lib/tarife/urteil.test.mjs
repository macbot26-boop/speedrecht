// Tests für das Tarif-Urteil — gegen die ECHTE generierte Tarif-Tabelle
// (MagentaZuhause L: bis zu 100, normalerweise 83,8, mindestens 54) plus
// Mini-Tarife für die Grenz- und Fehlfälle.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tarifUrteil } from "./urteil.ts";

const daten = JSON.parse(
  await readFile(new URL("./tarife.generated.json", import.meta.url), "utf8")
);

// Referenz-Tarif mit allen drei Werten belegt.
const magentaL = daten.tarife.find((t) => t.tarifname === "MagentaZuhause L");
assert.ok(magentaL, "MagentaZuhause L muss in den Tarifdaten existieren");
assert.equal(magentaL.download_max_mbps, 100);
assert.equal(magentaL.download_normal_mbps, 83.8);
assert.equal(magentaL.download_min_mbps, 54);

test("Messung über 'normalerweise' → gut", () => {
  assert.equal(tarifUrteil(magentaL, 90), "gut");
});

test("Messung genau auf 'normalerweise' → gut (Grenze inklusiv)", () => {
  assert.equal(tarifUrteil(magentaL, 83.8), "gut");
});

test("Messung unter 'normalerweise', aber über Minimum → unter_norm", () => {
  assert.equal(tarifUrteil(magentaL, 56), "unter_norm");
});

test("Messung genau auf Minimum → unter_norm (Grenze inklusiv)", () => {
  assert.equal(tarifUrteil(magentaL, 54), "unter_norm");
});

test("Messung unter dem Minimum → unter_min", () => {
  assert.equal(tarifUrteil(magentaL, 40), "unter_min");
});

test("knapp unter Minimum → unter_min", () => {
  assert.equal(tarifUrteil(magentaL, 53.9), "unter_min");
});

// --- Rundung: Urteil und angezeigte Zahl dürfen nicht widersprechen ---

test("83,75 wird als 83,8 angezeigt → gut (kein Widerspruch zur normal-Zahl)", () => {
  assert.equal(tarifUrteil(magentaL, 83.75), "gut");
});

test("83,7 bleibt sichtbar unter 83,8 → unter_norm", () => {
  assert.equal(tarifUrteil(magentaL, 83.7), "unter_norm");
});

test("≥100er runden ganzzahlig: 849,6 vs. normal 850 → gut, 849,4 → unter_norm", () => {
  const tarif = {
    download_max_mbps: 1000,
    download_normal_mbps: 850,
    download_min_mbps: 700,
  };
  assert.equal(tarifUrteil(tarif, 849.6), "gut"); // beide zeigen 850
  assert.equal(tarifUrteil(tarif, 849.4), "unter_norm"); // zeigt 849 < 850
});

// --- Fehlende Referenzwerte: ohne Beleg kein Vorwurf ---

test("ohne normal- und Minimum-Wert → gut (kein Mangel behauptet)", () => {
  const tarif = {
    download_max_mbps: 100,
    download_normal_mbps: null,
    download_min_mbps: null,
  };
  assert.equal(tarifUrteil(tarif, 10), "gut");
});

test("nur Minimum vorhanden, darunter → unter_min", () => {
  const tarif = {
    download_max_mbps: 100,
    download_normal_mbps: null,
    download_min_mbps: 50,
  };
  assert.equal(tarifUrteil(tarif, 40), "unter_min");
  assert.equal(tarifUrteil(tarif, 60), "gut"); // über Min, kein normal-Wert
});

test("nur normal vorhanden, darunter → unter_norm", () => {
  const tarif = {
    download_max_mbps: 100,
    download_normal_mbps: 80,
    download_min_mbps: null,
  };
  assert.equal(tarifUrteil(tarif, 60), "unter_norm");
});
