// Genauigkeits-Messung für den Rechnungs-Scan.
//
// Schickt jede Datei eines Ordners durch GENAU DENSELBEN Weg, den die App
// geht — Eingangskontrolle, Extraktion, Abgleich mit der Tarif-Datenbank —
// und hält das Ergebnis gegen die Wahrheit, die daneben liegt. Kein
// nachgebauter Prüfpfad: Wäre er nachgebaut, würde er irgendwann etwas
// anderes messen als das, was der Nutzer erlebt.
//
// Zwei Fragen werden GETRENNT beantwortet, weil sie verschiedene Reparaturen
// nach sich ziehen:
//
//   1. Hat das Modell richtig GELESEN?   → falsch heißt: Modell oder Prompt
//   2. Wo LANDET der Nutzer am Ende?     → falsch heißt: Tarif-Datenbank
//
// Und die Landungen werden nach ihrer GEFÄHRLICHKEIT sortiert, nicht nach
// einer nackten Trefferquote:
//
//   richtig            — der Nutzer bekommt sein Urteil, ein oder zwei Taps
//   FALSCH             — er bekommt ein Urteil zu einem fremden Vertrag,
//                        ohne es erkennen zu können. Das ist der einzige
//                        Ausgang, der wirklich schadet.
//   ehrlich aufgegeben — der Scan sagt "kann ich nicht lesen" und schickt
//                        ihn in die normale Auswahl. Ärgerlich, harmlos.
//
// Eine Trefferquote von 90 % mit 10 % FALSCH ist unbrauchbar; 60 % mit 0 %
// FALSCH und 40 % ehrlichem Aufgeben ist verwendbar. Deshalb zählt dieses
// Skript getrennt.
//
// Aufruf:
//   node --experimental-strip-types scripts/rechnung-genauigkeit.mjs \
//     --ordner <pfad> [--modell <id>]
//
// Den API-Schlüssel holt sich das Skript selbst aus .env.local (siehe unten)
// — er steht damit nie in der Kommandozeile und landet in keinem Protokoll.
//
// Der Ordner enthält die Bilder/PDFs und eine wahrheit.json:
//
//   { "foto1.jpg": {
//       "anbieter":  "Telekom",
//       "gedruckt":  "MagentaZuhause L",
//       "slugs":     ["magentazuhause-l-2-vdsl-100"]
//   } }
//
// "gedruckt" ist der Name, wie er auf dem Blatt STEHT — daran wird gemessen,
// ob das Modell richtig gelesen hat. "slugs" sind die Verträge, bei denen der
// Nutzer landen MUSS; daran wird gemessen, ob er sein richtiges Urteil bekommt.
//
// Warum beides und nicht nur der Name: Auf Rechnungen steht der kurze Name
// ("MagentaZuhause M"), in der Datenbank stehen Varianten
// ("MagentaZuhause M All-Net -50- VDSL"). Ein reiner Namensvergleich würde
// deshalb richtige Zuordnungen als Fehler zählen. Fehlt "slugs", wird
// ersatzweise exakt nach dem Namen gesucht.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { dateiPruefen } from "../src/lib/rechnung/dateipruefung.ts";
import { MODELL, rechnungLesen, scanVerfuegbar } from "../src/lib/rechnung/extraktion.ts";
import { normalisieren, rechnungAbgleichen } from "../src/lib/tarife/rechnung-abgleich.ts";

// Umgebung genauso laden, wie die App es tut: Node liest die Datei selbst.
// Der Schlüssel geht damit direkt vom Dateisystem in den Prozess — nicht über
// die Kommandozeile, nicht über eine Shell-Variable, nicht in ein Protokoll.
//
// Das steht NACH den Importen, weil `import` in JavaScript ohnehin immer
// zuerst ausgeführt wird — eine Zeile weiter oben würde daran nichts ändern.
// Es trägt trotzdem, weil extraktion.ts den Schlüssel erst beim ersten Aufruf
// nachschlägt und nicht beim Laden (siehe `clientHolen` dort).
try {
  process.loadEnvFile(".env.local");
} catch {
  /* keine .env.local — dann muss ANTHROPIC_API_KEY schon gesetzt sein */
}

const WAHRHEIT_DATEI = "wahrheit.json";

/**
 * Listenpreise je Million Token (Stand 2026-07-25, USD).
 *
 * Sonnet 5 läuft bis 31.08.2026 zu einem Einführungspreis von 2 / 10 — hier
 * steht bewusst der REGULÄRE Preis, damit die Entscheidung auch nach dem
 * Stichtag noch trägt.
 */
const PREISE = {
  "claude-opus-5": { eingabe: 5, ausgabe: 25 },
  "claude-sonnet-5": { eingabe: 3, ausgabe: 15 },
  "claude-haiku-4-5": { eingabe: 1, ausgabe: 5 },
};

