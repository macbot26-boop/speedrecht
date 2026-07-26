// Tests für das Angebots-Regal — gegen Mini-Daten für die Regeln und gegen
// die ECHTE generierte Tarif-Tabelle für das, was nur echte Daten zeigen
// (Entdopplung regionaler Varianten, Abdeckung, Deutsche Glasfaser).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { angebote, aktuellAb, AKTUELL_MONATE, MAX_ANGEBOTE } from "./angebote.ts";

const echt = JSON.parse(
  await readFile(new URL("./tarife.generated.json", import.meta.url), "utf8")
);

// Ein Tarif mit allen Pflichtfeldern; überschrieben wird nur, worum es geht.
function tarif(felder) {
  return {
    anbieter: "A",
    slug: felder.slug ?? `${felder.tarifname ?? "t"}-${felder.monatspreis_eur ?? 0}`,
    tarifname: "Tarif",
    zugang: null,
    technologie: "dsl",
    download_max_mbps: 100,
    download_normal_mbps: 50,
    download_min_mbps: 20,
    upload_max_mbps: 40,
    upload_normal_mbps: 20,
    upload_min_mbps: 10,
    monatspreis_eur: 40,
    quelle_url: "https://example.invalid/blatt.pdf",
    versionsstand: "2026-01-01",
    ...felder,
  };
}

const daten = (tarife) => ({ stand: "2026-07-24", quelle: "Test", tarife });

// Der Vertrag des Nutzers: Anbieter "A", normalerweise 50.
const eigener = tarif({ anbieter: "A", tarifname: "Mein Vertrag", monatspreis_eur: 45 });

test("aktuellAb rechnet die Monate vom Sammelstand zurück", () => {
  assert.equal(AKTUELL_MONATE, 18);
  assert.equal(aktuellAb("2026-07-24"), "2025-01-24");
  assert.equal(aktuellAb("2026-01-15"), "2024-07-15");
  // Jahreswechsel über die Monatsgrenze hinweg.
  assert.equal(aktuellAb("2025-06-30"), "2023-12-30");
});

test("der eigene Anbieter steht nie im Regal", () => {
  const regal = angebote(
    daten([
      eigener,
      tarif({ anbieter: "A", tarifname: "Auch A, billiger", monatspreis_eur: 20 }),
      tarif({ anbieter: "B", tarifname: "B 50", monatspreis_eur: 30 }),
    ]),
    eigener
  );
  assert.deepEqual(
    regal.map((t) => t.anbieter),
    ["B"]
  );
});

test("nur Verträge, die mindestens die eigene normalerweise-Rate zusagen", () => {
  const regal = angebote(
    daten([
      tarif({ anbieter: "B", tarifname: "zu langsam", download_normal_mbps: 49, monatspreis_eur: 10 }),
      tarif({ anbieter: "C", tarifname: "genau gleich", download_normal_mbps: 50, monatspreis_eur: 30 }),
      tarif({ anbieter: "D", tarifname: "schneller", download_normal_mbps: 200, monatspreis_eur: 35 }),
    ]),
    eigener
  );
  assert.deepEqual(
    regal.map((t) => t.tarifname),
    ["genau gleich", "schneller"]
  );
});

test("die Rate wird auf Anzeige-Genauigkeit verglichen, nicht auf Rohwerte", () => {
  // 49,96 steht auf dem Schirm als "50.0" — es wäre für den Nutzer nicht
  // nachvollziehbar, wenn dieser Tarif als "zu langsam" herausfiele.
  const regal = angebote(
    daten([tarif({ anbieter: "B", tarifname: "49,96", download_normal_mbps: 49.96 })]),
    eigener
  );
  assert.deepEqual(
    regal.map((t) => t.tarifname),
    ["49,96"]
  );
});

test("Blätter außerhalb des Aktualitäts-Fensters fallen heraus", () => {
  const regal = angebote(
    daten([
      tarif({ anbieter: "B", tarifname: "altes Blatt", versionsstand: "2025-01-23", monatspreis_eur: 5 }),
      tarif({ anbieter: "C", tarifname: "gerade noch", versionsstand: "2025-01-24", monatspreis_eur: 30 }),
      tarif({ anbieter: "D", tarifname: "ohne Datum", versionsstand: null, monatspreis_eur: 5 }),
    ]),
    eigener
  );
  assert.deepEqual(
    regal.map((t) => t.tarifname),
    ["gerade noch"]
  );
});

