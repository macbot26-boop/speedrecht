// Tests für die Bildschirm-Entscheidung nach dem Rechnungs-Scan.
//
// Der Sinn dieser Datei: jeden Ausgang durchspielen, ohne eine Rechnung
// hochzuladen und ohne einen bezahlten Aufruf auszulösen.

import { test } from "node:test";
import assert from "node:assert/strict";
import { STANDARD_FEHLER, scanSchritt } from "./scan-fluss.ts";

/** Eine Klasse in der Form, die die Route liefert. */
const klasse = (tarifname, max = 100) => ({
  tarif: {
    anbieter: "Telekom",
    slug: `telekom-${tarifname.toLowerCase().replace(/\s+/g, "-")}`,
    tarifname,
    zugang: null,
    technologie: "DSL",
    download_max_mbps: max,
    download_normal_mbps: max * 0.9,
    download_min_mbps: max * 0.5,
    upload_max_mbps: 40,
    upload_normal_mbps: 36,
    upload_min_mbps: 20,
    monatspreis_eur: 49.95,
    quelle_url: "https://example.invalid/pib.pdf",
    versionsstand: "2026-01",
  },
  namensWahl: [],
  produkte: [tarifname],
  weitereNamen: 0,
});

const eindeutig = {
  istRechnung: true,
  lage: "eindeutig",
  anbieter: "Telekom",
  tarifname: "MagentaZuhause L",
  klassen: [klasse("MagentaZuhause L")],
};

test("ein eindeutiger Treffer führt zum Bestätigen", () => {
  const s = scanSchritt(200, eindeutig, "Telekom");
  assert.equal(s.art, "bestaetigen");
  assert.equal(s.anbieter, "Telekom");
  assert.equal(s.tarifname, "MagentaZuhause L");
  assert.equal(s.klasse.tarif.slug, "telekom-magentazuhause-l");
  assert.equal(s.konflikt, null);
});

test("ohne gelesenen Namen tritt der Name der Klasse an seine Stelle", () => {
  // Passiert, wenn mehrere Kandidaten punktgleich sind: Dann verantworten
  // wir kein "der Vertrag heißt X" — angezeigt wird trotzdem nur ein Name
  // aus unserer eigenen Tarifliste, nie roher Text von der Rechnung.
  const s = scanSchritt(200, { ...eindeutig, tarifname: null }, "Telekom");
  assert.equal(s.art, "bestaetigen");
  assert.equal(s.tarifname, "MagentaZuhause L");
});

test("mehrere Urteile hinter einem Namen führen zur Rückfrage", () => {
  const s = scanSchritt(
    200,
    {
      istRechnung: true,
      lage: "rueckfrage",
      anbieter: "1&1",
      tarifname: "1&1 DSL 100",
      klassen: [klasse("1&1 DSL 100", 100), klasse("1&1 DSL 100 Regio", 100)],
    },
    "1&1"
  );
  assert.equal(s.art, "namenswahl");
  assert.equal(s.klassen.length, 2);
  assert.equal(s.tarifname, "1&1 DSL 100");
});

test("Anbieter erkannt, Vertrag nicht — zurück in die Auswahl", () => {
  const s = scanSchritt(200, { istRechnung: true, lage: "kein_tarif", anbieter: "o2" }, "o2");
  assert.deepEqual(s, { art: "kein_tarif", anbieter: "o2", konflikt: null, kundennummer: null });
});

test("auch ohne gefundenen Vertrag bleibt der Anbieter-Konflikt sichtbar", () => {
  // Wichtig, weil die Auswahl sich danach auf den Anbieter der RECHNUNG
  // einstellt: Ohne die Warnung stünde ein Telekom-Vertrag neben einer
  // Messung aus dem Vodafone-Netz, ohne dass irgendwo steht, warum das
  // nicht zusammenpasst.
  const s = scanSchritt(
    200,
    { istRechnung: true, lage: "kein_tarif", anbieter: "Telekom" },
    "Vodafone"
  );
  assert.equal(s.art, "kein_tarif");
  assert.match(s.konflikt, /Rechnung ist von Telekom/);
});

test("gar kein Anbieter erkannt", () => {
  const s = scanSchritt(200, { istRechnung: true, lage: "kein_anbieter", anbieter: null }, null);
  assert.deepEqual(s, { art: "kein_anbieter" });
});

test("das Dokument ist keine Rechnung", () => {
  assert.deepEqual(scanSchritt(200, { istRechnung: false }, "Telekom"), { art: "keine_rechnung" });
});

test("Rechnung und Messung von verschiedenen Anschlüssen: sichtbar gewarnt", () => {
  const s = scanSchritt(200, eindeutig, "Vodafone");
  assert.equal(s.art, "bestaetigen");
  assert.match(s.konflikt, /Rechnung ist von Telekom/);
  assert.match(s.konflikt, /Netz von Vodafone/);
  // Das Ergebnis wird trotzdem gezeigt — die Rechnung ist die verlässlichere
  // Quelle als die IP-Adresse.
  assert.equal(s.tarifname, "MagentaZuhause L");
});

test("kein erkanntes Netz heißt kein Konflikt", () => {
  // Ohne Vergleichswert gibt es nichts zu warnen — eine Warnung ins Blaue
  // wäre schlimmer als keine.
  assert.equal(scanSchritt(200, eindeutig, null).konflikt, null);
});