function argument(name, standard) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : standard;
}

/**
 * Die Verträge, bei denen der Nutzer landen muss.
 *
 * Bevorzugt die ausdrücklich hinterlegten `slugs`; nur wenn keine da sind,
 * wird ersatzweise exakt nach dem gedruckten Namen gesucht.
 */
function sollSlugs(daten, soll) {
  if (Array.isArray(soll.slugs) && soll.slugs.length > 0) return new Set(soll.slugs);
  const zielName = normalisieren(soll.gedruckt ?? "");
  const zielAnbieter = normalisieren(soll.anbieter);
  return new Set(
    daten.tarife
      .filter((t) => normalisieren(t.anbieter) === zielAnbieter && normalisieren(t.tarifname) === zielName)
      .map((t) => t.slug)
  );
}

/** Enthält diese Klasse den gesuchten Vertrag? */
const klasseTrifft = (klasse, slugs) => klasse.namensWahl.some((t) => slugs.has(t.slug));

/**
 * Wo landet der Nutzer — und ist das richtig?
 *
 * Spiegelt die Verzweigung aus scan-fluss.ts wider, aber auf der Datenlage
 * der Route: dieselben vier Lagen, dieselbe Reihenfolge.
 */
function landung(abgleich, slugs) {
  if (abgleich.lage === "kein_anbieter") return { art: "kein_anbieter", gut: null };
  if (abgleich.lage === "kein_tarif") return { art: "kein_tarif", gut: null };

  if (abgleich.lage === "eindeutig") {
    const treffer = klasseTrifft(abgleich.klassen[0], slugs);
    return { art: treffer ? "eindeutig_richtig" : "eindeutig_FALSCH", gut: treffer };
  }

  const treffer = abgleich.klassen.some((k) => klasseTrifft(k, slugs));
  return {
    art: treffer ? `rueckfrage_richtig(${abgleich.klassen.length})` : "rueckfrage_FALSCH",
    gut: treffer,
  };
}

const tarifDaten = JSON.parse(
  await readFile(new URL("../src/lib/tarife/tarife.generated.json", import.meta.url), "utf8")
);

const ordner = argument("ordner", "prototype/data/rechnungen-echt");
const modell = argument("modell", MODELL);

if (!scanVerfuegbar()) {
  console.error(
    "ANTHROPIC_API_KEY ist nicht gesetzt.\n" +
      "Aufruf mit: node --experimental-strip-types --env-file=.env.local ..."
  );
  process.exit(1);
}
if (!PREISE[modell]) {
  console.warn(`! Für "${modell}" ist kein Preis hinterlegt — die Kostenspalte bleibt leer.\n`);
}

let wahrheit;
try {
  wahrheit = JSON.parse(await readFile(join(ordner, WAHRHEIT_DATEI), "utf8"));
} catch {
  console.error(`Keine ${WAHRHEIT_DATEI} in ${ordner} — ohne Wahrheit ist nichts zu messen.`);
  process.exit(1);
}

const dateien = (await readdir(ordner))
  .filter((d) => d !== WAHRHEIT_DATEI && !d.startsWith("."))
  .sort();

if (dateien.length === 0) {
  console.error(`${ordner} enthält keine Dateien.`);
  process.exit(1);
}

console.log(`Modell:  ${modell}`);
console.log(`Ordner:  ${ordner} (${dateien.length} Dateien)\n`);

const zeilen = [];
let eingabeTokens = 0;
let ausgabeTokens = 0;
// Jeder abgeschickte Aufruf zählt — auch der, bei dem das Modell "das ist
// keine Rechnung" antwortet. Bezahlt wird die Anfrage, nicht der Erfolg.
let aufrufe = 0;

