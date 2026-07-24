#!/usr/bin/env node
// Sammelt die offiziellen Produktinformationsblätter (PIB) der Anbieter und
// schreibt die sechs gesetzlichen Geschwindigkeits-Werte + Preis in eine im
// Repo versionierte Tarif-Tabelle.
//
// Rechtsgrundlage der Quelle: § 1 TK-Transparenzverordnung verpflichtet jeden
// Anbieter, genau diese Werte je Tarif zu veröffentlichen — die PIBs sind
// damit die wasserdichte, zitierfähige Quelle für "was steht dir zu".
//
// Wiederholbar: `node scripts/tarife-sammeln.mjs` — überschreibt die
// generierte Datei samt Stand-Datum. Scheitert LAUT, wenn Blätter nicht
// vollständig lesbar sind (keine stillen Lücken).
//
// Voraussetzung: `pdftotext` (poppler) — auf dem Mac: `brew install poppler`.

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

const AUSGABE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src/lib/tarife/tarife.generated.json"
);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Speedrecht-Tarifsammler";

// ---------------------------------------------------------------------------
// Anbieter-Adapter: Telekom
// ---------------------------------------------------------------------------

const TELEKOM = {
  anbieter: "Telekom",
  index: "https://www.telekom.de/produktinformationsblatt",
  basis: "https://www.telekom.de/produktinformationsblatt/",

  // Kern-Internet-Tarife: aktuelle Blätter (ohne Datums-Slug = aktuelle
  // Version), ohne TV-Bündel (gleiche Geschwindigkeiten), ohne Hybrid/Regio.
  // "MagentaZuhause Basic" ist trotz Namens ein Mobilfunk-Produkt (Internet
  // über Funk am festen Standort) — kein Festnetz-Tarif, daher außen vor.
  slugAuswahl(alleSlugs) {
    return alleSlugs.filter(
      (s) =>
        !/[0-9]{8}/.test(s) &&
        !/magentatv|hybrid|regio|inhalte|basic/.test(s) &&
        /^(magentazuhause-(start|s|m|l|xl|giga)|glasfaser-[0-9])/.test(s)
    );
  },
};

const ADAPTER = [TELEKOM];

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------

async function holen(url, alsPuffer = false, versuch = 1) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return alsPuffer ? Buffer.from(await res.arrayBuffer()) : await res.text();
  } catch (err) {
    if (versuch < 3) {
      await new Promise((r) => setTimeout(r, 1_500 * versuch));
      return holen(url, alsPuffer, versuch + 1);
    }
    throw new Error(`${url}: ${err.message}`);
  }
}

/** Deutsche Zahl ("83,8", "1.000", "48,95") → JS-Zahl. */
function zahl(text) {
  return Number(text.replace(/\./g, "").replace(",", "."));
}

function technologieAusSlug(slug) {
  if (/ftth/.test(slug)) return "glasfaser";
  if (/g-fast/.test(slug)) return "glasfaser-gfast";
  if (/s?vdsl/.test(slug)) return "vdsl";
  if (/dsl/.test(slug)) return "dsl";
  return "unbekannt";
}

/** Liest die relevanten Felder aus dem PIB-Text (pdftotext -layout). */
function pibParsen(text, slug) {
  const rate = (zeile) => {
    const m = text.match(
      new RegExp(`^\\s*${zeile}\\s+([\\d.,]+)\\s*MBit/s\\s+([\\d.,]+)\\s*MBit/s`, "m")
    );
    return m ? { download: zahl(m[1]), upload: zahl(m[2]) } : null;
  };

  const max = rate("Maximal");
  const normal = rate("Normalerweise zur Verfügung stehend");
  const min = rate("Minimal");

  const preisM = text.match(/Komplettprodukt[\s\S]{0,200}?([\d.]*\d,\d{2})\s*EUR/);
  const standM = text.match(/Versionsstand:\s*(\d{2})\.(\d{2})\.(\d{4})/);

  // Tarifname: erste nicht-leere Zeile nach der Kopfzeile.
  const zeilen = text.split("\n").map((z) => z.trim());
  const kopfIndex = zeilen.findIndex((z) => z.startsWith("Produktinformationsblatt"));
  const tarifname = zeilen.slice(kopfIndex + 1).find((z) => z.length > 0) ?? null;
  const zugangM = text.match(/Internet-Zugang\s+([A-Za-z.\- ]*\d[\d.]*)/);

  const fehlend = [];
  if (!max) fehlend.push("Maximal");
  if (!normal) fehlend.push("Normalerweise");
  if (!min) fehlend.push("Minimal");
  if (!preisM) fehlend.push("Preis");
  if (!standM) fehlend.push("Versionsstand");
  if (!tarifname) fehlend.push("Tarifname");
  if (fehlend.length) return { fehler: fehlend.join(", ") };

  return {
    tarif: {
      tarifname,
      zugang: zugangM ? zugangM[1].trim() : null,
      technologie: technologieAusSlug(slug),
      download_max_mbps: max.download,
      download_normal_mbps: normal.download,
      download_min_mbps: min.download,
      upload_max_mbps: max.upload,
      upload_normal_mbps: normal.upload,
      upload_min_mbps: min.upload,
      monatspreis_eur: zahl(preisM[1]),
      versionsstand: `${standM[3]}-${standM[2]}-${standM[1]}`,
    },
  };
}

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------