test("die Warnung gilt auch bei der Rückfrage", () => {
  const s = scanSchritt(
    200,
    { ...eindeutig, lage: "rueckfrage", klassen: [klasse("A"), klasse("B")] },
    "PŸUR"
  );
  assert.equal(s.art, "namenswahl");
  assert.match(s.konflikt, /Netz von PŸUR/);
});

test("Fehler der Datei laden zum zweiten Versuch ein", () => {
  const s = scanSchritt(422, { error: "Die Datei ist zu groß." }, null);
  assert.deepEqual(s, {
    art: "fehler",
    meldung: "Die Datei ist zu groß.",
    erneutMoeglich: true,
  });
});

test("Bremse und Störung laden NICHT zum sofortigen zweiten Versuch ein", () => {
  // Sonst tippt der Nutzer ins Leere: Bei 429 ist die Stunde noch nicht um,
  // bei 503 ist der Dienst gestört — beides wird durch Wiederholen nicht besser.
  for (const status of [429, 503, 500, 0]) {
    assert.equal(scanSchritt(status, { error: "x" }, null).erneutMoeglich, false, `Status ${status}`);
  }
});

test("ohne brauchbare Meldung des Servers steht ein eigener Text bereit", () => {
  for (const daten of [null, undefined, {}, { error: 42 }, { error: "   " }, "kein json"]) {
    const s = scanSchritt(503, daten, null);
    assert.equal(s.art, "fehler");
    assert.equal(s.meldung, STANDARD_FEHLER);
  }
});

test("eine überlange Meldung wird gekürzt", () => {
  const s = scanSchritt(422, { error: "A".repeat(5000) }, null);
  assert.ok(s.meldung.length <= 200);
});

test("Zeilenumbrüche in der Meldung werden geglättet", () => {
  const s = scanSchritt(422, { error: " Zeile1 \n\n Zeile2 " }, null);
  assert.equal(s.meldung, "Zeile1 Zeile2");
});

test("eine kaputte Antwort erzeugt keinen weißen Bildschirm", () => {
  // Wenn die Route sich ändert und etwas Unerwartetes liefert, muss eine
  // Fehlermeldung erscheinen — nicht ein Absturz beim Zeichnen.
  for (const daten of [null, "text", 42, []]) {
    const s = scanSchritt(200, daten, "Telekom");
    assert.equal(s.art, "fehler");
    assert.equal(s.erneutMoeglich, true);
  }
});

test("'eindeutig' ohne brauchbare Klasse gilt als nicht gefunden", () => {
  // Sonst griffe die Oberfläche auf klassen[0] zu, das es nicht gibt.
  for (const klassen of [[], undefined, "nichts", [{}], [{ tarif: { slug: "x" } }]]) {
    const s = scanSchritt(200, { ...eindeutig, klassen }, "Telekom");
    assert.deepEqual(
      s,
      { art: "kein_tarif", anbieter: "Telekom", konflikt: null, kundennummer: null },
      JSON.stringify(klassen)
    );
  }
});

test("unbekannte Lagen fallen sicher in die normale Auswahl", () => {
  const s = scanSchritt(200, { ...eindeutig, lage: "etwas_neues" }, "Telekom");
  assert.deepEqual(s, { art: "kein_tarif", anbieter: "Telekom", konflikt: null, kundennummer: null });
});

test("halb kaputte Klassenliste: die brauchbaren bleiben", () => {
  const s = scanSchritt(
    200,
    { ...eindeutig, lage: "rueckfrage", klassen: [{ tarif: null }, klasse("Echt"), "müll"] },
    "Telekom"
  );
  assert.equal(s.art, "namenswahl");
  assert.equal(s.klassen.length, 1);
  assert.equal(s.klassen[0].tarif.tarifname, "Echt");
});

// ---------------------------------------------------------------------------
// Kundennummer — reiner Durchreichposten für den Kulanz-Brief
// ---------------------------------------------------------------------------

test("die Kundennummer kommt auf jedem erfolgreichen Weg mit", () => {
  // Sie steht auf derselben Rechnung, die der Nutzer gerade fotografiert hat —
  // sie danach abtippen zu lassen, wäre der Widerspruch zum ganzen Produkt.
  const nummer = "K-4711-0815";

  const a = scanSchritt(200, { ...eindeutig, kundennummer: nummer }, "Telekom");
  assert.equal(a.art, "bestaetigen");
  assert.equal(a.kundennummer, nummer);

  const b = scanSchritt(
    200,
    { ...eindeutig, lage: "rueckfrage", kundennummer: nummer },
    "Telekom"
  );
  assert.equal(b.art, "namenswahl");
  assert.equal(b.kundennummer, nummer);

  const c = scanSchritt(
    200,
    { istRechnung: true, lage: "kein_tarif", anbieter: "o2", kundennummer: nummer },
    "o2"
  );
  assert.equal(c.art, "kein_tarif");
  assert.equal(c.kundennummer, nummer);
});

test("eine unbrauchbare Kundennummer wird zu null, nicht zu Unsinn", () => {
  // Dieselbe Haltung wie bei allen anderen Feldern: Die Antwort kommt zwar vom
  // eigenen Server, wird aber trotzdem geprüft.
  for (const kaputt of [42, {}, [], true, null, undefined]) {
    const s = scanSchritt(200, { ...eindeutig, kundennummer: kaputt }, "Telekom");
    assert.equal(s.kundennummer, null, JSON.stringify(kaputt));
  }
});

test("ohne Kundennummer auf der Rechnung bleibt das Feld leer", () => {
  const s = scanSchritt(200, eindeutig, "Telekom");
  assert.equal(s.kundennummer, null);
});
