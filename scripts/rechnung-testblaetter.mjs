// Erzeugt Test-Rechnungen für die Genauigkeits-Messung.
//
// Ehrliche Einordnung dessen, was hier entsteht — und was NICHT:
//
//   Diese Blätter sind von uns gebaut. Sie prüfen, ob das Modell den
//   Vertragsnamen zwischen Ablenkern findet und ob er unsere Tarif-Datenbank
//   trifft. Sie prüfen NICHT, ob es echte Anbieter-Layouts versteht — dafür
//   ist nur eine echte Rechnung gut. Die Zahlen aus diesem Satz sind eine
//   UNTERGRENZE für Layout-Vielfalt und sagen für sich genommen nichts über
//   Handyfotos; dafür ist rechnung-fotosimulation.py da.
//
// Die Vorlagen sind absichtlich unbequem gebaut:
//   - Auf jedem Blatt stehen ABLENKER (Router-Miete, TV-Option, Telefonie),
//     die selbst wie Produktnamen aussehen. Das Modell muss den
//     Internet-Tarif erkennen, nicht die einzige Zeile abschreiben.
//   - Drei verschiedene Layouts, damit nicht eine einzige Vorlage gemessen wird.
//   - Die Verträge stammen aus der ECHTEN Datenbank, mit dem Namen, wie ihn
//     eine Rechnung drucken würde (kurz), nicht dem Datenbanknamen (Variante).
//
// Die Wahrheit schreibt dieses Skript selbst: Für jeden Vertrag lässt es den
// echten Abgleich mit einem FEHLERFREIEN Lesen laufen und schreibt dessen
// Ergebnis als Messlatte in die wahrheit.json. So misst die Auswertung
// hinterher genau eines — den Weg vom Bild zum gelesenen Text.
//
// Aufruf:
//   node --experimental-strip-types scripts/rechnung-testblaetter.mjs [--ziel <ordner>]

import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { rechnungAbgleichen } from "../src/lib/tarife/rechnung-abgleich.ts";

const ausfuehren = promisify(execFile);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** A4 bei 150 dpi — die Größenordnung, in der auch ein Handyfoto ankommt. */
const BREITE = 1240;
const HOEHE = 1754;

/**
 * Die Prüfstücke: je Anbieter ein Vertrag, mit dem Namen wie GEDRUCKT.
 *
 * Bewusst gemischt aus Verträgen, die eindeutig sind, und solchen, deren Name
 * mehrere Urteile trägt — der zweite Fall ist der häufigere und der, in dem
 * die App fragen muss statt zu raten.
 */
/**
 * `marke` steht groß im Briefkopf, `firma` klein im Fuß — genau so sind echte
 * Rechnungen gebaut. Der erste Anlauf hatte die Firma in den Briefkopf
 * gesetzt; das Blatt trug dann nirgends das Wort "o2", nur "Telefónica
 * Germany GmbH & Co. OHG". Es hat damit einen echten Mangel unserer
 * Anbieter-Erkennung aufgedeckt (sie kennt keine Firmennamen, nur Marken) —
 * aber als PRÜFSTÜCK war es unrealistisch und hätte diesen Mangel bei jedem
 * weiteren Lauf erneut als "Lesefehler" gezählt. Der Mangel gehört behoben,
 * nicht in die Messreihe eingebaut.
 */
const BLAETTER = [
  { id: "telekom-l", anbieter: "Telekom", marke: "Telekom", firma: "Telekom Deutschland GmbH", gedruckt: "MagentaZuhause L", preis: "44,95", layout: 0 },
  { id: "telekom-m", anbieter: "Telekom", marke: "Telekom", firma: "Telekom Deutschland GmbH", gedruckt: "MagentaZuhause M", preis: "39,95", layout: 1 },
  { id: "vodafone-50", anbieter: "Vodafone", marke: "Vodafone", firma: "Vodafone GmbH", gedruckt: "GigaZuhause 50 DSL", preis: "39,99", layout: 1 },
  { id: "einsundeins-100", anbieter: "1&1", marke: "1&1", firma: "1&1 Telecom GmbH", gedruckt: "1&1 DSL 100", preis: "34,99", layout: 2 },
  { id: "dg-basic-100", anbieter: "Deutsche Glasfaser", marke: "Deutsche Glasfaser", firma: "Deutsche Glasfaser Wholesale GmbH", gedruckt: "DG basic 100", preis: "44,99", layout: 0 },
  { id: "o2-home-s", anbieter: "o2", marke: "o2", firma: "Telefónica Germany GmbH & Co. OHG", gedruckt: "O2 my Home S", preis: "29,99", layout: 2 },
  { id: "pyur-50", anbieter: "PŸUR", marke: "PŸUR", firma: "Tele Columbus AG", gedruckt: "Surf & Phone 50", preis: "24,99", layout: 1 },
];

