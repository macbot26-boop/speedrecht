// Der Wächter über die Datenschutzerklärung.
//
// Das Problem, das dieser Test löst: Eine Datenschutzerklärung veraltet LEISE.
// Eine spätere Phase schließt einen Dienst an, setzt ein Cookie oder speichert
// etwas Neues auf dem Gerät — und der Text bleibt stehen. Er behauptet dann
// etwas Falsches, und niemand merkt es, weil nichts kaputtgeht. Auffallen
// würde es erst durch eine Beschwerde oder einen Anwaltsbrief.
//
// Dieser Test macht daraus einen sichtbaren Fehler. Er prüft zwei Richtungen:
//
//   1. RÜCKWÄRTS: Jeder Eintrag in der Erklärung muss einen Beleg im Code
//      haben. Wird ein Dienst wieder ausgebaut, wird der Test rot — dann muss
//      der Absatz raus, statt als falsches Versprechen stehen zu bleiben.
//   2. VORWÄRTS: Kommt eine neue Abhängigkeit, eine neue Umgebungsvariable
//      oder eine neue Ablage auf dem Gerät hinzu, wird der Test rot. Das sind
//      die drei Türen, durch die ein neuer Empfänger realistisch hereinkommt.
//
// Richtung 2 ist absichtlich unbequem. Wer eine Abhängigkeit hinzufügt, soll
// einmal nachdenken müssen, ob sie Nutzerdaten sieht.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { sep } from "node:path";
import { EMPFAENGER, GERAETEABLAGE } from "./verarbeiter.ts";
import { GATE_COOKIE } from "../gate.ts";
import { SPEICHER_SCHLUESSEL } from "../verlauf/speicher.ts";

/**
 * Der Projektstamm, ausgehend von DIESER Datei (src/lib/rechtliches/).
 *
 * Nicht das Arbeitsverzeichnis: Ein Test, der nur aus dem Projektstamm heraus
 * funktioniert, schlägt später aus einer Entwicklungsumgebung heraus fehl und
 * sieht dann wie ein echter Mangel aus. Dieselbe Bauart wie in
 * tarife.generated.test.mjs.
 */
const STAMM = new URL("../../../", import.meta.url);
const lies = (pfad) => readFileSync(new URL(pfad, STAMM), "utf8");

/** Alle Zeichenketten, mit denen sich ein Empfänger auf DIESE Datei beruft. */
const belegteWerte = (datei) =>
  new Set(
    EMPFAENGER.flatMap((e) => e.belege)
      .filter((b) => b.datei === datei)
      .map((b) => b.enthaelt)
  );

// ---------------------------------------------------------------------------
// Richtung 1: Jeder Eintrag muss im Code belegt sein
// ---------------------------------------------------------------------------

test("jeder genannte Empfänger ist im Code belegt", () => {
  for (const empfaenger of EMPFAENGER) {
    assert.ok(empfaenger.belege.length > 0, `"${empfaenger.name}" hat keinen Beleg im Code`);
    for (const beleg of empfaenger.belege) {
      assert.ok(
        lies(beleg.datei).includes(beleg.enthaelt),
        `"${empfaenger.name}" beruft sich auf ${beleg.datei} → "${beleg.enthaelt}", ` +
          `aber das steht dort nicht (mehr). Ist der Dienst ausgebaut worden? ` +
          `Dann muss auch der Absatz in der Datenschutzerklärung verschwinden.`
      );
    }
  }
});

test("jeder Empfänger nennt Zweck, Ort, Rechtsgrundlage und Aufbewahrung", () => {
  // Eine Empfängertabelle mit Lücken ist keine Auskunft nach Art. 13 DSGVO.
  for (const e of EMPFAENGER) {
    for (const feld of ["name", "zweck", "ort", "grundlage", "aufbewahrung"]) {
      assert.ok(
        typeof e[feld] === "string" && e[feld].trim() !== "",
        `Empfänger "${e.name}": Feld ${feld} fehlt`
      );
    }
    assert.equal(typeof e.nurMitEinwilligung, "boolean", `${e.name}: Einwilligungsflag fehlt`);
  }
});

