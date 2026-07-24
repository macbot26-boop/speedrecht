// Anbieter-Erkennung: IP-Adresse → Netzbetreiber (Telekom, Vodafone, …).
//
// Grundlage ist die vom Sammel-Skript (scripts/netz-daten-sammeln.mjs)
// erzeugte Tabelle überschneidungsfreier, sortierter Adress-Abschnitte.
// Die Suche ist damit eine simple binäre Suche — kein Netzwerkzugriff,
// keine Dienste Dritter, nichts wird gespeichert.
//
// Der Kern ist bewusst "pur" (Daten kommen als Parameter herein), damit er
// sich ohne Bundler-Magie testen lässt.

export type NetzKategorie = "festnetz" | "mobilfunk" | "hosting_vpn";

export interface NetzTraeger {
  asn: number;
  holder: string;
  anbieter: string;
  kategorie: NetzKategorie;
}

export interface NetzDaten {
  stand: string;
  quelle: string;
  /** Aufnahmeregel der Bereiche — siehe scripts/netz-daten-sammeln.mjs */
  regel: string;
  traeger: NetzTraeger[];
  /** [start, ende, träger-index] — überschneidungsfrei, aufsteigend sortiert */
  v4: [number, number, number][];
  /** wie v4, aber start/ende als Hex-Text (128-Bit-Werte) */
  v6: [string, string, number][];
}

export interface Erkennung {
  anbieter: string | null;
  kategorie: NetzKategorie | "unbekannt";
  asn: number | null;
}

export const NICHT_ERKANNT: Erkennung = {
  anbieter: null,
  kategorie: "unbekannt",
  asn: null,
};

type GeparsteIp =
  | { familie: "v4"; wert: number }
  | { familie: "v6"; wert: bigint };

/** Zerlegt eine IP-Adresse in ihren Zahlwert; null bei ungültiger Eingabe. */
export function ipParsen(roh: string): GeparsteIp | null {
  const ip = roh.trim();

  // v4-in-v6-Schreibweise ("::ffff:93.184.216.34") als v4 behandeln.
  const v4InV6 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  const v4Text = v4InV6 ? v4InV6[1] : ip;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4Text)) {
    const oktette = v4Text.split(".").map(Number);
    if (oktette.some((o) => o > 255)) return null;
    return {
      familie: "v4",
      wert:
        oktette[0] * 0x1000000 + oktette[1] * 0x10000 + oktette[2] * 0x100 + oktette[3],
    };
  }

  if (!ip.includes(":") || ip.includes("%")) return null;

  // IPv6: "::" genau einmal, sonst 8 Gruppen à 16 Bit.
  const teile = ip.split("::");
  if (teile.length > 2) return null;
  const kopf = teile[0] ? teile[0].split(":") : [];
  const schwanz = teile.length === 2 && teile[1] ? teile[1].split(":") : [];
  const fehlend = 8 - kopf.length - schwanz.length;
  if (teile.length === 2 ? fehlend < 1 : fehlend !== 0) return null;

  const gruppen = [...kopf, ...Array(Math.max(fehlend, 0)).fill("0"), ...schwanz];
  let wert = 0n;
  for (const gruppe of gruppen) {
    if (!/^[0-9a-f]{1,4}$/i.test(gruppe)) return null;
    wert = (wert << 16n) | BigInt(parseInt(gruppe, 16));
  }
  return { familie: "v6", wert };
}

interface Erkenner {
  erkennen(ip: string): Erkennung;
}

/** Baut aus der generierten Tabelle einen nachschlagefertigen Erkenner. */
export function erkennerAufbauen(daten: NetzDaten): Erkenner {
  const v4 = daten.v4;
  const v6 = daten.v6.map(
    ([start, ende, idx]) =>
      [BigInt(`0x${start}`), BigInt(`0x${ende}`), idx] as [bigint, bigint, number]
  );

  function suchen<T extends number | bigint>(
    abschnitte: [T, T, number][],
    wert: T
  ): number | null {
    let links = 0;
    let rechts = abschnitte.length - 1;
    while (links <= rechts) {
      const mitte = (links + rechts) >> 1;
      const [start, ende, idx] = abschnitte[mitte];
      if (wert < start) rechts = mitte - 1;
      else if (wert > ende) links = mitte + 1;
      else return idx;
    }
    return null;
  }

  return {
    erkennen(ip: string): Erkennung {
      const geparst = ipParsen(ip);
      if (!geparst) return NICHT_ERKANNT;
      const idx =
        geparst.familie === "v4"
          ? suchen(v4, geparst.wert)
          : suchen(v6, geparst.wert);
      if (idx === null) return NICHT_ERKANNT;
      const t = daten.traeger[idx];
      return { anbieter: t.anbieter, kategorie: t.kategorie, asn: t.asn };
    },
  };
}
