// Tests für den Kulanz-Brief — gegen die ECHTE generierte Tarif-Tabelle.
//
// Die erste Testgruppe ist die wichtigste und der eigentliche Grund für diese
// Datei: Der Brief darf keine Rechtsausübung behaupten. Eine einzelne Messung
// erfüllt keines der drei Kriterien des § 57 Abs. 4 TKG, und als Nachweis gilt
// allein das Messprotokoll der Bundesnetzagentur. Ein Brief, der "hiermit
// mindere ich" sagt, stellt den Nutzer vor seinem Anbieter bloß.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { briefBauen } from "./text.ts";
import { tarifUrteil } from "../tarife/urteil.ts";

const daten = JSON.parse(
  await readFile(new URL("../tarife/tarife.generated.json", import.meta.url), "utf8")
);

const magentaL = daten.tarife.find((t) => t.tarifname === "MagentaZuhause L");
assert.ok(magentaL, "MagentaZuhause L muss in den Tarifdaten existieren");
assert.equal(magentaL.download_max_mbps, 100);
assert.equal(magentaL.download_normal_mbps, 83.8);
assert.equal(magentaL.download_min_mbps, 54);

const eingabe = (aenderungen = {}) => ({
  tarif: magentaL,
  gemessenMbps: 42,
  datum: "25.07.2026",
  verbindung: "lan",
  kundennummer: "1234567890",
  name: "Erika Mustermann",
  ...aenderungen,
});

// ---------------------------------------------------------------------------
// Der Brief bleibt eine Bitte
// ---------------------------------------------------------------------------

/**
 * Formulierungen, die eine Rechtsausübung oder eine Drohung behaupten.
 *
 * Bewusst großzügig geschnitten: Lieber ein Test, der bei einer harmlosen
 * Umformulierung anschlägt und neu bedacht werden muss, als ein Brief, der
 * mehr behauptet, als eine einzelne Messung hergibt.
 */
const VERBOTENE_WENDUNGEN = [
  "hiermit mindere",
  "mindere ich",
  "minderung",
  "kündige",
  "kündigung",
  "fristlos",
  "außerordentlich",
  "anspruch",
  "schadensersatz",
  "fordere",
  "forderung",
  "verlange",
  "rechtliche schritte",
  "anwalt",
  "frist von",
  "setze ich ihnen",
  "erhebliche abweichung",
  "nachweis erbracht",
];

test("der Brief behauptet keine Rechtsausübung", () => {
  // Über alle Kombinationen, damit keine Variante durchrutscht.
  for (const verbindung of ["lan", "wlan", null]) {
    for (const kundennummer of ["1234567890", null]) {
      for (const name of ["Erika Mustermann", null]) {
        const { betreff, text } = briefBauen(eingabe({ verbindung, kundennummer, name }));
        const alles = `${betreff}\n${text}`.toLowerCase();
        for (const wendung of VERBOTENE_WENDUNGEN) {
          assert.ok(
            !alles.includes(wendung),
            `„${wendung}" darf im Brief nicht vorkommen (verbindung=${verbindung}, kundennummer=${kundennummer}, name=${name})`
          );
        }
      }
    }
  }
});

test("der Brief benennt seine eigene Grenze", () => {
  const { text } = briefBauen(eingabe());
  assert.match(text, /kein förmlicher Nachweis/);
  assert.match(text, /Bundesnetzagentur/);
  assert.match(
    text,
    /einzelne Messung/,
    "der Brief muss selbst sagen, dass eine Messung nicht genügt"
  );
});

test("der Brief bittet um Prüfung, statt etwas zu erklären", () => {
  const { betreff, text } = briefBauen(eingabe());
  assert.match(betreff, /^Bitte um Prüfung meines Anschlusses/);
  assert.match(text, /Ich bitte Sie, meinen Anschluss zu prüfen/);
});

// ---------------------------------------------------------------------------
// Die benannte Abweichung stimmt mit dem Urteil überein
// ---------------------------------------------------------------------------

