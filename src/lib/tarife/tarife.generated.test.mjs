// Wache über die generierte Tarif-Tabelle: Vertragsnamen müssen VOLLSTÄNDIG
// sein.
//
// Warum das einen eigenen Test verdient: Der Vertragsname ist keine Zierde.
// Er steht im Ergebnis, im Angebots-Regal — und er geht in den Kulanz-Brief
// an den Anbieter. Ein Name, der so auf keiner Rechnung steht, nimmt genau
// dort die Schärfe, wegen der er dort steht. Zusätzlich hält der Name
// Vertragsvarianten auseinander ("Kooperationspartner I" gegen "II"); wird er
// abgeschnitten, fallen zwei verschiedene Verträge zu einem zusammen, und der
// Nutzer bekommt womöglich das Urteil des falschen.
//
// Genau das ist passiert: Die neueren Vodafone-Blätter setzen den Namen über
// zwei Zeilen, und der Parser las nur die erste. Sichtbar war das nur daran,
// dass die Namen mitten im Satz aufhörten ("… - Ausbau durch"). Dieser Test
// macht dieses stille Versagen laut — er prüft die ECHTE Tabelle, nicht
// Beispieldaten, denn kaputt gehen kann sie nur beim Neu-Einlesen.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const daten = JSON.parse(
  await readFile(new URL("./tarife.generated.json", import.meta.url), "utf8")
);

// Wörter, die einen Vertragsnamen nicht beenden können: Sie verlangen alle
// eine Fortsetzung ("Ausbau durch …", "Anschluss über …"). Steht eines am
// Ende, fehlt hinten etwas.
const HAENGENDES_WORT =
  /(?:^|\s)(?:durch|und|mit|für|von|der|die|das|im|in|am|bei|über|ohne)$/i;

/**
 * Endet der Name mit einem Bindestrich, der ins Leere zeigt?
 *
 * Nicht jeder Bindestrich am Ende ist ein Bruch: Die Telekom klammert die
 * Geschwindigkeit in Striche ("MagentaZuhause Start -2000-", "… All-Net
 * -25-"). Solche Namen sind vollständig — der letzte Strich SCHLIESST den
 * ersten. Ein hängender Strich steht dagegen allein oder klebt hinten an
 * einem Wort ("Kooperations-").
 */
function haengenderBindestrich(name) {
  const letztes = name.split(/\s+/).pop() ?? "";
  if (!letztes.endsWith("-")) return false;
  // Auf beiden Seiten ein Strich = geschlossene Klammer, kein Bruch.
  return !(letztes.length > 1 && letztes.startsWith("-"));
}

function unvollstaendig(name) {
  const sauber = name.trim();
  return HAENGENDES_WORT.test(sauber) || haengenderBindestrich(sauber);
}

test("die Regel erkennt abgeschnittene Namen — und nur die", () => {
  // Abgeschnitten: genau die Form, die der Umbruch-Fehler erzeugt hat.
  assert.ok(unvollstaendig("GigaZuhause 150 Glasfaser - Ausbau durch"));
  assert.ok(unvollstaendig("GigaZuhause Basic 50 Glasfaser - Ausbau durch"));
  assert.ok(unvollstaendig("Irgendein Anschluss über"));
  assert.ok(unvollstaendig("Surf und Phone mit"));
  assert.ok(unvollstaendig("Tarif Kooperations-"));
  assert.ok(unvollstaendig("Tarif -"));

  // Vollständig: die Telekom-Klammerschreibweise darf NICHT anschlagen,
  // sonst meldet der Test fünf Fehlalarme und wird abgeschaltet.
  assert.ok(!unvollstaendig("MagentaZuhause Start -2000-"));
  assert.ok(!unvollstaendig("MagentaZuhause M All-Net -25-"));
  // Und gewöhnliche Namen erst recht nicht.
  assert.ok(!unvollstaendig("GigaZuhause 1000 Kabel Nov 2023"));
  assert.ok(!unvollstaendig("O2 my Home S Plus"));
  assert.ok(!unvollstaendig("1&1 DSL 50 / 1&1 Glasfaser 50"));
  assert.ok(
    !unvollstaendig("GigaZuhause 100 Glasfaser - Ausbau durch Kooperationspartner II (OXG)")
  );
});

test("kein Vertragsname der echten Tabelle hört mitten im Satz auf", () => {
  const kaputt = [
    ...new Map(
      daten.tarife
        .filter((t) => unvollstaendig(t.tarifname))
        .map((t) => [t.tarifname, t])
    ).values(),
  ];

  assert.deepEqual(
    kaputt.map((t) => `${t.anbieter}: ${t.tarifname}  (${t.slug})`),
    [],
    "Abgeschnittene Vertragsnamen — vermutlich bricht die Überschrift im Blatt " +
      "über mehrere Zeilen um und titelFinden liest nur die erste. " +
      "Siehe scripts/lib/pib-parser.mjs."
  );
});

test("jeder Vertragsname trägt überhaupt Text", () => {
  // Ein leerer Name käme im Brief als Lücke an.
  const leer = daten.tarife.filter((t) => !t.tarifname || !t.tarifname.trim());
  assert.deepEqual(leer.map((t) => t.slug), []);
});
