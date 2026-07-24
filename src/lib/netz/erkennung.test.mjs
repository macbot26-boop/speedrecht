// Tests für die Anbieter-Erkennung. Läuft mit dem eingebauten Node-Test-
// Runner (`npm test`), keine zusätzlichen Abhängigkeiten.
//
// Zwei Ebenen:
//   1. Mechanik — binäre Suche & IP-Parser mit erfundenen Mini-Daten.
//   2. Echte Tabelle — Struktur-Invarianten der generierten Datei plus
//      Stichproben mit weltweit bekannten, stabilen Adressen.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { erkennerAufbauen, ipParsen } from "./erkennung.ts";
import { BESTAETIGBARE_ANBIETER } from "./anbieter.ts";

// ---------------------------------------------------------------------------
// 1. IP-Parser
// ---------------------------------------------------------------------------

test("ipParsen: gültige IPv4", () => {
  assert.deepEqual(ipParsen("1.2.3.4"), { familie: "v4", wert: 0x01020304 });
  assert.deepEqual(ipParsen("0.0.0.0"), { familie: "v4", wert: 0 });
  assert.deepEqual(ipParsen("255.255.255.255"), { familie: "v4", wert: 0xffffffff });
});

test("ipParsen: v4-in-v6-Schreibweise wird als v4 behandelt", () => {
  assert.deepEqual(ipParsen("::ffff:8.8.8.8"), { familie: "v4", wert: 0x08080808 });
});

test("ipParsen: gültige IPv6", () => {
  assert.deepEqual(ipParsen("::1"), { familie: "v6", wert: 1n });
  assert.deepEqual(ipParsen("2001:db8::"), {
    familie: "v6",
    wert: 0x20010db8n << 96n,
  });
  assert.deepEqual(ipParsen("1:2:3:4:5:6:7:8"), {
    familie: "v6",
    wert:
      (1n << 112n) | (2n << 96n) | (3n << 80n) | (4n << 64n) |
      (5n << 48n) | (6n << 32n) | (7n << 16n) | 8n,
  });
});

test("ipParsen: Müll wird abgelehnt", () => {
  for (const kaputt of [
    "256.1.1.1", "1.2.3", "1.2.3.4.5", "hallo", "",
    "1::2::3", "1:2:3:4:5:6:7:8:9", "fe80::1%en0", "gggg::1", "1.2.3.4:443",
  ]) {
    assert.equal(ipParsen(kaputt), null, `sollte null sein: "${kaputt}"`);
  }
});

// ---------------------------------------------------------------------------
// 2. Binäre Suche mit Mini-Daten
// ---------------------------------------------------------------------------

const ip4 = (text) => ipParsen(text).wert;

const MINI = {
  stand: "2026-01-01",
  quelle: "test",
  traeger: [
    { asn: 1, holder: "A GmbH", anbieter: "AnbieterA", kategorie: "festnetz" },
    { asn: 2, holder: "B Inc", anbieter: "AnbieterB", kategorie: "hosting_vpn" },
  ],
  v4: [
    [ip4("10.0.0.0"), ip4("10.0.0.255"), 0],
    [ip4("10.0.1.0"), ip4("10.0.1.255"), 1],
    [ip4("192.168.0.0"), ip4("192.168.255.255"), 0],
  ],
  v6: [["20010db8000000000000000000000000", "20010db8ffffffffffffffffffffffff", 1]],
};

test("erkennen: Treffer an Grenzen und in der Mitte", () => {
  const { erkennen } = erkennerAufbauen(MINI);
  assert.equal(erkennen("10.0.0.0").anbieter, "AnbieterA"); // exakter Start
  assert.equal(erkennen("10.0.0.255").anbieter, "AnbieterA"); // exaktes Ende
  assert.equal(erkennen("10.0.0.128").anbieter, "AnbieterA"); // mittendrin
  assert.equal(erkennen("10.0.1.0").anbieter, "AnbieterB"); // Nachbar-Abschnitt
  assert.equal(erkennen("192.168.42.1").kategorie, "festnetz");
});

