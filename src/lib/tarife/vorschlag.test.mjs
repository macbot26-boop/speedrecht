// Tests für den Tarif-Vorschlag — gegen die ECHTE generierte Tarif-Tabelle
// (Telekom-Kernsortiment) plus Mini-Daten für die Bewertungs-Regeln.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tarifVorschlaege, tarifKlassen, MAX_KNOPF_NAMEN } from "./vorschlag.ts";
import { tarifUrteil } from "./urteil.ts";
import { aufAnzeige, formatMbps } from "./anzeige.ts";

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

test("45 Mbit/s → 50er zuerst, keine echte Klasse doppelt", () => {
  const v = tarifVorschlaege(daten, "Telekom", 45);
  assert.equal(v[0].tarif.download_max_mbps, 50);
  // Eindeutig nach (bis-zu | normal | min): L und M dürfen dieselbe bis-zu-Rate
  // (100) teilen — sie sind verschiedene Klassen, kein echtes Duplikat.
  const schluessel = v.map(
    (x) =>
      `${x.tarif.download_max_mbps}|${x.tarif.download_normal_mbps}|${x.tarif.download_min_mbps}`
  );
  assert.equal(new Set(schluessel).size, schluessel.length);
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

test("Varianten sind wählbar, Repräsentant ist die Basis-Variante", () => {
  const v = tarifVorschlaege(daten, "Telekom", 85);
  assert.ok(v[0].namensWahl.length >= 2, "100er-Klasse hat mehrere Vertragsnamen");
  assert.ok(!/Flex|On-Net|All-Net/.test(v[0].tarif.tarifname));
  // Der Knopf zeigt nur den Grundnamen — "… L Flex" ist keine eigene Zeile
  // wert, es ist dasselbe Produkt. Wählbar bleibt es trotzdem (namensWahl).
  assert.deepEqual(v[0].produkte, ["MagentaZuhause L"]);
  assert.ok(v[0].namensWahl.some((t) => t.tarifname === "MagentaZuhause L Flex"));
});

// --- tarifKlassen: vollständige Auswahl, aufsteigend nach beworbener Rate ---

test("tarifKlassen listet Telekom-Klassen aufsteigend nach Maximal-Download", () => {
  const k = tarifKlassen(daten, "Telekom");
  assert.ok(k.length >= 5, "Telekom hat mehrere Bewertungs-Klassen");
  const speeds = k.map((x) => x.tarif.download_max_mbps);
  const sortiert = [...speeds].sort((a, b) => a - b);
  assert.deepEqual(speeds, sortiert, "muss aufsteigend (nicht fallend) sortiert sein");
  // Jede Klasse ist eindeutig nach (bis-zu | normal | min): Tarife mit gleicher
  // bis-zu-Rate, aber anderem normal/min bleiben getrennt (kein Verschmelzen).
  const schluessel = k.map(
    (x) =>
      `${x.tarif.download_max_mbps}|${x.tarif.download_normal_mbps}|${x.tarif.download_min_mbps}`
  );
  assert.equal(new Set(schluessel).size, schluessel.length, "keine doppelte Klasse");
});

test("tarifKlassen trennt Telekom 100: L (83,8) und M (83,3) sind beide wählbar", () => {
  const k = tarifKlassen(daten, "Telekom");
  const hunderter = k.filter((x) => x.tarif.download_max_mbps === 100);
  assert.ok(hunderter.length >= 2, "100er muss in L und M getrennt sein");
  const normals = new Set(hunderter.map((x) => x.tarif.download_normal_mbps));
  assert.ok(normals.has(83.8) && normals.has(83.3), "beide normal-Werte vertreten");
});

test("Vorschlag bei 85 Mbit/s bietet Telekom-100 als L UND M an (M-Kunde nicht ausgeschlossen)", () => {
  const v = tarifVorschlaege(daten, "Telekom", 85);
  const hunderter = v.filter((x) => x.tarif.download_max_mbps === 100);
  const normals = new Set(hunderter.map((x) => x.tarif.download_normal_mbps));
  assert.ok(normals.has(83.8) && normals.has(83.3), "L und M beide vorgeschlagen");
});

test("tarifKlassen für unbekannten Anbieter → leer", () => {
  assert.deepEqual(tarifKlassen(daten, "GibtEsNicht"), []);
});

// --- Neue Anbieter: die Tabelle deckt jetzt sechs Netze ab ----------------

test("alle sechs Festnetz-Anbieter haben Tarife", () => {
  for (const anbieter of ["Telekom", "Vodafone", "o2", "1&1", "PŸUR", "Deutsche Glasfaser"]) {
    const k = tarifKlassen(daten, anbieter);
    assert.ok(k.length > 0, `${anbieter} hat keine Tarife`);
  }
});

test("Anbieter-Namen entsprechen exakt der kanonischen Liste", async () => {
  // Nur bei Buchstabengleichheit findet der Ergebnis-Screen zum erkannten
  // Anbieter auch die Tarife — sonst erschiene "noch nicht hinterlegt".
  const { FESTNETZ_ANBIETER } = await import("../netz/anbieter.ts");
  const bekannt = new Set(FESTNETZ_ANBIETER);
  for (const t of daten.tarife) {
    assert.ok(bekannt.has(t.anbieter), `unbekannter Anbieter-Name: "${t.anbieter}"`);
  }
});

test("kein Tarif ohne Geschwindigkeit, keine unlogische Reihenfolge", () => {
  for (const t of daten.tarife) {
    assert.ok(t.download_max_mbps > 0, `${t.slug}: bis-zu-Rate 0`);
    if (t.download_normal_mbps != null) {
      assert.ok(t.download_normal_mbps <= t.download_max_mbps, `${t.slug}: normal > max`);
    }
    if (t.download_min_mbps != null && t.download_normal_mbps != null) {
      assert.ok(t.download_min_mbps <= t.download_normal_mbps, `${t.slug}: min > normal`);
    }
  }
});

test("Bezeichner sind eindeutig — sie sind der Listen-Schlüssel der Auswahl", () => {
  const slugs = daten.tarife.map((t) => t.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

// --- Auswahl bleibt unterscheidbar ----------------------------------------

// So beschriftet die Oberfläche einen Auswahl-Knopf. Bewusst mit dem ECHTEN
// formatMbps statt einer Nachbildung: Der Test soll ja gerade merken, wenn
// Anzeige und Klassenbildung auseinanderlaufen — eine Kopie der Rundung
// bliebe genau dann grün, wenn sie es nicht dürfte.
function knopfText(v) {
  const zeig = formatMbps;
  return (
    v.produkte.join(", ") +
    (v.weitereNamen > 0 ? ` +${v.weitereNamen} weitere` : "") +
    ` · bis zu ${zeig(v.tarif.download_max_mbps)}` +
    (v.unterscheidung?.normalMbps != null ? `, normal ${zeig(v.unterscheidung.normalMbps)}` : "") +
    (v.unterscheidung?.minMbps != null ? `, min ${zeig(v.unterscheidung.minMbps)}` : "")
  );
}

test("keine zwei Auswahl-Knöpfe sehen gleich aus", () => {
  // Sonst könnte der Nutzer nur raten, welcher Knopf sein Vertrag ist —
  // und die beiden führen zu verschiedenen Urteilen.
  for (const anbieter of ["Telekom", "Vodafone", "o2", "1&1", "PŸUR", "Deutsche Glasfaser"]) {
    const texte = tarifKlassen(daten, anbieter).map(knopfText);
    assert.equal(new Set(texte).size, texte.length, `${anbieter}: doppelte Beschriftung`);
  }
});

test("auch die Vorschlagsliste bleibt über alle Messwerte eindeutig", () => {
  for (const anbieter of ["Telekom", "Vodafone", "o2", "1&1", "PŸUR", "Deutsche Glasfaser"]) {
    for (const gemessen of [3, 8, 16, 22, 40, 56, 95, 180, 240, 480, 900]) {
      const texte = tarifVorschlaege(daten, anbieter, gemessen).map(knopfText);
      assert.equal(new Set(texte).size, texte.length, `${anbieter} @ ${gemessen}`);
    }
  }
});

test("Unterscheidung steht nur da, wo sie gebraucht wird", () => {
  // Bei der Telekom ist jeder Knopf schon durch Name + bis-zu eindeutig.
  const k = tarifKlassen(daten, "Telekom");
  assert.ok(k.some((v) => v.unterscheidung === undefined));
});

// --- Kein Vertragsname geht verloren ---------------------------------------

test("jeder Vertragsname der Tabelle ist über die Auswahl erreichbar", () => {
  // Der Kern der zweistufigen Wahl: Früher gewann in einer Klasse der KÜRZESTE
  // Name, alle anderen waren unerreichbar — im Ergebnis (und später im
  // Kulanz-Brief) stand ein Vertrag, den der Nutzer nie bestellt hat.
  for (const anbieter of ["Telekom", "Vodafone", "o2", "1&1", "PŸUR", "Deutsche Glasfaser"]) {
    const inDenDaten = new Set(
      daten.tarife.filter((t) => t.anbieter === anbieter).map((t) => t.tarifname)
    );
    const erreichbar = new Set(
      tarifKlassen(daten, anbieter).flatMap((v) => v.namensWahl.map((t) => t.tarifname))
    );
    const fehlend = [...inDenDaten].filter((n) => !erreichbar.has(n));
    assert.deepEqual(fehlend, [], `${anbieter}: nicht wählbare Vertragsnamen`);
  }
});

test("der o2-Fall, an dem es auffiel: 'O2 Home M 100' ist wählbar", () => {
  // 100/83/50 bündelt sieben Verträge aus vier Produkten. "O2 my Home L" ist
  // ein Zeichen kürzer als "O2 Home M 100" und gewann deshalb den Namen.
  const klasse = tarifKlassen(daten, "o2").find((v) =>
    v.namensWahl.some((t) => t.tarifname === "O2 Home M 100")
  );
  assert.ok(klasse, "Klasse mit 'O2 Home M 100' nicht gefunden");
  assert.equal(klasse.namensWahl.length, 7, "sieben Verträge aus vier Produkten");
  // Auf den Knopf passen zwei Namen — der Rest wird nicht verschwiegen,
  // sondern gezählt. Früher stand hier nur "O2 my Home L" und sonst nichts.
  assert.equal(klasse.weitereNamen, 5);
  assert.ok(klasse.produkte.length >= 1);
});

test("die Namenswahl ändert nie das Urteil — nur den Namen", () => {
  // Sonst wäre sie eine Falle: Der Nutzer tippt seinen echten Vertrag an und
  // bekommt ein anderes Ergebnis als der Knopf versprochen hat.
  for (const anbieter of ["Telekom", "Vodafone", "o2", "1&1", "PŸUR", "Deutsche Glasfaser"]) {
    for (const v of tarifKlassen(daten, anbieter)) {
      for (const gemessen of [0.5, 5, 45, 90, 240, 900]) {
        const urteile = new Set(v.namensWahl.map((t) => tarifUrteil(t, gemessen)));
        assert.equal(urteile.size, 1, `${anbieter}/${v.tarif.slug} @ ${gemessen}`);
      }
    }
  }
});

test("ein Tap genügt, wo die Klasse eindeutig heißt", () => {
  // Die zweite Stufe darf nicht zur Pflicht für alle werden — sonst kostet die
  // Ehrlichkeit jeden Nutzer einen Tap, auch wo es nichts zu wählen gibt.
  const eindeutig = tarifKlassen(daten, "Telekom").filter((v) => v.namensWahl.length === 1);
  assert.ok(eindeutig.length > 0, "keine einzige eindeutige Telekom-Klasse");
  for (const v of eindeutig) assert.equal(v.weitereNamen, 0);
});

test("der Knopf verschweigt nie, wie viele Namen dahinterstecken", () => {
  for (const anbieter of ["Telekom", "Vodafone", "o2", "1&1", "PŸUR", "Deutsche Glasfaser"]) {
    for (const v of tarifKlassen(daten, anbieter)) {
      assert.ok(v.produkte.length >= 1, `${v.tarif.slug}: Knopf ohne Namen`);
      assert.ok(v.produkte.length <= MAX_KNOPF_NAMEN, `${v.tarif.slug}: Knopf zu voll`);
      assert.equal(
        v.produkte.length + v.weitereNamen,
        v.namensWahl.length,
        `${v.tarif.slug}: "+N weitere" zählt falsch`
      );
      assert.equal(v.tarif, v.namensWahl[0], `${v.tarif.slug}: Repräsentant ≠ erste Wahl`);
    }
  }
});

test("Werte, die sich erst hinter der Anzeige unterscheiden, gelten als ein Tarif", () => {
  // 0,77 und 0,768 stehen beide als "0.8" auf dem Schirm und ergeben
  // dasselbe Urteil — zwei Knöpfe daraus wären für niemanden trennbar.
  const mini = {
    stand: "2026-07-24",
    quelle: "Test",
    tarife: [0.77, 0.768].map((min, i) => ({
      anbieter: "Test",
      slug: `t${i}`,
      tarifname: "Test 16",
      zugang: null,
      technologie: "dsl",
      download_max_mbps: 16,
      download_normal_mbps: 9.5,
      download_min_mbps: min,
      upload_max_mbps: 2,
      upload_normal_mbps: 1,
      upload_min_mbps: 0.1,
      monatspreis_eur: 20,
      quelle_url: "https://example.invalid/pib.pdf",
      versionsstand: "2026-01-01",
    })),
  };
  const k = tarifKlassen(mini, "Test");
  assert.equal(k.length, 1);
  // Beide heißen gleich — also auch keine Namens-Rückfrage: ein Tap genügt.
  assert.equal(k[0].namensWahl.length, 1);
});

// --- Anzeige-Rundung -------------------------------------------------------

test("Anzeige und Klassen-Rundung stimmen an jeder Stelle überein", () => {
  // Die Auswahl BÜNDELT Tarife über aufAnzeige, BESCHRIFTET sie aber über
  // formatMbps. Liefen die beiden auseinander, sähen zwei Knöpfe gleich aus,
  // gehörten aber zu verschiedenen Klassen — der Nutzer könnte nur raten,
  // welcher sein Vertrag ist. Heikel sind die Grenzfälle knapp unter 100,
  // wo die Regel von einer Nachkommastelle auf ganzzahlig umspringt.
  const proben = [0.064, 0.768, 1.6, 9.5, 16, 49.96, 83.75, 83.8, 99.94, 99.96, 100, 128, 249.5, 1000];
  for (const wert of proben) {
    assert.equal(formatMbps(wert), formatMbps(aufAnzeige(wert)), `${wert} rundet uneinheitlich`);
  }
  assert.equal(formatMbps(99.96), "100");
  assert.equal(aufAnzeige(99.96), 100);
  assert.equal(formatMbps(83.75), "83,8");
  assert.equal(formatMbps(null), "–");
});

test("Zahlen stehen deutsch da — Komma unten, Tausenderpunkt oben", () => {
  // Sonst läse sich der Schirm halb englisch ("44.0 Mbit/s" neben "39,99 €"),
  // und im Kulanz-Brief stünde eine Zusicherung in fremder Schreibweise.
  assert.equal(formatMbps(44), "44,0");
  assert.equal(formatMbps(0.768), "0,8");
  assert.equal(formatMbps(99.9), "99,9");

  // Ab 100 ganzzahlig — und ab 1000 mit Tausenderpunkt, damit die Zahl so
  // dasteht wie der Vertragsname daneben ("Glasfaser 2.000").
  assert.equal(formatMbps(100), "100");
  assert.equal(formatMbps(250), "250");
  assert.equal(formatMbps(1000), "1.000");
  assert.equal(formatMbps(2000), "2.000");

  // Und zwar für JEDEN Wert der echten Tabelle, nicht nur für die Proben oben.
  // Ein Punkt als Dezimalzeichen ("83.8") oder ein Komma als Tausendertrenner
  // ("2,000") hieße auf einem Brief an den Anbieter etwas völlig anderes.
  const DEUTSCH = /^\d{1,3}(\.\d{3})*(,\d)?$/;
  for (const t of daten.tarife) {
    for (const feld of ["download_max_mbps", "download_normal_mbps", "download_min_mbps"]) {
      const text = formatMbps(t[feld]);
      if (text === "–") continue; // nicht jeder Tarif nennt jede Rate
      assert.ok(DEUTSCH.test(text), `${t.slug}.${feld}: keine deutsche Schreibweise (${text})`);
    }
  }
});

test("jeder Wert der echten Tabelle wird einheitlich gerundet", () => {
  for (const t of daten.tarife) {
    for (const feld of ["download_max_mbps", "download_normal_mbps", "download_min_mbps"]) {
      assert.equal(formatMbps(t[feld]), formatMbps(aufAnzeige(t[feld])), `${t.slug}.${feld}`);
    }
  }
});