test("ohne Preis kein Angebot", () => {
  const regal = angebote(
    daten([
      tarif({ anbieter: "B", tarifname: "preislos", monatspreis_eur: null }),
      tarif({ anbieter: "C", tarifname: "mit Preis", monatspreis_eur: 30 }),
    ]),
    eigener
  );
  assert.deepEqual(
    regal.map((t) => t.tarifname),
    ["mit Preis"]
  );
});

test("ohne eigene normalerweise-Rate bleibt das Regal leer", () => {
  const ohneRate = tarif({ anbieter: "A", download_normal_mbps: null });
  const regal = angebote(
    daten([tarif({ anbieter: "B", tarifname: "B 50", monatspreis_eur: 30 })]),
    ohneRate
  );
  assert.deepEqual(regal, []);
});

test("günstigster zuerst, höchstens einer je Anbieter", () => {
  const regal = angebote(
    daten([
      tarif({ anbieter: "B", tarifname: "B teuer", monatspreis_eur: 39 }),
      tarif({ anbieter: "B", tarifname: "B billig", monatspreis_eur: 21 }),
      tarif({ anbieter: "C", tarifname: "C mittel", monatspreis_eur: 25 }),
      tarif({ anbieter: "D", tarifname: "D teuer", monatspreis_eur: 30 }),
    ]),
    eigener
  );
  assert.deepEqual(
    regal.map((t) => t.tarifname),
    ["B billig", "C mittel", "D teuer"]
  );
});

test("höchstens MAX_ANGEBOTE Einträge", () => {
  const viele = ["B", "C", "D", "E", "F"].map((anbieter, i) =>
    tarif({ anbieter, tarifname: `${anbieter} 50`, monatspreis_eur: 20 + i })
  );
  assert.equal(angebote(daten(viele), eigener).length, MAX_ANGEBOTE);
});

test("je Vertragsnamen gewinnt das vorsichtigste Blatt", () => {
  // Derselbe Name in zwei Regionalfassungen: 60 und 50. Die Messlatte des
  // Nutzers ist 50 — beide erfüllen sie. Gezeigt werden muss die 50er, sonst
  // verspräche das Regal eine Rate, die es an manchen Adressen nicht gibt.
  const regal = angebote(
    daten([
      tarif({ anbieter: "B", tarifname: "B 100", slug: "b-gut", download_normal_mbps: 60, monatspreis_eur: 30 }),
      tarif({ anbieter: "B", tarifname: "B 100", slug: "b-schwach", download_normal_mbps: 50, monatspreis_eur: 30 }),
    ]),
    eigener
  );
  assert.deepEqual(
    regal.map((t) => t.slug),
    ["b-schwach"]
  );
});

test("das vorsichtigste Blatt entscheidet auch über den Ausschluss", () => {
  // Beide Fassungen tragen denselben Namen, aber nur die bessere erfüllt die
  // Messlatte. Dann darf der Name GAR NICHT erscheinen — wer ihn bestellt,
  // bekommt womöglich die schwächere Fassung.
  const regal = angebote(
    daten([
      tarif({ anbieter: "B", tarifname: "B 100", slug: "b-gut", download_normal_mbps: 60, monatspreis_eur: 30 }),
      tarif({ anbieter: "B", tarifname: "B 100", slug: "b-schwach", download_normal_mbps: 40, monatspreis_eur: 30 }),
    ]),
    eigener
  );
  assert.deepEqual(regal, []);
});