/**
 * Ablenker — Zeilen, die wie ein Produktname aussehen, aber keiner sind.
 *
 * Ohne sie wäre die Aufgabe trivial: Es gäbe nur eine Zeile mit einem Namen,
 * und ein Modell könnte sie treffen, ohne irgendetwas verstanden zu haben.
 */
const ABLENKER = [
  ["FRITZ!Box 7590 AX (Miete)", "monatlich", 6.99],
  ["Telefonie-Flat ins dt. Festnetz", "monatlich", 0],
  ["HD TV Option Premium", "monatlich", 9.99],
  ["Einrichtungspreis", "einmalig", 69.99],
];

const euro = (n) => `${n.toFixed(2).replace(".", ",")} €`;

/**
 * Der Gesamtbetrag ist die ECHTE Summe, nicht der Tarifpreis.
 *
 * Das ist keine Kosmetik, sondern Teil der Prüfung: Stünde unten derselbe
 * Betrag wie beim Tarif, könnte ein Modell die Summe abschreiben und richtig
 * liegen, ohne die richtige Zeile gefunden zu haben.
 */
const gesamt = (b) =>
  euro(Number(b.preis.replace(",", ".")) + ABLENKER.reduce((s, [, , p]) => s + p, 0));

const kopf = (b) => `
  <div class="firma">${b.marke}</div>
  <div class="absender">${b.firma} · Musterweg 1 · 40213 Düsseldorf</div>
  <div class="empfaenger">
    Herrn<br>Max Mustermann<br>Beispielstraße 12<br>50667 Köln
  </div>
  <div class="meta">
    <div><span>Kundennummer</span><b>4711 8829 03</b></div>
    <div><span>Rechnungsnummer</span><b>2026-06-88213445</b></div>
    <div><span>Rechnungsdatum</span><b>03.06.2026</b></div>
    <div><span>Abrechnungszeitraum</span><b>01.05.–31.05.2026</b></div>
  </div>`;

const posten = (b) => `
  <tr class="haupt"><td>${b.gedruckt}</td><td>monatlich</td><td>${b.preis} €</td></tr>
  ${ABLENKER.map(([t, z, p]) => `<tr><td>${t}</td><td>${z}</td><td>${euro(p)}</td></tr>`).join("\n  ")}`;

/** Drei Layouts — Grundgerüst gleich, Anordnung und Betonung verschieden. */
function html(b) {
  const gemeinsam = `
    * { box-sizing: border-box; }
    body { width:${BREITE}px; height:${HOEHE}px; margin:0; padding:70px 80px;
           font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; font-size:15px; }
    .firma { font-size:22px; font-weight:bold; letter-spacing:-.3px; }
    .absender { font-size:9px; color:#666; border-bottom:1px solid #bbb; padding-bottom:3px; margin:34px 0 10px; }
    .empfaenger { line-height:1.5; margin-bottom:34px; }
    .meta { font-size:12px; }
    .meta div { display:flex; gap:10px; }
    .meta span { display:inline-block; width:150px; color:#555; }
    h1 { font-size:19px; margin:34px 0 6px; }
    table { width:100%; border-collapse:collapse; margin-top:16px; font-size:14px; }
    td, th { padding:9px 6px; text-align:left; }
    td:last-child, th:last-child { text-align:right; white-space:nowrap; }
    tr { border-bottom:1px solid #e2e2e2; }
    .summe td { font-weight:bold; border-top:2px solid #333; border-bottom:none; padding-top:12px; }
    .fuss { position:absolute; bottom:60px; left:80px; right:80px;
            font-size:9.5px; color:#777; line-height:1.6; border-top:1px solid #ddd; padding-top:10px; }`;

  const stil = [
    // 0 — nüchtern, der Tarif steht als eigene Zeile über der Tabelle
    `${gemeinsam}
     .haupt td { font-weight:bold; }
     .tarifzeile { margin-top:26px; padding:12px 14px; background:#f4f4f4; border-left:4px solid #666; font-size:15px; }`,
    // 1 — Tabellenkopf grau, Tarif nur in der Tabelle
    `${gemeinsam}
     th { background:#ececec; font-size:12px; text-transform:uppercase; letter-spacing:.4px; }
     .haupt td { font-weight:bold; }`,
    // 2 — kompakt, kleinere Schrift, Tarif im Fließtext darüber
    `${gemeinsam}
     body { font-size:13.5px; padding:60px 70px; }
     table { font-size:12.5px; }
     .vertragstext { margin-top:24px; line-height:1.7; }`,
  ][b.layout];

  const koerper = [
    `<div class="tarifzeile">Ihr Tarif: <b>${b.gedruckt}</b></div>
     <h1>Ihre Rechnung im Überblick</h1>
     <table>${posten(b)}
       <tr class="summe"><td>Gesamtbetrag (inkl. 19 % USt.)</td><td></td><td>${gesamt(b)}</td></tr>
     </table>`,
    `<h1>Rechnung Mai 2026</h1>
     <table>
       <tr><th>Leistung</th><th>Zeitraum</th><th>Betrag</th></tr>
       ${posten(b)}
       <tr class="summe"><td>Gesamtbetrag (inkl. 19 % USt.)</td><td></td><td>${gesamt(b)}</td></tr>
     </table>`,
    `<div class="vertragstext">
       Vielen Dank, dass Sie sich für <b>${b.gedruckt}</b> entschieden haben.
       Nachfolgend finden Sie die Abrechnung Ihres Anschlusses für den vergangenen Monat.
     </div>
     <table>${posten(b)}
       <tr class="summe"><td>Gesamtbetrag (inkl. 19 % USt.)</td><td></td><td>${gesamt(b)}</td></tr>
     </table>`,
  ][b.layout];

  return `<!doctype html><html lang="de"><meta charset="utf-8"><style>${stil}</style><body>
${kopf(b)}
${koerper}
<div class="fuss">
  ${b.firma} · Sitz Düsseldorf · Amtsgericht Düsseldorf HRB 00000 · USt-IdNr. DE000000000<br>
  Bankverbindung: IBAN DE00 0000 0000 0000 0000 00 · BIC XXXXDEFFXXX ·
  Der Rechnungsbetrag wird per SEPA-Lastschrift eingezogen.
</div></body></html>`;
}