test("unter der Mindestrate wird die Mindestrate benannt", () => {
  // MagentaZuhause L: Minimum 54 — 42 liegt darunter.
  const { text } = briefBauen(eingabe({ gemessenMbps: 42 }));
  assert.match(text, /liegt unter der für diesen Tarif zugesicherten Mindestrate\./);
});

test("zwischen Minimum und Normalrate wird die Normalrate benannt", () => {
  // MagentaZuhause L: Minimum 54, normalerweise 83,8 — 60 liegt dazwischen.
  const { text } = briefBauen(eingabe({ gemessenMbps: 60 }));
  assert.match(text, /liegt unter der für diesen Tarif normalerweise zur Verfügung stehenden Rate\./);
  assert.ok(!text.includes("Mindestrate."), "die Mindestrate ist hier nicht unterschritten");
});

test("ohne Unterschreitung wird gar keine Abweichung behauptet", () => {
  const { text } = briefBauen(eingabe({ gemessenMbps: 95 }));
  assert.ok(!text.includes("liegt unter der"), "bei gutem Wert keine Abweichungs-Behauptung");
  // Und kein leerer Absatz, wo der Satz gestanden hätte.
  assert.ok(!text.includes("\n\n\n"), "kein leerer Absatz");
});

test("ohne Referenzwerte im Blatt wird nichts behauptet", () => {
  const nurMax = { ...magentaL, download_normal_mbps: null, download_min_mbps: null };
  const { text } = briefBauen(eingabe({ tarif: nurMax, gemessenMbps: 1 }));
  assert.ok(!text.includes("liegt unter der"), "ohne Referenz kein Vorwurf");
});

test("die Abweichung folgt dem Urteil, statt neu gerechnet zu werden", () => {
  // Läuft der Brief anders als das Urteil, widersprechen sich Schirm und Brief.
  for (const mbps of [1, 42, 53.9, 54, 60, 83.7, 83.8, 95, 200]) {
    const { text } = briefBauen(eingabe({ gemessenMbps: mbps }));
    const ton = tarifUrteil(magentaL, mbps);
    if (ton === "unter_min") assert.match(text, /zugesicherten Mindestrate\./, `bei ${mbps}`);
    else if (ton === "unter_norm")
      assert.match(text, /normalerweise zur Verfügung stehenden Rate\.\n/, `bei ${mbps}`);
    else assert.ok(!text.includes("liegt unter der"), `bei ${mbps} darf nichts behauptet werden`);
  }
});

test("keine unbelegte Verstärkung wie „deutlich“", () => {
  // Bei 53,9 gegenüber 54 wäre "deutlich unter" schlicht unwahr — und ein
  // Brief, der von seiner Glaubwürdigkeit lebt, darf sich das nicht leisten.
  const knapp = briefBauen(eingabe({ gemessenMbps: 53.9 })).text;
  assert.match(knapp, /liegt unter der für diesen Tarif zugesicherten Mindestrate\./);
  assert.ok(!knapp.includes("deutlich"), "keine Verstärkung ohne Grundlage");
});

// ---------------------------------------------------------------------------
// Die Zahlen stimmen mit dem Blatt überein
// ---------------------------------------------------------------------------

test("alle drei Raten stehen so im Brief wie im Produktinformationsblatt", () => {
  const { text } = briefBauen(eingabe());
  assert.match(text, /100 Mbit\/s als Maximalrate/);
  assert.match(text, /83\.8 Mbit\/s als normalerweise zur Verfügung stehende Rate/);
  assert.match(text, /54\.0 Mbit\/s als Mindestrate/);
  assert.match(text, /kamen bei mir 42\.0 Mbit\/s an/);
});