for (const datei of dateien) {
  const soll = wahrheit[datei];
  if (!soll) {
    zeilen.push({ datei, lesen: "—", landung: "ohne Wahrheit", uebersprungen: true });
    continue;
  }

  const bytes = new Uint8Array(await readFile(join(ordner, datei)));

  // Ebene 1 — dieselbe Eingangskontrolle wie in der Route. Was hier
  // durchfällt, hat der Nutzer nie an das Modell geschickt.
  const pruefung = dateiPruefen(bytes);
  if (!pruefung.ok) {
    zeilen.push({ datei, lesen: "—", landung: `abgelehnt:${pruefung.grund}`, gut: null });
    process.stdout.write(`  ${datei}: abgelehnt (${pruefung.grund})\n`);
    continue;
  }

  // Ebene 2 — der bezahlte Aufruf.
  aufrufe += 1;
  const gelesen = await rechnungLesen(bytes, pruefung.typ, modell);
  if (!gelesen.ok) {
    zeilen.push({ datei, lesen: "—", landung: `fehler:${gelesen.fehler}`, gut: null });
    process.stdout.write(`  ${datei}: Fehler (${gelesen.fehler})\n`);
    continue;
  }

  eingabeTokens += gelesen.verbrauch.eingabeTokens;
  ausgabeTokens += gelesen.verbrauch.ausgabeTokens;
  const { angaben } = gelesen;

  if (!angaben.istRechnung) {
    zeilen.push({ datei, lesen: "—", landung: "keine_rechnung", gut: null });
    process.stdout.write(`  ${datei}: als "keine Rechnung" eingestuft\n`);
    continue;
  }

  // Frage 1 — hat es richtig gelesen? Verglichen wird mit derselben
  // Normalisierung, die auch der Abgleich benutzt; Groß-/Kleinschreibung und
  // Schreibweise von "1&1" oder "PŸUR" sollen nicht als Fehler zählen.
  const anbieterGelesen = angaben.anbieter && normalisieren(angaben.anbieter).includes(normalisieren(soll.anbieter));
  const nameGelesen = angaben.tarifname && normalisieren(angaben.tarifname) === normalisieren(soll.gedruckt ?? "");
  const lesen = `${anbieterGelesen ? "A" : "a"}${nameGelesen ? "N" : "n"}`;

  // Ebene 3 — Abgleich mit der Tarif-Datenbank, exakt wie die Route ihn macht.
  const abgleich = rechnungAbgleichen(tarifDaten, {
    anbieter: angaben.anbieter,
    tarifname: angaben.tarifname,
  });

  const slugs = sollSlugs(tarifDaten, soll);
  if (slugs.size === 0) {
    // Nicht dem Modell anlasten: Der Vertrag steht schlicht nicht in unserer
    // Datenbank. Getrennt ausweisen, sonst sieht ein Datenlücken-Problem wie
    // ein Lesefehler aus.
    zeilen.push({ datei, lesen, landung: "nicht_in_datenbank", gut: null, datenluecke: true });
    process.stdout.write(`  ${datei}: [${lesen}] "${soll.gedruckt}" steht nicht in der Datenbank\n`);
    continue;
  }

  const wo = landung(abgleich, slugs);
  zeilen.push({ datei, lesen, landung: wo.art, gut: wo.gut, gelesenerName: angaben.tarifname });
  process.stdout.write(
    `  ${datei}: [${lesen}] ${wo.art}` +
      (wo.gut === false ? `  ← gelesen: "${angaben.tarifname ?? "—"}"` : "") +
      "\n"
  );
}

// ---------------------------------------------------------------- Auswertung

const gewertet = zeilen.filter((z) => !z.uebersprungen && !z.datenluecke);
const zaehle = (pruefung) => gewertet.filter(pruefung).length;

const richtig = zaehle((z) => z.gut === true);
const falsch = zaehle((z) => z.gut === false);
const aufgegeben = zaehle((z) => z.gut === null);
const einTap = zaehle((z) => z.landung === "eindeutig_richtig");

const anteil = (n) => (gewertet.length ? `${((n / gewertet.length) * 100).toFixed(0)} %` : "—");

console.log(`\n${"─".repeat(60)}`);
console.log(`Gewertet: ${gewertet.length} Dateien` + (zeilen.length > gewertet.length ? `  (${zeilen.length - gewertet.length} ohne Wertung: Datenlücke oder keine Wahrheit)` : ""));
console.log(`${"─".repeat(60)}`);
console.log(`  richtig                ${String(richtig).padStart(3)}   ${anteil(richtig).padStart(5)}   davon ${einTap} mit einem Tap`);
console.log(`  FALSCH                 ${String(falsch).padStart(3)}   ${anteil(falsch).padStart(5)}   ← der einzige schädliche Ausgang`);
console.log(`  ehrlich aufgegeben     ${String(aufgegeben).padStart(3)}   ${anteil(aufgegeben).padStart(5)}   führt in die normale Auswahl`);

const nachLandung = {};
for (const z of zeilen) nachLandung[z.landung] = (nachLandung[z.landung] ?? 0) + 1;
console.log(`\nAusgänge im Einzelnen:`);
for (const [art, n] of Object.entries(nachLandung).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${art.padEnd(28)} ${n}`);
}

const preis = PREISE[modell];
if (preis && (eingabeTokens || ausgabeTokens)) {
  const kosten = (eingabeTokens / 1e6) * preis.eingabe + (ausgabeTokens / 1e6) * preis.ausgabe;
  console.log(
    `\nKosten:  ${(kosten * 100).toFixed(1)} ct gesamt für ${aufrufe} Aufrufe` +
      (aufrufe ? `  →  ${((kosten / aufrufe) * 100).toFixed(2)} ct je Scan` : "") +
      `\n         (${eingabeTokens} Token hinein, ${ausgabeTokens} hinaus)`
  );
}

console.log(`\nLesespalte: A/a = Anbieter richtig/falsch, N/n = Vertragsname richtig/falsch.`);