test("erkennen: daneben ist unbekannt", () => {
  const { erkennen } = erkennerAufbauen(MINI);
  for (const ip of ["9.255.255.255", "10.0.2.0", "11.0.0.0", "203.0.113.7"]) {
    assert.deepEqual(erkennen(ip), { anbieter: null, kategorie: "unbekannt", asn: null });
  }
  assert.equal(erkennen("nicht-mal-eine-ip").kategorie, "unbekannt");
});

test("erkennen: IPv6-Treffer über BigInt", () => {
  const { erkennen } = erkennerAufbauen(MINI);
  assert.equal(erkennen("2001:db8::1").anbieter, "AnbieterB");
  assert.equal(erkennen("2001:db9::1").kategorie, "unbekannt");
});

// ---------------------------------------------------------------------------
// 3. Echte generierte Tabelle
// ---------------------------------------------------------------------------

const echteDaten = JSON.parse(
  await readFile(new URL("./netzdaten.generated.json", import.meta.url), "utf8")
);

test("Tabelle: Abschnitte sind sortiert und überschneidungsfrei", () => {
  let vorherigesEnde = -1;
  for (const [start, ende] of echteDaten.v4) {
    assert.ok(start <= ende, "v4: start <= ende");
    assert.ok(start > vorherigesEnde, "v4: keine Überschneidung");
    vorherigesEnde = ende;
  }
  let vorherigesEndeV6 = -1n;
  for (const [start, ende] of echteDaten.v6) {
    const s = BigInt(`0x${start}`);
    const e = BigInt(`0x${ende}`);
    assert.ok(s <= e, "v6: start <= ende");
    assert.ok(s > vorherigesEndeV6, "v6: keine Überschneidung");
    vorherigesEndeV6 = e;
  }
});

test("Tabelle: alle Träger-Indizes gültig, beide Kategorien vertreten", () => {
  const n = echteDaten.traeger.length;
  for (const [, , idx] of [...echteDaten.v4, ...echteDaten.v6]) {
    assert.ok(Number.isInteger(idx) && idx >= 0 && idx < n);
  }
  const kategorien = new Set(echteDaten.traeger.map((t) => t.kategorie));
  assert.ok(kategorien.has("festnetz"));
  assert.ok(kategorien.has("hosting_vpn"));
});

test("Tabelle: jeder Festnetz-Anbietername ist auch bestätigbar", () => {
  // Der „Ja, mein Anbieter“-Tap schickt den ERKANNTEN Namen an den
  // Bestätigungs-Endpoint, der nur die kanonische Liste akzeptiert. Eine
  // Neu-Generierung darf diese Kopplung nie stillschweigend brechen.
  for (const t of echteDaten.traeger) {
    if (t.kategorie !== "festnetz") continue;
    assert.ok(
      BESTAETIGBARE_ANBIETER.has(t.anbieter),
      `"${t.anbieter}" (AS${t.asn}) fehlt in BESTAETIGBARE_ANBIETER`
    );
  }
});

test("Tabelle: Mobilfunk und Hosting/VPN sind vertreten", () => {
  const kategorien = new Set(echteDaten.traeger.map((t) => t.kategorie));
  assert.ok(kategorien.has("mobilfunk"), "mobilfunk fehlt — Kuratierung prüfen");
  assert.ok(kategorien.has("hosting_vpn"));
});

test("Tabelle: weltbekannte Adressen werden richtig eingeordnet", () => {
  const { erkennen } = erkennerAufbauen(echteDaten);
  assert.equal(erkennen("8.8.8.8").anbieter, "Google");
  assert.equal(erkennen("8.8.8.8").kategorie, "hosting_vpn");
  assert.equal(erkennen("1.1.1.1").anbieter, "Cloudflare");
  assert.equal(erkennen("2606:4700:4700::1111").anbieter, "Cloudflare"); // dito, v6
});

