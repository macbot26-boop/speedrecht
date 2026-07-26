// Tests für die Partner-Konfiguration.
//
// Zwei Fehlerarten stehen hier im Mittelpunkt, und beide wären LEISE — der
// Verweis funktionierte weiter, nur die Provision käme nie an:
//
//   1. Eine Vorlage ohne Klick-Kennung. Der Nutzer wechselt, der Partner
//      verbucht den Abschluss auf niemanden.
//   2. Ein unkodierter Wert. "1&1" beendet den Parameter mitten im Wort, beim
//      Partner kommt "1" an.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLATZHALTER,
  partnerAusUmgebung,
  partnerPruefen,
  wechselUrl,
} from "./partner.ts";

const GUELTIG = "https://partner.example/dsl?subid={klick_id}";

// ---------------------------------------------------------------------------
// Prüfung der Vorlage
// ---------------------------------------------------------------------------

test("eine vollständige Konfiguration wird angenommen", () => {
  const { partner, fehler } = partnerPruefen("CHECK24", GUELTIG);
  assert.equal(fehler, null);
  assert.deepEqual(partner, { name: "CHECK24", vorlage: GUELTIG });
});

test("gar nicht eingerichtet ist kein Fehler, sondern der Normalzustand", () => {
  // Bis das Partnerkonto steht, ist genau das der erwartete Zustand — und der
  // Wechsel-Vorschlag bleibt aus, statt ins Leere zu führen.
  for (const [name, vorlage] of [
    [undefined, undefined],
    ["", ""],
    ["   ", "  "],
  ]) {
    const { partner, fehler } = partnerPruefen(name, vorlage);
    assert.equal(partner, null);
    assert.equal(fehler, "nicht_konfiguriert");
  }
});

test("halb eingerichtet gilt als Fehler, nicht als 'nicht eingerichtet'", () => {
  // Ein vergessener zweiter Eintrag darf nicht wie Absicht aussehen, sonst
  // sucht man den fehlenden Knopf im Quelltext statt in Vercel.
  assert.equal(partnerPruefen("CHECK24", undefined).fehler, "keine_gueltige_adresse");
  assert.equal(partnerPruefen(undefined, GUELTIG).fehler, "name_fehlt");
});

test("ohne {klick_id} kein Partner", () => {
  const { partner, fehler } = partnerPruefen(
    "CHECK24",
    "https://partner.example/dsl?ref=speedrecht"
  );
  assert.equal(partner, null);
  assert.equal(fehler, "keine_klick_id");
});

test("nur https", () => {
  // Ein unverschlüsselter Verweis gäbe den Klick unterwegs preis — und die
  // Partnerkennung gleich mit.
  assert.equal(partnerPruefen("X", "http://partner.example/?s={klick_id}").fehler, "kein_https");
  assert.equal(partnerPruefen("X", "ftp://partner.example/?s={klick_id}").fehler, "kein_https");
});

test("Unsinn statt Adresse wird abgewiesen", () => {
  assert.equal(partnerPruefen("X", "partner.example?s={klick_id}").fehler, "keine_gueltige_adresse");
  assert.equal(partnerPruefen("X", "{klick_id}").fehler, "keine_gueltige_adresse");
});

test("ein unbekannter Platzhalter bricht laut ab", () => {
  // Der teure Fall: {plz} stünde sonst wörtlich in der Adresse. Der Verweis
  // führte ins Leere, und im Ergebnis sähe alles normal aus.
  const { partner, fehler } = partnerPruefen(
    "CHECK24",
    "https://partner.example/dsl?subid={klick_id}&plz={plz}"
  );
  assert.equal(partner, null);
  assert.equal(fehler, "unbekannter_platzhalter");
});

test("ein verschriebener Platzhalter zählt als unbekannt", () => {
  // Leerzeichen in den Klammern sind der wahrscheinlichste Tippfehler.
  assert.equal(
    partnerPruefen("X", "https://partner.example/?s={ klick_id }").fehler,
    "unbekannter_platzhalter"
  );
  assert.equal(
    partnerPruefen("X", "https://partner.example/?s={klick_id}&a={Anbieter}").fehler,
    "unbekannter_platzhalter"
  );
});

