// Tests für die Sichtbarkeitsregel des Zugangs-Gates.
//
// Geprüft wird die eine Kopplung, an der zwei teure Fehler hängen:
//
//   * Rechtsseiten hinter dem Zugangscode → das Impressum ist nicht „ständig
//     verfügbar", und Awin lehnt das Partnerkonto ab.
//   * Erfundenes Impressum öffentlich → falsche Angabe im Rechtsverkehr.
//
// Beide Richtungen stehen hier, weil beim Eintragen der echten Firmendaten
// GENAU EINE Zeile umgelegt wird und niemand mehr daran denkt, was daran hängt.

import { test } from "node:test";
import assert from "node:assert/strict";
import { GATE_COOKIE, RECHTSSEITEN, istOeffentlich, gateCookieValue } from "./gate.ts";
import { angabenSindEcht, ANBIETER } from "./rechtliches/anbieter.ts";

const MIT_ECHTEN_ANGABEN = true;
const MIT_BEISPIELDATEN = false;

// ---------------------------------------------------------------------------
// Die Kopplung
// ---------------------------------------------------------------------------

test("mit echten Angaben sind die Rechtsseiten ohne Code erreichbar", () => {
  for (const pfad of RECHTSSEITEN) {
    assert.equal(
      istOeffentlich(pfad, MIT_ECHTEN_ANGABEN),
      true,
      `${pfad} muss ohne Zugangscode erreichbar sein — sonst sieht Awin das Impressum nicht`
    );
  }
});

test("mit Beispieldaten bleiben die Rechtsseiten hinter dem Gate", () => {
  for (const pfad of RECHTSSEITEN) {
    assert.equal(
      istOeffentlich(pfad, MIT_BEISPIELDATEN),
      false,
      `${pfad} darf mit Beispieldaten nicht öffentlich sein`
    );
  }
});

test("die App selbst bleibt in beiden Fällen hinter dem Gate", () => {
  // Die Kopplung darf nur die Rechtsseiten öffnen. Ginge hier versehentlich die
  // ganze App auf, wäre die Testphase still beendet — und die Messkosten liefen.
  for (const echt of [MIT_ECHTEN_ANGABEN, MIT_BEISPIELDATEN]) {
    for (const pfad of ["/", "/messung", "/api/messungen", "/api/rechnung"]) {
      assert.equal(istOeffentlich(pfad, echt), false, `${pfad} muss geschützt bleiben`);
    }
  }
});

test("die bisher freien Pfade bleiben unabhängig von den Angaben frei", () => {
  // Diese Liste war vor dieser Änderung schon frei. Fiele einer heraus, käme
  // niemand mehr an die Code-Eingabe — die App wäre für alle zu.
  for (const echt of [MIT_ECHTEN_ANGABEN, MIT_BEISPIELDATEN]) {
    for (const pfad of [
      "/zugang",
      "/api/zugang",
      "/icon.svg",
      "/manifest.webmanifest",
      "/sw.js",
      "/favicon.ico",
    ]) {
      assert.equal(istOeffentlich(pfad, echt), true, `${pfad} muss frei bleiben`);
    }
  }
});

test("die Statistik erreicht ihren Endpunkt auch bei gesetztem Zugangscode", () => {
  // Sonst bleibt die Zählung genau in der Testphase leer — und zwar leise:
  // Die App liefe weiter, nur es käme nichts an. Siehe PLATTFORM_PRAEFIX.
  for (const echt of [MIT_ECHTEN_ANGABEN, MIT_BEISPIELDATEN]) {
    assert.equal(istOeffentlich("/_vercel/insights/view", echt), true);
    assert.equal(istOeffentlich("/_vercel/insights/script.js", echt), true);
    assert.equal(istOeffentlich("/_vercel/speed-insights/vitals", echt), true);
  }
});

test("die Plattform-Ausnahme öffnet nur ihren eigenen Namensraum", () => {
  // Ein zu großzügiges Präfix wäre ein Loch: /_vercelXY oder /_vercel-eigenes
  // dürfen NICHT frei sein, sonst reicht ein passend benannter Pfad, um am
  // Gate vorbeizukommen.
  for (const pfad of ["/_vercel", "/_vercelXY", "/_vercel-eigenes/geheim", "/x/_vercel/insights"]) {
    assert.equal(istOeffentlich(pfad, MIT_BEISPIELDATEN), false, `${pfad} darf nicht frei sein`);
  }
});

test("Pfade werden genau verglichen, nicht nach Anfang", () => {
  // Ein Präfixvergleich wäre ein Loch: /impressum-intern oder
  // /zugang/../messung wären dann ebenfalls frei.
  for (const pfad of ["/impressumX", "/impressum/", "/datenschutz/extra", "/zugangX"]) {
    assert.equal(istOeffentlich(pfad, MIT_ECHTEN_ANGABEN), false, `${pfad} darf nicht frei sein`);
  }
});

// ---------------------------------------------------------------------------
// Der ausgelieferte Stand
// ---------------------------------------------------------------------------

test("ohne Parameter richtet sich die Regel nach den echten Anbieterangaben", () => {
  // Der Vorgabewert ist die Fassung, die im Betrieb wirkt. Solange
  // Beispieldaten ausgeliefert werden, müssen die Seiten zu sein.
  assert.equal(angabenSindEcht(ANBIETER), false);
  for (const pfad of RECHTSSEITEN) {
    assert.equal(istOeffentlich(pfad), false);
  }
  assert.equal(istOeffentlich("/zugang"), true);
});

// ---------------------------------------------------------------------------
// Das Cookie selbst (bisher ungetestet)
// ---------------------------------------------------------------------------

test("das Cookie enthält einen Hash, nie den Code", async () => {
  const wert = await gateCookieValue("geheim-123");
  assert.match(wert, /^[0-9a-f]{64}$/, "erwartet wird ein SHA-256-Hash in Hex");
  assert.ok(!wert.includes("geheim"), "der Klartext-Code darf nie im Cookie stehen");
});

test("verschiedene Codes ergeben verschiedene Cookie-Werte", async () => {
  const [a, b] = await Promise.all([gateCookieValue("code-a"), gateCookieValue("code-b")]);
  assert.notEqual(a, b);
});

test("derselbe Code ergibt denselben Wert", async () => {
  // Sonst würde das Gate Nutzer bei jedem Aufruf erneut fragen.
  const [a, b] = await Promise.all([gateCookieValue("gleich"), gateCookieValue("gleich")]);
  assert.equal(a, b);
});

test("der Cookie-Name ist stabil", () => {
  // Der Name steht in der Datenschutzerklärung (importiert, nicht kopiert).
  // Eine Umbenennung sperrt außerdem alle Tester wieder aus.
  assert.equal(GATE_COOKIE, "sr_zugang");
});
