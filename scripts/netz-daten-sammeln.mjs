#!/usr/bin/env node
// Sammelt die Netzbereiche (BGP-Präfixe) der kuratierten Anbieter-ASNs von
// RIPEstat (öffentliche Registerdaten) und schreibt eine kompakte, im Repo
// versionierte Tabelle für die serverseitige Anbieter-Erkennung.
//
// Wiederholbar: `node scripts/netz-daten-sammeln.mjs` — überschreibt die
// generierte Datei samt Stand-Datum. Jeder ASN wird gegen seinen erwarteten
// Registernamen (Holder) validiert; passt er nicht, fliegt er laut raus —
// so können sich Tippfehler in der Kuratierung nicht still einschleichen.
//
// Zusätzlich wird jeder Bereich eines Zugangsnetzes auf Plausibilität
// geprüft (siehe „Registerprüfung“ weiter unten) — die Holder-Prüfung
// beantwortet nur, WEM der ASN gehört, nicht, ob die angekündigten
// Adressbereiche zu einem deutschen Anschluss passen.
//
// Datenschutz: Dieses Skript verarbeitet KEINE Nutzerdaten — nur öffentliche
// Routing-Registerdaten über unsere eigene Entwickler-Verbindung.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Kuratierte Liste: ASN → { anbieter, kategorie, erwartet (Holder-Muster) }.
// kategorie:
//   festnetz    → deutscher Endkunden-Anschlussanbieter (Erkennung anzeigen)
//   mobilfunk   → eindeutig mobiles Netz (Hotspot-Hinweis)
//   hosting_vpn → Rechenzentrum/VPN-Austritt (VPN-Hinweis)
const KURATIERT = [
  // — Festnetz-Anbieter (Top ~10 Deutschland) —
  { asn: 3320, anbieter: "Telekom", kategorie: "festnetz", erwartet: /deutsche telekom|dtag/i },
  { asn: 3209, anbieter: "Vodafone", kategorie: "festnetz", erwartet: /vodafone/i },
  // AS31334 (Kabel Deutschland) kündigt seit März 2026 nichts mehr an —
  // die Kabelkunden laufen inzwischen über AS3209. Der Eintrag bleibt
  // kuratiert, falls der ASN wieder aktiv wird; das Skript warnt unten laut,
  // solange er leer bleibt.
  { asn: 31334, anbieter: "Vodafone", kategorie: "festnetz", erwartet: /vodafone|kabel deutschland/i },
  { asn: 6805, anbieter: "o2", kategorie: "festnetz", erwartet: /telefonica|telefónica/i },
  { asn: 8881, anbieter: "1&1", kategorie: "festnetz", erwartet: /versatel|1&1/i },
  { asn: 60294, anbieter: "Deutsche Glasfaser", kategorie: "festnetz", erwartet: /deutsche glasfaser/i },
  { asn: 8422, anbieter: "NetCologne", kategorie: "festnetz", erwartet: /netcologne/i },
  { asn: 9145, anbieter: "EWE", kategorie: "festnetz", erwartet: /ewe/i },
  { asn: 8767, anbieter: "M-net", kategorie: "festnetz", erwartet: /m-?net/i },
  { asn: 20880, anbieter: "PŸUR", kategorie: "festnetz", erwartet: /tele columbus|primacom|pyur|p.?ur/i },

  // — Mobilfunk (nur wo als eigenes Netz unterscheidbar; Kandidaten werden
  //   durch die Holder-Validierung bestätigt oder verworfen). Telekom- und
  //   Vodafone-Mobilfunk läuft über die gemeinsamen Festnetz-ASNs und ist
  //   per ASN nicht unterscheidbar (Präfix-Kuratierung = Folgeaufgabe). —
  { asn: 12638, anbieter: "o2", kategorie: "mobilfunk", erwartet: /telefonica|telefónica/i },

  // — Hosting / VPN-Austrittsnetze (für den ehrlichen Warnhinweis) —
  { asn: 24940, anbieter: "Hetzner", kategorie: "hosting_vpn", erwartet: /hetzner/i },
  { asn: 16276, anbieter: "OVH", kategorie: "hosting_vpn", erwartet: /ovh/i },
  { asn: 14061, anbieter: "DigitalOcean", kategorie: "hosting_vpn", erwartet: /digitalocean/i },
  { asn: 16509, anbieter: "Amazon", kategorie: "hosting_vpn", erwartet: /amazon/i },
  { asn: 14618, anbieter: "Amazon", kategorie: "hosting_vpn", erwartet: /amazon/i },
  { asn: 8075, anbieter: "Microsoft", kategorie: "hosting_vpn", erwartet: /microsoft/i },
  { asn: 15169, anbieter: "Google", kategorie: "hosting_vpn", erwartet: /google/i },
  { asn: 396982, anbieter: "Google Cloud", kategorie: "hosting_vpn", erwartet: /google/i },
  { asn: 13335, anbieter: "Cloudflare", kategorie: "hosting_vpn", erwartet: /cloudflare/i },
  { asn: 20940, anbieter: "Akamai", kategorie: "hosting_vpn", erwartet: /akamai/i },
  { asn: 54113, anbieter: "Fastly", kategorie: "hosting_vpn", erwartet: /fastly/i },
  { asn: 197540, anbieter: "netcup", kategorie: "hosting_vpn", erwartet: /netcup/i },
  { asn: 51167, anbieter: "Contabo", kategorie: "hosting_vpn", erwartet: /contabo/i },
  { asn: 6724, anbieter: "Strato", kategorie: "hosting_vpn", erwartet: /strato/i },
  { asn: 8560, anbieter: "IONOS", kategorie: "hosting_vpn", erwartet: /ionos|1&1/i },
  { asn: 9009, anbieter: "M247", kategorie: "hosting_vpn", erwartet: /m247/i },
  { asn: 197141, anbieter: "Mullvad", kategorie: "hosting_vpn", erwartet: /mullvad/i },
  { asn: 216025, anbieter: "Mullvad", kategorie: "hosting_vpn", erwartet: /mullvad/i },
  { asn: 60068, anbieter: "Datacamp", kategorie: "hosting_vpn", erwartet: /datacamp|cdn77/i },
];

