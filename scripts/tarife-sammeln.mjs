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
// generierte Datei samt Stand-Datum. Scheitert LAUT, wenn Blätter mit einer
// Geschwindigkeits-Tabelle nicht vollständig lesbar sind (keine stillen
// Lücken). Blätter ohne solche Tabelle (reine Telefonie, TV) werden gezählt
// und benannt übersprungen.
//
// Optionen:
//   --nur=Telekom,o2   nur diese Anbieter einlesen
//   --frisch           Zwischenspeicher übergehen und alles neu laden
//
// Voraussetzung: `pdftotext` (poppler) — auf dem Mac: `brew install poppler`.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import path from "node:path";

import { pibAuswerten } from "./lib/pib-parser.mjs";

const execFileAsync = promisify(execFile);

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUSGABE = path.join(WURZEL, "src/lib/tarife/tarife.generated.json");
const LISTEN = path.join(WURZEL, "scripts/pib-listen");
const CACHE = path.join(tmpdir(), "speedrecht-pib-cache");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Speedrecht-Tarifsammler";

// Wie viele Blätter gleichzeitig geladen werden. Bewusst niedrig — wir sind
// Gast auf fremden Servern.
const PARALLEL = 5;

const argumente = process.argv.slice(2);
const FRISCH = argumente.includes("--frisch");
const NUR = argumente
  .find((a) => a.startsWith("--nur="))
  ?.slice("--nur=".length)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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
    if (!alsPuffer) return await res.text();
    const typ = res.headers.get("content-type") ?? "";
    const puffer = Buffer.from(await res.arrayBuffer());
    // Manche Anbieter antworten auf tote PDF-Adressen mit einer HTML-Seite.
    if (!typ.includes("pdf") && puffer.subarray(0, 5).toString() !== "%PDF-") {
      throw new Error(`kein PDF (${typ || "ohne Typ"})`);
    }
    return puffer;
  } catch (err) {
    if (versuch < 3) {
      await new Promise((r) => setTimeout(r, 1_500 * versuch));
      return holen(url, alsPuffer, versuch + 1);
    }
    throw new Error(err.message);
  }
}

/** Lädt ein PDF und gibt seinen Text zurück — mit Zwischenspeicher. */
async function pdfText(url) {
  const name = createHash("sha1").update(url).digest("hex");
  const pdfPfad = path.join(CACHE, `${name}.pdf`);

  if (FRISCH || !existsSync(pdfPfad)) {
    await writeFile(pdfPfad, await holen(url, true));
  }
  const { stdout } = await execFileAsync("pdftotext", ["-layout", pdfPfad, "-"], {
    maxBuffer: 20 * 1024 * 1024,
    encoding: "utf8",
  });
  return stdout;
}

/** Führt `arbeit` für alle Einträge aus, höchstens PARALLEL gleichzeitig. */
async function nacheinanderMitTempo(eintraege, arbeit) {
  const ergebnisse = new Array(eintraege.length);
  let naechster = 0;
  async function arbeiter() {
    while (naechster < eintraege.length) {
      const i = naechster++;
      ergebnisse[i] = await arbeit(eintraege[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, eintraege.length) }, arbeiter)
  );
  return ergebnisse;
}