test("die Übermittlung außerhalb der EU ist als solche gekennzeichnet", () => {
  // Der Rechnungs-Scan ist der einzige Weg mit echtem Drittlandbezug ohne
  // EU-Verarbeitungsort. Er MUSS von einer Einwilligung abhängen — sonst
  // fehlt ihm die Rechtsgrundlage (Art. 49 Abs. 1 lit. a DSGVO).
  const anthropic = EMPFAENGER.find((e) => e.name.includes("Anthropic"));
  assert.ok(anthropic, "Der KI-Dienst muss in der Erklärung stehen");
  assert.equal(anthropic.nurMitEinwilligung, true);
  assert.match(anthropic.grundlage, /Art\. 49/);
  assert.match(anthropic.ort, /außerhalb der EU/);
});

// ---------------------------------------------------------------------------
// Richtung 2, Tür 1: neue Abhängigkeiten
// ---------------------------------------------------------------------------

test("keine unbekannte Abhängigkeit, die Nutzerdaten sehen könnte", () => {
  // Nur `dependencies` — Werkzeuge aus `devDependencies` laufen beim Bauen und
  // sehen nie die Daten eines Besuchers.
  //
  // Wer hier etwas hinzufügt, muss entscheiden: Sieht das Paket Nutzerdaten?
  // Wenn ja, gehört ein Empfänger in verarbeiter.ts. Wenn nein, gehört der
  // Name in diese Liste — mit einer Begründung.
  const HARMLOS = {
    next: "das Web-Framework selbst — kein externer Empfänger",
    react: "Anzeige im Browser, keine Datenübermittlung",
    "react-dom": "Anzeige im Browser, keine Datenübermittlung",
  };

  const paket = JSON.parse(lies("package.json"));
  const belegt = belegteWerte("package.json");

  for (const name of Object.keys(paket.dependencies ?? {})) {
    const erklaert = name in HARMLOS || belegt.has(name);
    assert.ok(
      erklaert,
      `Neue Abhängigkeit "${name}" ist in der Datenschutzerklärung nicht erklärt. ` +
        `Sieht sie Nutzerdaten? Dann einen Empfänger in verarbeiter.ts eintragen. ` +
        `Wenn nicht, in die Liste HARMLOS dieses Tests aufnehmen — mit Begründung.`
    );
  }
});

// ---------------------------------------------------------------------------
// Richtung 2, Tür 2: neue Umgebungsvariablen
// ---------------------------------------------------------------------------