test("Tabelle: gekaufte Bereiche aus fremden Weltregionen bleiben erhalten", () => {
  // Diese Bereiche sehen auf den ersten Blick falsch aus — 9.0.0.0/8 ist
  // IBM-Altbestand, 14.0.0.0/8 asiatisch —, gehören aber wirklich 1&1: die
  // Blöcke wurden gekauft und ins RIPE-Register übertragen (Netznamen
  // "Dusseldorf_1" bzw. "OneAndOne-Network-AS8881", Land DE) und versorgen
  // deutsche Kunden.
  //
  // Der Test hält fest, dass die Aufnahmeregel am Register hängt und NICHT
  // daran, ob ein Bereich "deutsch aussieht". Ein Filter nach Ländercode
  // oder erstem Oktett würde hier echte Kundenbereiche wegwerfen und die
  // Tarifzuordnung für diese Kunden unmöglich machen.
  const { erkennen } = erkennerAufbauen(echteDaten);
  for (const ip of ["9.151.48.1", "9.232.32.1", "9.249.32.1", "14.102.90.1"]) {
    assert.equal(erkennen(ip).anbieter, "1&1", `${ip} sollte 1&1 sein`);
  }
});

test("Tabelle: fremd registrierte Transit-Bereiche zählen nicht als Anschluss", () => {
  // Deutsche Anbieter kündigen auch Adressen von Geschäftskunden an, die sie
  // nur transportieren — eingetragen in fremden Weltregistern (US-Rechen-
  // zentren, Ghana). Wer von dort misst, hat keinen deutschen Anschluss
  // dieses Anbieters und darf dessen Tarifliste nicht vorgeschlagen bekommen.
  //
  // Schlägt dieser Test fehl, wurde entweder die Registerprüfung im Sammel-
  // Skript entfernt — oder der Bereich ist inzwischen wirklich ins
  // RIPE-Register übertragen worden. Dann im Register nachschlagen und die
  // Adresse hier ersetzen, statt die Prüfung aufzuweichen.
  const { erkennen } = erkennerAufbauen(echteDaten);
  for (const ip of [
    "23.27.65.1", // Ace Data Centers II, L.L.C. (US) — angekündigt von AS8881
    "208.9.32.1", // ARIN-Block — angekündigt von AS8881
    "196.44.120.1", // Ecoband, Ghana — angekündigt von AS3320
    "199.161.32.1", // ARIN-Block — angekündigt von AS3320
    "161.195.141.1", // ARIN-Block — angekündigt von AS3209
    "128.224.248.1", // ARIN-Block — angekündigt von AS8767
  ]) {
    assert.notEqual(
      erkennen(ip).kategorie,
      "festnetz",
      `${ip} ist fremd registriert und darf kein Festnetz-Anschluss sein`
    );
  }
});

test("Tabelle: Hosting/VPN wird weiterhin weltweit erkannt", () => {
  // Die Registerprüfung gilt bewusst NUR für Zugangsnetze. Rechenzentren und
  // VPN-Austritte müssen überall auf der Welt erkannt werden — sonst fällt
  // der ehrliche "Du misst über einen VPN"-Hinweis aus.
  const { erkennen } = erkennerAufbauen(echteDaten);
  for (const [ip, anbieter] of [
    ["13.32.0.1", "Amazon"], // US-Adressraum
    ["104.16.0.1", "Cloudflare"], // US-Adressraum
  ]) {
    assert.equal(erkennen(ip).anbieter, anbieter);
    assert.equal(erkennen(ip).kategorie, "hosting_vpn");
  }
});

test("Tabelle: Aufnahmeregel ist in den Daten dokumentiert", () => {
  // Die Regel steht in der generierten Datei, damit nachvollziehbar bleibt,
  // wie die Bereiche zustande kamen.
  assert.ok(
    typeof echteDaten.regel === "string" && echteDaten.regel.length > 0,
    "Feld 'regel' fehlt — mit scripts/netz-daten-sammeln.mjs neu erzeugen"
  );
});

test("Tabelle: Selbstkonsistenz — Startadresse eines Telekom-Abschnitts → Telekom", () => {
  const { erkennen } = erkennerAufbauen(echteDaten);
  const telekomIdx = echteDaten.traeger.findIndex((t) => t.anbieter === "Telekom");
  assert.ok(telekomIdx >= 0);
  const abschnitt = echteDaten.v4.find(([, , idx]) => idx === telekomIdx);
  assert.ok(abschnitt, "Telekom hat mindestens einen v4-Abschnitt");
  const start = abschnitt[0];
  const ip = [start >>> 24, (start >> 16) & 255, (start >> 8) & 255, start & 255].join(".");
  assert.equal(erkennen(ip).anbieter, "Telekom");
});