const RIPESTAT = "https://stat.ripe.net/data";
// Amtliches Delegationsregister der RIPE NCC (Registrierungsstelle für
// Europa): eine Zeile je vergebenem Adressblock, täglich aktualisiert.
const RIPE_REGISTER =
  "https://ftp.ripe.net/pub/stats/ripencc/delegated-ripencc-extended-latest";
const AUSGABE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src/lib/netz/netzdaten.generated.json"
);

const REGEL =
  "Zugangsnetze (festnetz/mobilfunk) nur mit Bereichen aus dem " +
  "RIPE-Delegationsregister; hosting_vpn bewusst weltweit";

async function ripestat(endpoint, asn, versuch = 1) {
  const url = `${RIPESTAT}/${endpoint}/data.json?resource=AS${asn}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.data;
  } catch (err) {
    if (versuch < 3) {
      await new Promise((r) => setTimeout(r, 2_000 * versuch));
      return ripestat(endpoint, asn, versuch + 1);
    }
    throw new Error(`RIPEstat ${endpoint} AS${asn}: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Registerprüfung: Gehört der Bereich überhaupt in unsere Weltregion?
//
// Ein deutscher Anschluss-Anbieter kündigt nicht nur die Adressen seiner
// eigenen Kunden an, sondern auch Bereiche von Geschäftskunden, deren
// Verkehr er lediglich transportiert. Darunter sind Blöcke aus fremden
// Weltregistern — etwa 23.27.65.0/24 (eingetragen auf ein US-Rechenzentrum,
// von AS8881 angekündigt) oder 196.44.120.0/22 (Ghana, von AS3320). Für die
// Anbieter-Erkennung sind das Falschtreffer mit direkter Produktwirkung: Wer
// von dort misst, hat keinen deutschen Anschluss dieses Anbieters, bekäme
// aber dessen Tarifliste und damit ein falsches Urteil.
//
// Die Regel: Für Zugangsnetze zählt ein Bereich nur, wenn er vollständig im
// Delegationsregister der RIPE NCC steht — der Registrierungsstelle für
// Europa, bei der deutsche Anbieter ihre Kundenbereiche führen.
//
// Bewusst NICHT nach Ländercode "DE" oder nach "sieht deutsch aus"
// gefiltert: Seit der IPv4-Knappheit kaufen deutsche Anbieter Blöcke aus
// anderen Weltregionen und lassen sie ins RIPE-Register übertragen. 1&1
// nutzt so 9.151.48.0/20 (Altbestand IBM, Netzname "Dusseldorf_1") und
// 14.102.90.0/24 (ehemals Hongkong) für deutsche Kunden. Der Ländercode
// dieser Einträge zeigt weiterhin die Herkunft (US bzw. HK) — ein DE-Filter
// würde also echte Kundenbereiche wegwerfen. Die Registerzugehörigkeit
// trennt sauber: Alle geprüften echten Bereiche bleiben erhalten.
//
// Für hosting_vpn gilt die Regel absichtlich NICHT: Rechenzentren und
// VPN-Austritte sollen weltweit erkannt werden — genau das ist ihr Zweck.
// ---------------------------------------------------------------------------

async function ripeRegisterLaden(versuch = 1) {
  try {
    const res = await fetch(RIPE_REGISTER, { signal: AbortSignal.timeout(180_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (versuch < 3) {
      await new Promise((r) => setTimeout(r, 2_000 * versuch));
      return ripeRegisterLaden(versuch + 1);
    }
    throw new Error(`RIPE-Register: ${err.message}`);
  }
}

/**
 * Wertet das Delegationsregister aus. Zeilenformat:
 *   registry|land|typ|startadresse|wert|datum|status|id
 * Für `ipv4` ist `wert` die ANZAHL Adressen (nicht die Präfixlänge), für
 * `ipv6` die Präfixlänge. Angrenzende und überlappende Blöcke werden zu
 * möglichst wenigen Intervallen verschmolzen, damit die spätere Prüfung
 * eine binäre Suche ist. (cidrZuBereich steht weiter unten — Funktions-
 * deklarationen gelten in JavaScript für die ganze Datei.)
 */
function registerAuswerten(text) {
  const roh = { v4: [], v6: [] };
  for (const zeile of text.split("\n")) {
    if (!zeile || zeile.startsWith("#")) continue;
    const felder = zeile.split("|");
    if (felder.length < 7) continue;
    const [, , typ, adresse, wert, , status] = felder;
    // "reserved"/"available" sind nicht vergeben — sie gehören niemandem.
    if (status === "reserved" || status === "available") continue;
    // Unbrauchbare Zeilen (etwa eine abgeschnittene letzte Zeile) werden
    // übersprungen statt den Lauf abzubrechen; ein wirklich unvollständiges
    // Register fängt die Mengenprüfung weiter unten ab.
    if (!/^\d+$/.test(wert)) continue;
    if (typ === "ipv4") {
      const anzahl = BigInt(wert);
      if (anzahl < 1n) continue;
      const start = cidrZuBereich(`${adresse}/32`).start;
      roh.v4.push({ start, ende: start + anzahl - 1n });
    } else if (typ === "ipv6") {
      if (Number(wert) > 128) continue;
      const bereich = cidrZuBereich(`${adresse}/${wert}`);
      roh.v6.push({ start: bereich.start, ende: bereich.ende });
    }
  }

  const vereinigen = (liste) => {
    liste.sort((a, b) =>
      a.start !== b.start ? (a.start < b.start ? -1 : 1) : a.ende < b.ende ? -1 : 1
    );
    const aus = [];
    for (const b of liste) {
      const letztes = aus[aus.length - 1];
      if (letztes && b.start <= letztes.ende + 1n) {
        if (b.ende > letztes.ende) letztes.ende = b.ende;
      } else {
        aus.push({ start: b.start, ende: b.ende });
      }
    }
    return aus;
  };

  return {
    v4: vereinigen(roh.v4),
    v6: vereinigen(roh.v6),
    anzahl: { v4: roh.v4.length, v6: roh.v6.length },
  };
}

/** Liegt [start, ende] vollständig in einem Block des Registers? */
function imRegister(bloecke, start, ende) {
  let links = 0;
  let rechts = bloecke.length - 1;
  while (links <= rechts) {
    const mitte = (links + rechts) >> 1;
    const block = bloecke[mitte];
    if (start < block.start) rechts = mitte - 1;
    else if (start > block.ende) links = mitte + 1;
    else return ende <= block.ende;
  }
  return false;
}

console.log("Lade RIPE-Delegationsregister …");
const register = registerAuswerten(await ripeRegisterLaden());
// Schutz vor einer halb geladenen Datei: Ein leeres oder verstümmeltes
// Register würde jeden deutschen Bereich verwerfen und still eine nutzlose
// Tabelle schreiben. Die Schwellen liegen weit unter dem realen Umfang
// (Juli 2026: rund 100.000 v4- und 26.000 v6-Einträge).
if (register.anzahl.v4 < 50_000 || register.anzahl.v6 < 5_000) {
  console.error(
    `❌ RIPE-Register unplausibel klein (${register.anzahl.v4} v4, ` +
      `${register.anzahl.v6} v6) — Abbruch ohne Schreiben.`
  );
  process.exit(1);
}
console.log(
  `   ${register.anzahl.v4} v4- und ${register.anzahl.v6} v6-Einträge → ` +
    `${register.v4.length} + ${register.v6.length} zusammenhängende Blöcke\n`
);

const traeger = [];
const netze = [];
const verworfen = [];
const statistik = [];

// Fremde Texte (Holder-Namen) vor der Terminal-Ausgabe von Steuerzeichen
// befreien — eine bösartige Antwort soll keine Escape-Sequenzen einschleusen.
const sauber = (text) => text.replace(/[\u0000-\u001f\u007f]/g, "");

for (const eintrag of KURATIERT) {
  const uebersicht = await ripestat("as-overview", eintrag.asn);
  const holder = sauber((uebersicht?.holder ?? "").trim());

  if (!eintrag.erwartet.test(holder)) {
    verworfen.push({ asn: eintrag.asn, anbieter: eintrag.anbieter, holder });
    console.warn(
      `⚠️  AS${eintrag.asn} verworfen: Holder "${holder}" passt nicht zu "${eintrag.anbieter}"`
    );
    continue;
  }

  const angekuendigt = await ripestat("announced-prefixes", eintrag.asn);
  const roh = angekuendigt?.prefixes ?? [];
  const fensterEnde = angekuendigt?.query_endtime ?? null;
  const zugangsnetz = eintrag.kategorie !== "hosting_vpn";

  const prefixes = [];
  const fremd = [];
  let ausgelaufen = 0;
  for (const p of roh) {
    // RIPEstat nennt je Präfix die Zeitfenster, in denen es im
    // Beobachtungszeitraum sichtbar war. Endet das letzte vor dem Ende des
    // Zeitraums, wird der Bereich nicht mehr angekündigt — der Anbieter hat
    // ihn abgegeben. Ohne positive Zeitangabe wird nichts verworfen.
    const zuletzt = (p.timelines ?? [])
      .map((t) => t.endtime)
      .filter(Boolean)
      .sort()
      .pop();
    if (fensterEnde && zuletzt && zuletzt < fensterEnde) {
      ausgelaufen++;
      continue;
    }
    if (zugangsnetz) {
      const bereich = cidrZuBereich(p.prefix);
      if (!imRegister(register[bereich.familie], bereich.start, bereich.ende)) {
        fremd.push(p.prefix);
        continue;
      }
    }
    prefixes.push(p.prefix);
  }

  const idx = traeger.length;
  traeger.push({
    asn: eintrag.asn,
    holder,
    anbieter: eintrag.anbieter,
    kategorie: eintrag.kategorie,
  });
  for (const prefix of prefixes) netze.push([prefix, idx]);
  statistik.push({
    asn: eintrag.asn,
    anbieter: eintrag.anbieter,
    kategorie: eintrag.kategorie,
    roh: roh.length,
    behalten: prefixes.length,
    fremd,
    ausgelaufen,
  });

  console.log(
    `✓ AS${eintrag.asn} ${eintrag.anbieter} (${eintrag.kategorie}) — "${holder}", ` +
      `${prefixes.length} Netze` +
      (fremd.length ? ` · ${fremd.length} außerhalb des RIPE-Registers verworfen` : "") +
      (ausgelaufen ? ` · ${ausgelaufen} nicht mehr angekündigt` : "")
  );
  // Höflich zur öffentlichen API bleiben.
  await new Promise((r) => setTimeout(r, 300));
}

// Die Kuratierung ist statisch — JEDER Verwurf bedeutet einen Fehler in der
// Liste oben und muss laut scheitern, statt still eine Lücke zu hinterlassen.
// (Genau so wurden zwei falsch kuratierte ASNs gefunden.)
if (verworfen.length > 0) {
  console.error(
    `❌ ${verworfen.length} ASN(s) verworfen — Kuratierung korrigieren. Abbruch ohne Schreiben.`
  );
  process.exit(1);
}
if (traeger.filter((t) => t.kategorie === "festnetz").length < 8) {
  console.error("❌ Zu wenige Festnetz-ASNs — Abbruch ohne Schreiben.");
  process.exit(1);
}

// Verliert ein Zugangsnetz plötzlich den Großteil seiner Bereiche, ist eher
// die Registerdatei kaputt als die Wirklichkeit — dann lieber gar nichts
// schreiben. Stand Juli 2026 ist 1&1 mit 26 % der stärkste Fall.
const uebermaessig = statistik.filter(
  (s) => s.kategorie !== "hosting_vpn" && s.roh > 0 && s.fremd.length / s.roh > 0.6
);
if (uebermaessig.length > 0) {
  for (const s of uebermaessig) {
    console.error(
      `❌ AS${s.asn} ${s.anbieter}: ${s.fremd.length} von ${s.roh} Bereichen ` +
        `außerhalb des RIPE-Registers — unplausibel.`
    );
  }
  console.error("   Registerdatei prüfen. Abbruch ohne Schreiben.");
  process.exit(1);
}

// Ein kuratiertes Zugangsnetz ohne Bereiche ist kein Schreibfehler, aber
// eine stille Lücke in der Erkennung — deshalb sichtbar melden.
for (const s of statistik) {
  if (s.kategorie !== "hosting_vpn" && s.behalten === 0) {
    console.warn(
      `⚠️  AS${s.asn} ${s.anbieter} liefert 0 Bereiche — Kunden dieses ` +
        `Netzes werden über diesen ASN nicht erkannt.`
    );
  }
}

const fremdGesamt = statistik.reduce((n, s) => n + s.fremd.length, 0);
const altGesamt = statistik.reduce((n, s) => n + s.ausgelaufen, 0);
if (fremdGesamt > 0) {
  console.log(`\nAußerhalb des RIPE-Registers verworfen (${fremdGesamt}):`);
  for (const s of statistik) {
    if (!s.fremd.length) continue;
    console.log(
      `  AS${s.asn} ${s.anbieter}: ${s.fremd.slice(0, 6).join(" ")}` +
        (s.fremd.length > 6 ? ` … (+${s.fremd.length - 6})` : "")
    );
  }
}

// ---------------------------------------------------------------------------
// Verdichten: CIDR-Blöcke sind immer entweder disjunkt oder ineinander
// verschachtelt (nie teilweise überlappend). Wir lösen die Verschachtelung
// hier einmalig auf und schreiben eine flache, sortierte Liste
// überschneidungsfreier Abschnitte [start, ende, träger-index]. Der
// Laufzeit-Matcher braucht dann nur noch eine binäre Suche.
// ---------------------------------------------------------------------------

function cidrZuBereich(cidr) {
  const [adresse, laengeText] = cidr.split("/");
  const laenge = Number(laengeText);
  const maxLaenge = adresse.includes(":") ? 128 : 32;
  if (!Number.isInteger(laenge) || laenge < 0 || laenge > maxLaenge) {
    throw new Error(`Ungültiger Präfix von RIPEstat: "${cidr}"`);
  }
  if (adresse.includes(":")) {
    // IPv6 → 128-Bit-BigInt
    const [kopf, schwanz = ""] = adresse.split("::");
    const kopfTeile = kopf ? kopf.split(":") : [];
    const schwanzTeile = schwanz ? schwanz.split(":") : [];
    const teile = [
      ...kopfTeile,
      ...Array(8 - kopfTeile.length - schwanzTeile.length).fill("0"),
      ...schwanzTeile,
    ];
    let wert = 0n;
    for (const teil of teile) wert = (wert << 16n) | BigInt(parseInt(teil || "0", 16));
    const rest = 128n - BigInt(laenge);
    const start = (wert >> rest) << rest;
    return { familie: "v6", start, ende: start + (1n << rest) - 1n };
  }
  const teile = adresse.split(".").map(Number);
  const wert =
    (BigInt(teile[0]) << 24n) | (BigInt(teile[1]) << 16n) | (BigInt(teile[2]) << 8n) | BigInt(teile[3]);
  const rest = 32n - BigInt(laenge);
  const start = (wert >> rest) << rest;
  return { familie: "v4", start, ende: start + (1n << rest) - 1n };
}

function verdichten(bereiche) {
  // Sortierung: Container vor Inhalt (start aufsteigend, Ende absteigend).
  bereiche.sort((a, b) =>
    a.start !== b.start
      ? a.start < b.start ? -1 : 1
      : a.ende !== b.ende
        ? a.ende > b.ende ? -1 : 1
        : a.idx - b.idx
  );

  const segmente = [];
  const stapel = []; // offene Container, jeweils mit "cursor" (nächste freie Stelle)

  const ausgeben = (start, ende, idx) => {
    if (start > ende) return;
    const letztes = segmente[segmente.length - 1];
    if (letztes && letztes[2] === idx && letztes[1] + 1n === start) {
      letztes[1] = ende; // nahtlos gleicher Träger → verschmelzen
    } else {
      segmente.push([start, ende, idx]);
    }
  };

  for (const b of bereiche) {
    while (stapel.length && stapel[stapel.length - 1].ende < b.start) {
      const e = stapel.pop();
      ausgeben(e.cursor, e.ende, e.idx);
      if (stapel.length) stapel[stapel.length - 1].cursor = e.ende + 1n;
    }
    const eltern = stapel[stapel.length - 1];
    if (eltern) {
      ausgeben(eltern.cursor, b.start - 1n, eltern.idx);
      eltern.cursor = b.start; // wird beim Pop des Kindes weitergerückt
    }
    stapel.push({ ...b, cursor: b.start });
  }
  while (stapel.length) {
    const e = stapel.pop();
    ausgeben(e.cursor, e.ende, e.idx);
    if (stapel.length) stapel[stapel.length - 1].cursor = e.ende + 1n;
  }
  return segmente;
}

const bereiche = { v4: [], v6: [] };
for (const [cidr, idx] of netze) {
  const b = cidrZuBereich(cidr);
  bereiche[b.familie].push({ start: b.start, ende: b.ende, idx });
}

const segmenteV4 = verdichten(bereiche.v4).map(([s, e, i]) => [Number(s), Number(e), i]);
const segmenteV6 = verdichten(bereiche.v6).map(([s, e, i]) => [
  s.toString(16),
  e.toString(16),
  i,
]);

const daten = {
  stand: new Date().toISOString().slice(0, 10),
  quelle:
    "RIPEstat (announced-prefixes, as-overview) — öffentliche BGP-Registerdaten; " +
    "Plausibilität gegen das RIPE-Delegationsregister geprüft",
  regel: REGEL,
  traeger,
  v4: segmenteV4,
  v6: segmenteV6,
};

await writeFile(AUSGABE, JSON.stringify(daten));
console.log(
  `\nGeschrieben: ${AUSGABE}\n${traeger.length} ASNs · ${netze.length} Roh-Netzbereiche → ` +
    `${segmenteV4.length} v4- + ${segmenteV6.length} v6-Abschnitte · Stand ${daten.stand}` +
    (fremdGesamt ? ` · ${fremdGesamt} außerhalb RIPE-Register verworfen` : "") +
    (altGesamt ? ` · ${altGesamt} nicht mehr angekündigt` : "")
);