/** Alle <a href> samt Beschriftung aus einer HTML-Seite. */
function verweise(html, basis) {
  const gefunden = [];
  for (const treffer of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let url = treffer[1];
    try {
      url = new URL(url, basis).href;
    } catch {
      continue;
    }
    gefunden.push({
      url,
      text: treffer[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
    });
  }
  return gefunden;
}

function eindeutig(blaetter) {
  const gesehen = new Set();
  return blaetter.filter((b) => !gesehen.has(b.url) && gesehen.add(b.url));
}

/** Letzter echter Pfad-Abschnitt — o2 hängt an seine Adressen einen Schrägstrich. */
function dateiname(url) {
  const teile = new URL(url).pathname.split("/").filter(Boolean);
  return decodeURIComponent(teile[teile.length - 1] ?? "");
}

/** Dateiname → kurzer, stabiler Bezeichner. */
function slugAusUrl(url) {
  return (
    dateiname(url)
      .replace(/\.pdf$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 120) || "blatt"
  );
}

async function listeLesen(datei) {
  const roh = JSON.parse(await readFile(path.join(LISTEN, datei), "utf8"));
  return roh.blaetter.map((b) => ({ url: b.url, text: b.titel }));
}

// ---------------------------------------------------------------------------
// Anbieter-Adapter
//
// `anbieter` muss BUCHSTABENGENAU einem Eintrag aus FESTNETZ_ANBIETER
// entsprechen (src/lib/netz/anbieter.ts) — nur dann findet der Ergebnis-Screen
// zum erkannten Anbieter auch die Tarife. Das wird unten hart geprüft.
// ---------------------------------------------------------------------------

const TELEKOM = {
  anbieter: "Telekom",
  // Kern-Internet-Tarife: aktuelle Blätter (ohne Datums-Slug = aktuelle
  // Version), ohne TV-Bündel (gleiche Geschwindigkeiten), ohne Hybrid/Regio.
  // "MagentaZuhause Basic" ist trotz Namens ein Mobilfunk-Produkt (Internet
  // über Funk am festen Standort) — kein Festnetz-Tarif, daher außen vor.
  async blaetter() {
    const basis = "https://www.telekom.de/produktinformationsblatt/";
    const html = await holen("https://www.telekom.de/produktinformationsblatt");
    const slugs = [
      ...new Set(
        [...html.matchAll(/href="\/produktinformationsblatt\/([^"]+)"/g)].map((m) => m[1])
      ),
    ]
      .filter(
        (s) =>
          !/[0-9]{8}/.test(s) &&
          !/magentatv|hybrid|regio|inhalte|basic/.test(s) &&
          /^(magentazuhause-(start|s|m|l|xl|giga)|glasfaser-[0-9])/.test(s)
      )
      .sort();
    // Telekom-Bezeichner bleiben der Pfad-Abschnitt — so wie bisher.
    return slugs.map((s) => ({ url: basis + s, slug: s }));
  },
};

const VODAFONE = {
  anbieter: "Vodafone",
  // Die Übersicht baut ihre Liste per JavaScript auf; die Adressen liegen
  // daher als eingecheckte Liste vor (scripts/pib-listen/README.md).
  blaetter: () => listeLesen("vodafone.json"),
};

const PYUR = {
  anbieter: "PŸUR",
  blaetter: () => listeLesen("pyur.json"),
};

const O2 = {
  anbieter: "o2",
  // o2 mischt Mobilfunk und Festnetz auf einer Seite. Zwei Siebe: grob über
  // die Linkbeschriftung, fein über das Blatt selbst — o2 kennzeichnet
  // Festnetz-Produkte im Titel mit "(Festnetz)".
  nurWenn: (text) => /\(Festnetz\)/i.test(text),
  async blaetter() {
    const seiten = [
      "https://www.o2online.de/recht/produktinformationsblatt/",
      "https://www.o2online.de/recht/produktinformationsblatt-archiv/",
    ];
    const alle = [];
    for (const seite of seiten) {
      const html = await holen(seite);
      alle.push(
        ...verweise(html, seite).filter(
          (v) =>
            /\.pdf|\/blobs\/pdfs\//i.test(v.url) &&
            /home|dsl|kabel|glasfaser|festnetz/i.test(v.text) &&
            !/mobile|prepaid|callya|to-go|blue/i.test(v.text)
        )
      );
    }
    return eindeutig(alle);
  },
};

const EINSUNDEINS = {
  anbieter: "1&1",
  // Das Hilfe-Center liefert seine Verweise nicht als gewöhnliche <a>-Tags,
  // sondern JSON-verpackt und maskiert ("\u003ca href=\"…\""). Darum werden
  // die Adressen hier direkt aus dem Quelltext gezogen. Beide Seiten führen
  // ausschließlich PIBs, ein Sieb über die Beschriftung erübrigt sich.
  async blaetter() {
    const seiten = [
      "https://hilfe-center.1und1.de/produktinformationen-dsl",
      "https://hilfe-center.1und1.de/produktinformationen-glasfaser",
    ];
    const alle = [];
    for (const seite of seiten) {
      const html = await holen(seite);
      alle.push(
        ...[
          ...html.matchAll(
            /https:\/\/(?:assets\.eu\.ctfassets\.net|content\.1und1\.de)\/[^\s"'\\]+\.pdf/gi
          ),
        ].map((m) => ({ url: m[0], text: m[0].split("/").pop() }))
      );
    }
    // 1&1 veröffentlicht dieselben Blätter doppelt — einmal über den
    // eigenen Server, einmal über ein CDN. Gleicher Dateiname = gleiches
    // Blatt; sonst stünde jeder Tarif zweimal in der Auswahl.
    const gesehen = new Set();
    return alle.filter((b) => {
      const name = dateiname(b.url).toLowerCase();
      return !gesehen.has(name) && gesehen.add(name);
    });
  },
};

// Deutsche Glasfaser verschleiert die Adressen auf der Download-Seite durch
// eine Zeichenverschiebung um 3 Stellen im druckbaren ASCII-Bereich
// ("kwwsv=22…" → "https://…"). Zurückdrehen liefert die echten Adressen.
function dgEntschluesseln(text) {
  return text.replace(/[\x21-\x7e]/g, (z) =>
    String.fromCharCode(((z.charCodeAt(0) - 33 - 3 + 94) % 94) + 33)
  );
}

const DEUTSCHE_GLASFASER = {
  anbieter: "Deutsche Glasfaser",
  async blaetter() {
    const seite = "https://www.deutsche-glasfaser.de/service/downloads";
    const html = await holen(seite);
    const entschaerft = (s) =>
      s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const alle = [...html.matchAll(/href="\/api\/media\?file=([^"]+)"/g)]
      .map((m) => dgEntschluesseln(entschaerft(m[1])))
      .filter((url) => /^https:\/\/\S+\.pdf$/i.test(url) && /PIB/i.test(url))
      .map((url) => ({ url, text: url.split("/").pop() }));
    return eindeutig(alle);
  },
};

const ADAPTER = [TELEKOM, VODAFONE, O2, EINSUNDEINS, PYUR, DEUTSCHE_GLASFASER];

// ---------------------------------------------------------------------------
// Hauptlauf
// ---------------------------------------------------------------------------

try {
  await execFileAsync("pdftotext", ["-v"]);
} catch {
  console.error("❌ pdftotext fehlt — bitte `brew install poppler` ausführen.");
  process.exit(1);
}

// Sicherung: Anbieter-Namen müssen zur kanonischen Liste passen. Sonst
// zeigte der Ergebnis-Screen "für deinen Anbieter noch nicht hinterlegt",
// obwohl die Tarife längst in der Datei stehen.
const anbieterDatei = await readFile(path.join(WURZEL, "src/lib/netz/anbieter.ts"), "utf8");
const bekannteAnbieter = [
  ...anbieterDatei
    .slice(
      anbieterDatei.indexOf("FESTNETZ_ANBIETER"),
      anbieterDatei.indexOf("] as const")
    )
    .matchAll(/"([^"]+)"/g),
].map((m) => m[1]);

if (bekannteAnbieter.length === 0) {
  console.error("❌ FESTNETZ_ANBIETER nicht lesbar — Abbruch.");
  process.exit(1);
}
const unbekannt = ADAPTER.map((a) => a.anbieter).filter((n) => !bekannteAnbieter.includes(n));
if (unbekannt.length > 0) {
  console.error(
    `❌ Anbieter-Name passt nicht zu FESTNETZ_ANBIETER: ${unbekannt.join(", ")}\n` +
      `   Bekannt sind: ${bekannteAnbieter.join(", ")}\n` +
      `   Ohne Buchstabengleichheit findet der Ergebnis-Screen die Tarife nicht.`
  );
  process.exit(1);
}

await mkdir(CACHE, { recursive: true });

const tarife = [];
const fehlgeschlagen = [];
const uebersprungen = [];
const laufende = ADAPTER.filter((a) => !NUR || NUR.includes(a.anbieter));

for (const adapter of laufende) {
  console.log(`\n=== ${adapter.anbieter} ===`);
  const blaetter = await adapter.blaetter();
  console.log(`${blaetter.length} Blätter gefunden`);

  const vorher = tarife.length;
  let uebersprungenHier = 0;

  await nacheinanderMitTempo(blaetter, async (blatt) => {
    const slug = blatt.slug ?? slugAusUrl(blatt.url);
    try {
      const text = await pdfText(blatt.url);
      const ergebnis = pibAuswerten(text, { slug, nurWenn: adapter.nurWenn });

      if (ergebnis.uebersprungen) {
        uebersprungenHier++;
        uebersprungen.push({
          anbieter: adapter.anbieter,
          slug,
          grund: ergebnis.uebersprungen,
        });
        return;
      }
      if (ergebnis.fehler) {
        fehlgeschlagen.push({ anbieter: adapter.anbieter, slug, fehler: ergebnis.fehler });
        return;
      }

      // Ein Blatt kann mehrere Tarife tragen (o2). Der Bezeichner ist der
      // React-Schlüssel der Auswahl-Liste und muss darum je Zeile eindeutig
      // sein — bei einem Tarif bleibt er unverändert.
      ergebnis.tarife.forEach((tarif, i) => {
        tarife.push({
          anbieter: adapter.anbieter,
          slug: ergebnis.tarife.length > 1 ? `${slug}--${i + 1}` : slug,
          quelle_url: blatt.url,
          ...tarif,
        });
      });
    } catch (err) {
      fehlgeschlagen.push({ anbieter: adapter.anbieter, slug, fehler: err.message });
    }
  });

  console.log(
    `→ ${tarife.length - vorher} Tarife gelesen, ${uebersprungenHier} Blätter ohne ` +
      `Geschwindigkeits-Tabelle übersprungen`
  );
}

// Was nicht gelesen werden konnte, wird benannt — nie stillschweigend gekürzt.
if (uebersprungen.length > 0) {
  const nachGrund = new Map();
  for (const u of uebersprungen) {
    const schluessel = `${u.anbieter}: ${u.grund}`;
    nachGrund.set(schluessel, (nachGrund.get(schluessel) ?? 0) + 1);
  }
  console.log("\nÜbersprungen (kein Internet-Tarif in diesem Blatt):");
  for (const [grund, anzahl] of [...nachGrund].sort()) console.log(`  ${anzahl}× ${grund}`);
}

if (fehlgeschlagen.length > 0) {
  console.error(`\n❌ ${fehlgeschlagen.length} Blatt/Blätter nicht lesbar:`);
  for (const f of fehlgeschlagen.slice(0, 40)) {
    console.error(`   ${f.anbieter} / ${f.slug}: ${f.fehler}`);
  }
  if (fehlgeschlagen.length > 40) console.error(`   … und ${fehlgeschlagen.length - 40} weitere`);
  console.error("Parser oder Auswahl korrigieren. Abbruch ohne Schreiben.");
  process.exit(1);
}

if (tarife.length < 30) {
  console.error(`\n❌ Nur ${tarife.length} Tarife — das ist zu wenig. Abbruch ohne Schreiben.`);
  process.exit(1);
}

// Der Bezeichner ist der Listen-Schlüssel der Tarif-Auswahl in der Oberfläche
// und muss darum eindeutig sein. Doppelte deuten außerdem darauf hin, dass
// wir dasselbe Blatt zweimal eingelesen haben.
const jeSlug = new Map();
for (const t of tarife) jeSlug.set(t.slug, (jeSlug.get(t.slug) ?? 0) + 1);
const doppelte = [...jeSlug].filter(([, anzahl]) => anzahl > 1);
if (doppelte.length > 0) {
  console.error(`\n❌ ${doppelte.length} Bezeichner doppelt vergeben:`);
  for (const [slug, anzahl] of doppelte.slice(0, 20)) console.error(`   ${anzahl}× ${slug}`);
  console.error("Abbruch ohne Schreiben.");
  process.exit(1);
}

tarife.sort(
  (a, b) =>
    a.anbieter.localeCompare(b.anbieter, "de") ||
    a.download_max_mbps - b.download_max_mbps ||
    a.slug.localeCompare(b.slug)
);

const daten = {
  stand: new Date().toISOString().slice(0, 10),
  quelle: "Offizielle Produktinformationsblätter der Anbieter (§ 1 TK-Transparenzverordnung)",
  tarife,
};

await writeFile(AUSGABE, JSON.stringify(daten, null, 1));

const jeAnbieter = new Map();
for (const t of tarife) jeAnbieter.set(t.anbieter, (jeAnbieter.get(t.anbieter) ?? 0) + 1);
console.log(`\nGeschrieben: ${AUSGABE}`);
for (const [anbieter, anzahl] of [...jeAnbieter].sort()) {
  console.log(`  ${String(anzahl).padStart(4)} ${anbieter}`);
}
console.log(`  ${String(tarife.length).padStart(4)} gesamt, Stand ${daten.stand}`);