test("fehlende Raten werden weggelassen, ohne den Satz zu zerreißen", () => {
  const nurMax = { ...magentaL, download_normal_mbps: null, download_min_mbps: null };
  const { text } = briefBauen(eingabe({ tarif: nurMax }));
  assert.match(text, /im Download 100 Mbit\/s als Maximalrate angegeben\./);
  assert.ok(!text.includes(" und  und "), "keine leeren Aufzählungsglieder");
  assert.ok(!text.includes(", angegeben"), "kein hängendes Komma vor „angegeben“");
});

test("zwei Raten werden mit „und“ verbunden, drei mit Komma und „und“", () => {
  const ohneMin = { ...magentaL, download_min_mbps: null };
  assert.match(
    briefBauen(eingabe({ tarif: ohneMin })).text,
    /100 Mbit\/s als Maximalrate und 83\.8 Mbit\/s als normalerweise/
  );
  assert.match(
    briefBauen(eingabe()).text,
    /Maximalrate, 83\.8 Mbit\/s als normalerweise zur Verfügung stehende Rate und 54\.0 Mbit\/s als Mindestrate/
  );
});

test("die Rundung ist dieselbe wie auf dem Schirm", () => {
  // 49,96 steht auf dem Schirm als "50.0" — der Brief muss dieselbe Zahl
  // nennen, sonst widersprechen sich Ergebnis und Brief.
  const { text } = briefBauen(eingabe({ gemessenMbps: 49.96 }));
  assert.match(text, /kamen bei mir 50\.0 Mbit\/s an/);
  assert.ok(!text.includes("49.96"), "der Rohwert darf nicht im Brief stehen");
});

// ---------------------------------------------------------------------------
// Angaben des Nutzers
// ---------------------------------------------------------------------------

test("Kundennummer steht im Betreff und im Text", () => {
  const { betreff, text } = briefBauen(eingabe());
  assert.match(betreff, /Kundennummer 1234567890/);
  assert.match(text, /meine Kundennummer lautet 1234567890/);
});

test("ohne Kundennummer bleibt der Betreff sauber und der Satz vollständig", () => {
  const { betreff, text } = briefBauen(eingabe({ kundennummer: null }));
  assert.equal(betreff, "Bitte um Prüfung meines Anschlusses");
  assert.match(text, /ich habe bei Ihnen den Tarif „MagentaZuhause L“\./);
  assert.ok(!text.includes("Kundennummer"), "kein leerer Kundennummern-Satz");
});

test("ohne Namen endet der Brief ohne leere Unterschriftszeile", () => {
  const { text } = briefBauen(eingabe({ name: null }));
  assert.ok(text.endsWith("Mit freundlichen Grüßen"), "kein Zeilenumbruch ins Leere");
});

test("der Messweg wird genannt, wenn er bekannt ist — und sonst nicht behauptet", () => {
  assert.match(briefBauen(eingabe({ verbindung: "lan" })).text, /über ein LAN-Kabel direkt am Router/);
  assert.match(briefBauen(eingabe({ verbindung: "wlan" })).text, /über WLAN/);

  const unbekannt = briefBauen(eingabe({ verbindung: null })).text;
  assert.ok(!unbekannt.includes("LAN-Kabel"), "ohne Angabe wird kein Kabel behauptet");
  assert.ok(!unbekannt.includes("über WLAN"), "ohne Angabe wird kein WLAN behauptet");
  assert.match(unbekannt, /kamen bei mir 42\.0 Mbit\/s an\./);
});

test("WLAN wird offen genannt, statt es zu verschweigen", () => {
  // Wer über WLAN gemessen hat und es verschweigt, steht blamiert da, sobald
  // der Anbieter die Leitung prüft und in Ordnung findet.
  const { text } = briefBauen(eingabe({ verbindung: "wlan" }));
  assert.match(text, /gemessen über WLAN/);
});

test("der Tarifname steht wörtlich im Brief", () => {
  // Der Name ist der Grund, warum die Tarifwahl zweistufig ist — er muss
  // ungekürzt beim Anbieter ankommen.
  const { text } = briefBauen(eingabe());
  assert.match(text, /Tarif „MagentaZuhause L“/);
});