try {
  await execFileAsync("pdftotext", ["-v"]);
} catch {
  console.error("❌ pdftotext fehlt — bitte `brew install poppler` ausführen.");
  process.exit(1);
}

const tarife = [];
const fehlgeschlagen = [];

for (const adapter of ADAPTER) {
  console.log(`\n=== ${adapter.anbieter} ===`);
  const indexHtml = await holen(adapter.index);
  const alleSlugs = [
    ...new Set(
      [...indexHtml.matchAll(/href="\/produktinformationsblatt\/([^"]+)"/g)].map(
        (m) => m[1]
      )
    ),
  ];
  const slugs = adapter.slugAuswahl(alleSlugs).sort();
  console.log(`${alleSlugs.length} Blätter gefunden, ${slugs.length} Kern-Tarife ausgewählt`);

  const arbeitsOrdner = await mkdtemp(path.join(tmpdir(), "speedrecht-pib-"));

  for (const slug of slugs) {
    const url = adapter.basis + slug;
    try {
      const pdf = await holen(url, true);
      const pdfPfad = path.join(arbeitsOrdner, `${slug}.pdf`);
      await writeFile(pdfPfad, pdf);
      const { stdout } = await execFileAsync(
        "pdftotext",
        ["-layout", pdfPfad, "-"],
        { maxBuffer: 10 * 1024 * 1024, encoding: "utf8" }
      );
      const ergebnis = pibParsen(stdout, slug);
      if (ergebnis.fehler) {
        fehlgeschlagen.push({ slug, fehler: ergebnis.fehler });
        console.warn(`⚠️  ${slug}: unvollständig (${ergebnis.fehler})`);
      } else {
        tarife.push({ anbieter: adapter.anbieter, slug, quelle_url: url, ...ergebnis.tarif });
        console.log(
          `✓ ${ergebnis.tarif.tarifname} — ↓${ergebnis.tarif.download_max_mbps}/↑${ergebnis.tarif.upload_max_mbps} MBit/s, ${ergebnis.tarif.monatspreis_eur} €`
        );
      }
    } catch (err) {
      fehlgeschlagen.push({ slug, fehler: err.message });
      console.warn(`⚠️  ${slug}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 300)); // höflich bleiben
  }

  await rm(arbeitsOrdner, { recursive: true, force: true });
}

// Laut scheitern statt still lückenhaft sein.
if (fehlgeschlagen.length > 0) {
  console.error(
    `\n❌ ${fehlgeschlagen.length} Blatt/Blätter nicht vollständig lesbar — Parser oder Auswahl korrigieren. Abbruch ohne Schreiben.`
  );
  process.exit(1);
}
if (tarife.length < 30) {
  console.error(`\n❌ Nur ${tarife.length} Tarife — das ist zu wenig. Abbruch ohne Schreiben.`);
  process.exit(1);
}

const daten = {
  stand: new Date().toISOString().slice(0, 10),
  quelle:
    "Offizielle Produktinformationsblätter der Anbieter (§ 1 TK-Transparenzverordnung)",
  tarife,
};

await writeFile(AUSGABE, JSON.stringify(daten, null, 1));
console.log(`\nGeschrieben: ${AUSGABE}\n${tarife.length} Tarife, Stand ${daten.stand}`);