test("ein Eintrag stammt aus genau EINEM Blatt", () => {
  // Rate, Preis und Quell-Verweis dürfen nicht aus verschiedenen Fassungen
  // zusammengesetzt werden — sonst stünde eine Kombination auf dem Schirm,
  // die in keinem Dokument steht.
  const regal = angebote(
    daten([
      tarif({ anbieter: "B", tarifname: "B 100", slug: "b-teuer-schwach", download_normal_mbps: 50, monatspreis_eur: 45, quelle_url: "https://example.invalid/schwach.pdf" }),
      tarif({ anbieter: "B", tarifname: "B 100", slug: "b-billig-stark", download_normal_mbps: 90, monatspreis_eur: 20, quelle_url: "https://example.invalid/stark.pdf" }),
    ]),
    eigener
  );
  assert.equal(regal.length, 1);
  assert.equal(regal[0].monatspreis_eur, 45);
  assert.equal(regal[0].quelle_url, "https://example.invalid/schwach.pdf");
});

test("gleiche Preise ergeben eine feste Reihenfolge", () => {
  const gleich = [
    tarif({ anbieter: "C", tarifname: "Zebra", monatspreis_eur: 30 }),
    tarif({ anbieter: "B", tarifname: "Anton", monatspreis_eur: 30 }),
  ];
  const vorwaerts = angebote(daten(gleich), eigener).map((t) => t.tarifname);
  const rueckwaerts = angebote(daten([...gleich].reverse()), eigener).map((t) => t.tarifname);
  assert.deepEqual(vorwaerts, ["Anton", "Zebra"]);
  assert.deepEqual(vorwaerts, rueckwaerts);
});

// ── Gegen die echten Tarifdaten ───────────────────────────────────────────

test("echte Daten: fast jeder Vertrag bekommt ein volles Regal", () => {
  let leer = 0;
  let voll = 0;
  for (const eigen of echt.tarife) {
    const regal = angebote(echt, eigen);
    if (regal.length === 0) leer++;
    if (regal.length === MAX_ANGEBOTE) voll++;
  }
  // Bricht laut, wenn ein Daten-Auffrischen den Vergleichskorb aushöhlt —
  // ein Regal, das plötzlich bei jedem Zweiten leer bliebe, wäre kein
  // Anzeigefehler, sondern ein stiller Verlust des ganzen Bausteins.
  assert.ok(voll / echt.tarife.length > 0.9, `nur ${voll} von ${echt.tarife.length} Verträgen mit vollem Regal`);
  assert.ok(leer / echt.tarife.length < 0.05, `${leer} Verträge ohne jedes Angebot`);
});

test("echte Daten: jedes Angebot hält die Regeln ein", () => {
  const grenze = aktuellAb(echt.stand);
  for (const eigen of echt.tarife) {
    const regal = angebote(echt, eigen);
    const anbieterImRegal = regal.map((t) => t.anbieter);
    assert.equal(new Set(anbieterImRegal).size, anbieterImRegal.length, "ein Anbieter doppelt im Regal");
    for (const angebot of regal) {
      assert.notEqual(angebot.anbieter, eigen.anbieter, "eigener Anbieter im Regal");
      assert.ok(angebot.versionsstand >= grenze, `veraltetes Blatt: ${angebot.versionsstand}`);
      assert.ok(angebot.monatspreis_eur > 0, "Angebot ohne Preis");
      assert.ok(
        angebot.download_normal_mbps >= eigen.download_normal_mbps - 0.05,
        `${angebot.tarifname} sagt weniger zu als ${eigen.tarifname}`
      );
    }
  }
});

test("echte Daten: Deutsche Glasfaser hat kein aktuelles Blatt und kann darum nie empfohlen werden", () => {
  // Festgehalten als bekannte Lücke, nicht als Wunsch: Solange DG nur Blätter
  // von vor dem Fenster hat, darf es im Regal nicht auftauchen. Fällt dieser
  // Test eines Tages, sind frische DG-Blätter da — dann gehört die Lücke aus
  // dem Hinweistext im Ergebnis gestrichen.
  const grenze = aktuellAb(echt.stand);
  const dgAktuell = echt.tarife.filter(
    (t) => t.anbieter === "Deutsche Glasfaser" && t.versionsstand >= grenze
  );
  assert.equal(dgAktuell.length, 0);

  // DG-Kunden bekommen trotzdem ein Regal — nur eben von anderen Anbietern.
  const dgKunde = echt.tarife.find((t) => t.anbieter === "Deutsche Glasfaser");
  assert.ok(dgKunde);
  assert.ok(angebote(echt, dgKunde).length > 0);
});