test("keine unbekannte Umgebungsvariable, die auf einen neuen Dienst deutet", () => {
  // Ein neuer externer Dienst braucht fast immer eine Adresse oder einen
  // Schlüssel — und beides landet in .env.example. Das ist die zuverlässigste
  // Stelle, um einen neuen Empfänger früh zu bemerken.
  const OHNE_EMPFAENGER = {
    SUPABASE_PUBLISHABLE_KEY: "gehört zum Supabase-Eintrag",
    MEASUREMENT_INGEST_TOKEN: "gehört zum Supabase-Eintrag",
    NEXT_PUBLIC_IAS_WS_TLD: "gehört zum Messserver-Eintrag",
    NEXT_PUBLIC_IAS_WS_PORT: "gehört zum Messserver-Eintrag",
    NEXT_PUBLIC_IAS_WS_TLS: "gehört zum Messserver-Eintrag",
    WECHSEL_PARTNER_NAME: "gehört zum Partner-Eintrag",
    ACCESS_CODE: "nur unser eigenes Zugangs-Gate, kein Empfänger",
  };

  const vorlage = lies(".env.example");
  const belegt = belegteWerte(".env.example");

  // Auch auskommentierte Zeilen zählen: Ein Dienst, der noch nicht
  // eingerichtet ist, wird eingerichtet werden.
  const variablen = [...vorlage.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((t) => t[1]);
  assert.ok(variablen.length > 0, "In .env.example wurden keine Variablen gefunden — Format geändert?");

  for (const name of new Set(variablen)) {
    assert.ok(
      name in OHNE_EMPFAENGER || belegt.has(name),
      `Neue Umgebungsvariable "${name}" ist in der Datenschutzerklärung nicht erklärt. ` +
        `Kommt damit ein neuer Empfänger dazu? Dann in verarbeiter.ts eintragen. ` +
        `Wenn nicht, in die Liste OHNE_EMPFAENGER dieses Tests aufnehmen.`
    );
  }
});

// ---------------------------------------------------------------------------
// Richtung 2, Tür 3: was auf dem Gerät liegt
// ---------------------------------------------------------------------------

test("Cookie und Gerätespeicher stehen mit ihrem echten Namen in der Tabelle", () => {
  // Die Namen werden importiert, nicht abgeschrieben — deshalb kann die
  // Tabelle nicht vom Code abweichen. Dieser Test hält fest, dass beide
  // überhaupt aufgeführt sind.
  const schluessel = GERAETEABLAGE.map((a) => a.schluessel);
  assert.ok(schluessel.includes(GATE_COOKIE), "Das Zugangs-Cookie fehlt in der Tabelle");
  assert.ok(
    schluessel.includes(SPEICHER_SCHLUESSEL),
    "Der Messverlauf auf dem Gerät fehlt in der Tabelle"
  );
});

test("jede Ablage nennt Zweck, Dauer und Rechtsgrundlage", () => {
  for (const a of GERAETEABLAGE) {
    for (const feld of ["schluessel", "art", "zweck", "dauer", "grundlage"]) {
      assert.ok(
        typeof a[feld] === "string" && a[feld].trim() !== "",
        `Ablage "${a.schluessel}": Feld ${feld} fehlt`
      );
    }
  }
});

test("alles auf dem Gerät ist technisch notwendig — sonst wäre ein Banner Pflicht", () => {
  // Solange jede Ablage technisch notwendig ist (§ 25 Abs. 2 Nr. 2 TDDDG),
  // braucht die Seite keinen Einwilligungsbanner. Käme etwas hinzu, das das
  // nicht ist, wäre ein Banner Pflicht — und dieser Test zwingt zu der
  // Entscheidung, statt sie zu übersehen.
  for (const a of GERAETEABLAGE) {
    assert.match(
      a.grundlage,
      /§ 25 Abs\. 2/,
      `"${a.schluessel}" beruft sich nicht auf die Ausnahme für technisch notwendige Ablagen. ` +
        `Dann braucht die Seite einen Einwilligungsbanner, bevor sie gesetzt werden darf.`
    );
  }
});

test("keine unbekannte Stelle im Code legt etwas auf dem Gerät ab", () => {
  // Der Tripwire: Nur diese Dateien dürfen Cookies oder Gerätespeicher
  // berühren. Kommt eine neue hinzu, wird geprüft, ob die Tabelle sie kennt.
  const ERLAUBT = [
    "src/app/api/zugang/route.ts", // setzt das Zugangs-Cookie
    "src/lib/gate.ts", // definiert seinen Namen
    "src/lib/verlauf/speicher.ts", // der Messverlauf auf dem Gerät
    "src/proxy.ts", // liest das Zugangs-Cookie
    "src/lib/rechtliches/verarbeiter.ts", // diese Tabelle selbst
    "src/lib/rechtliches/verarbeiter.test.mjs", // dieser Test
  ];

  const MUSTER = ["localStorage", "sessionStorage", "document.cookie", "cookies()"];

  // Rekursiv über src/, mit Pfaden relativ zum Projektstamm — damit die
  // Meldung genau die Zeichenkette zeigt, die in ERLAUBT gehört.
  const quellen = readdirSync(new URL("src/", STAMM), { recursive: true })
    .filter((pfad) => /\.(ts|tsx|mjs)$/.test(pfad))
    .map((pfad) => `src/${pfad.split(sep).join("/")}`);

  assert.ok(quellen.length > 10, "Keine Quelldateien gefunden — Pfadauflösung geändert?");

  const treffer = quellen.filter((pfad) => MUSTER.some((m) => lies(pfad).includes(m))).sort();

  for (const datei of treffer) {
    assert.ok(
      ERLAUBT.includes(datei),
      `${datei} legt etwas auf dem Gerät des Nutzers ab oder liest es. ` +
        `Steht das in GERAETEABLAGE? Wenn ja, die Datei hier eintragen. ` +
        `Wenn nein: erst die Datenschutzerklärung ergänzen.`
    );
  }
});
