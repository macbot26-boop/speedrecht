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
  { asn: 31334, anbieter: "Vodafone", kategorie: "festnetz", erwartet: /vodafone|kabel deutschland/i },
  { asn: 6805, anbieter: "o2", kategorie: "festnetz", erwartet: /telefonica|telefónica/i },
  { asn: 8881, anbieter: "1&1", kategorie: "festnetz", erwartet: /versatel|1&1/i },
  { asn: 60294, anbieter: "Deutsche Glasfaser", kategorie: "festnetz", erwartet: /deutsche glasfaser/i },
  { asn: 8422, anbieter: "NetCologne", kategorie: "festnetz", erwartet: /netcologne/i },
  { asn: 9145, anbieter: "EWE", kategorie: "festnetz", erwartet: /ewe/i },
  { asn: 8767, anbieter: "M-net", kategorie: "festnetz", erwartet: /m-?net/i },
  { asn: 20880, anbieter: "PŸUR", kategorie: "festnetz", erwartet: /tele columbus|primacom|pyur|p.?ur/i },

  // — Mobilfunk (nur wo als eigenes Netz unterscheidbar; Kandidaten werden
  //   durch die Holder-Validierung bestätigt oder verworfen) —
  { asn: 12638, anbieter: "Telekom", kategorie: "mobilfunk", erwartet: /telekom|t-mobile/i },

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
  { asn: 31173, anbieter: "Mullvad", kategorie: "hosting_vpn", erwartet: /31173|mullvad/i },
  { asn: 60068, anbieter: "Datacamp", kategorie: "hosting_vpn", erwartet: /datacamp|cdn77/i },
];

const RIPESTAT = "https://stat.ripe.net/data";
const AUSGABE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src/lib/netz/netzdaten.generated.json"
);

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

const traeger = [];
const netze = [];
const verworfen = [];

for (const eintrag of KURATIERT) {
  const uebersicht = await ripestat("as-overview", eintrag.asn);
  const holder = (uebersicht?.holder ?? "").trim();

  if (!eintrag.erwartet.test(holder)) {
    verworfen.push({ asn: eintrag.asn, anbieter: eintrag.anbieter, holder });
    console.warn(
      `⚠️  AS${eintrag.asn} verworfen: Holder "${holder}" passt nicht zu "${eintrag.anbieter}"`
    );
    continue;
  }

  const angekuendigt = await ripestat("announced-prefixes", eintrag.asn);
  const prefixes = (angekuendigt?.prefixes ?? []).map((p) => p.prefix);

  const idx = traeger.length;
  traeger.push({
    asn: eintrag.asn,
    holder,
    anbieter: eintrag.anbieter,
    kategorie: eintrag.kategorie,
  });
  for (const prefix of prefixes) netze.push([prefix, idx]);

  console.log(
    `✓ AS${eintrag.asn} ${eintrag.anbieter} (${eintrag.kategorie}) — "${holder}", ${prefixes.length} Netze`
  );
  // Höflich zur öffentlichen API bleiben.
  await new Promise((r) => setTimeout(r, 300));
}

if (traeger.filter((t) => t.kategorie === "festnetz").length < 8) {
  console.error("❌ Zu viele Festnetz-ASNs verworfen — Abbruch ohne Schreiben.");
  process.exit(1);
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
  quelle: "RIPEstat (announced-prefixes, as-overview) — öffentliche BGP-Registerdaten",
  traeger,
  v4: segmenteV4,
  v6: segmenteV6,
};

await writeFile(AUSGABE, JSON.stringify(daten));
console.log(
  `\nGeschrieben: ${AUSGABE}\n${traeger.length} ASNs · ${netze.length} Roh-Netzbereiche → ` +
    `${segmenteV4.length} v4- + ${segmenteV6.length} v6-Abschnitte · Stand ${daten.stand}` +
    (verworfen.length ? ` · ${verworfen.length} verworfen` : "")
);