test("alle dokumentierten Platzhalter sind erlaubt", () => {
  const vorlage = `https://partner.example/dsl?${PLATZHALTER.map((p) => `${p}={${p}}`).join("&")}`;
  assert.equal(partnerPruefen("CHECK24", vorlage).fehler, null);
});

test("ein überlanger Name oder eine überlange Vorlage wird abgewiesen", () => {
  assert.equal(partnerPruefen("X".repeat(41), GUELTIG).fehler, "name_fehlt");
  assert.equal(
    partnerPruefen("X", `https://partner.example/?p=${"x".repeat(500)}&s={klick_id}`).fehler,
    "keine_gueltige_adresse"
  );
});

// ---------------------------------------------------------------------------
// Einsetzen der Werte
// ---------------------------------------------------------------------------

const partner = partnerPruefen(
  "CHECK24",
  "https://partner.example/dsl?subid={klick_id}&von={anbieter}&ist={mbps}"
).partner;

test("die Klick-Kennung kommt unverändert an", () => {
  const klickId = "3f2b1c9a-0000-4000-8000-abcdefabcdef";
  const url = new URL(wechselUrl(partner, { klickId }));
  assert.equal(url.searchParams.get("subid"), klickId);
});

test("ein Anbietername mit & wird kodiert", () => {
  // Ohne Kodierung käme beim Partner "1" an — und der Verweis funktionierte
  // trotzdem. Genau darum steht der Fall hier.
  const url = wechselUrl(partner, { klickId: "k1", anbieter: "1&1" });
  assert.ok(url.includes("von=1%261"), url);
  assert.equal(new URL(url).searchParams.get("von"), "1&1");
});

test("ein böswilliger Wert kann keinen eigenen Parameter unterschieben", () => {
  const url = new URL(wechselUrl(partner, { klickId: "k1", anbieter: "x&subid=fremd" }));
  assert.equal(url.searchParams.get("subid"), "k1", "die eigene Kennung muss stehen bleiben");
  assert.equal(url.searchParams.get("von"), "x&subid=fremd");
});

test("fehlende Werte werden leer eingesetzt, der Klick geht trotzdem durch", () => {
  const url = new URL(wechselUrl(partner, { klickId: "k1", anbieter: null, mbps: null }));
  assert.equal(url.searchParams.get("von"), "");
  assert.equal(url.searchParams.get("ist"), "");
  assert.equal(url.searchParams.get("subid"), "k1");
});

test("die Messung wird für den Partner auf volle Mbit/s gerundet", () => {
  const werte = (mbps) => new URL(wechselUrl(partner, { klickId: "k1", mbps })).searchParams.get("ist");
  assert.equal(werte(83.8), "84");
  assert.equal(werte(49.4), "49");
  assert.equal(werte(0), "0");
  assert.equal(werte(Number.NaN), "", "keine Zahl heißt: kein Wert, nicht 'NaN'");
});

test("ein mehrfach verwendeter Platzhalter wird überall ersetzt", () => {
  const zweimal = partnerPruefen(
    "X",
    "https://partner.example/{klick_id}/dsl?subid={klick_id}"
  ).partner;
  const url = wechselUrl(zweimal, { klickId: "abc" });
  assert.equal(url, "https://partner.example/abc/dsl?subid=abc");
});

// ---------------------------------------------------------------------------
// Umgebung
// ---------------------------------------------------------------------------

test("aus der Umgebung gelesen", () => {
  assert.deepEqual(
    partnerAusUmgebung({ WECHSEL_PARTNER_NAME: "CHECK24", WECHSEL_PARTNER_URL: GUELTIG }),
    { name: "CHECK24", vorlage: GUELTIG }
  );
  assert.equal(partnerAusUmgebung({}), null);
  assert.equal(
    partnerAusUmgebung({ WECHSEL_PARTNER_NAME: "X", WECHSEL_PARTNER_URL: "http://x.example/{klick_id}" }),
    null
  );
});