// ------------------------------------------------------------------ Erzeugen

const ziel = (() => {
  const i = process.argv.indexOf("--ziel");
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : "prototype/data/rechnungen-test";
})();

const tarifDaten = JSON.parse(
  await readFile(new URL("../src/lib/tarife/tarife.generated.json", import.meta.url), "utf8")
);

await mkdir(ziel, { recursive: true });
const tmp = join(ziel, ".html");
await mkdir(tmp, { recursive: true });

const wahrheit = {};

for (const b of BLAETTER) {
  const htmlDatei = join(tmp, `${b.id}.html`);
  await writeFile(htmlDatei, html(b), "utf8");

  await ausfuehren(CHROME, [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    // Doppelte Punktdichte: Das Blatt entsteht in ~300 dpi statt 150. Die
    // Foto-Simulation verkleinert anschließend — und verkleinern von einer
    // scharfen Vorlage ergibt ein anderes Bild als von einer bereits groben.
    // Genau so entsteht auch ein Handyfoto.
    "--force-device-scale-factor=2",
    `--window-size=${BREITE},${HOEHE}`,
    `--screenshot=${join(ziel, `${b.id}.png`)}`,
    `file://${join(process.cwd(), htmlDatei)}`,
  ]);

  // Die Messlatte: Was käme heraus, wenn das Modell FEHLERFREI läse?
  const basis = rechnungAbgleichen(tarifDaten, { anbieter: b.anbieter, tarifname: b.gedruckt });
  const slugs = basis.klassen.flatMap((k) => k.namensWahl.map((t) => t.slug));

  if (slugs.length === 0) {
    console.warn(`! ${b.id}: "${b.gedruckt}" trifft die Datenbank nicht — als Prüfstück untauglich.`);
    continue;
  }

  wahrheit[`${b.id}.png`] = {
    anbieter: b.anbieter,
    gedruckt: b.gedruckt,
    slugs,
    // Nur zur Einordnung beim Lesen der Ergebnisse, wird nicht ausgewertet.
    erwartet: basis.lage,
  };

  console.log(`${b.id.padEnd(18)} ${basis.lage.padEnd(11)} ${basis.klassen.length} Klasse(n), ${slugs.length} Vertrag/Verträge`);
}

await writeFile(join(ziel, "wahrheit.json"), `${JSON.stringify(wahrheit, null, 2)}\n`, "utf8");
await rm(tmp, { recursive: true, force: true });

console.log(`\n${Object.keys(wahrheit).length} Blätter in ${ziel}/ — Wahrheit steht in wahrheit.json`);
