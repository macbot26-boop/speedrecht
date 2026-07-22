// Ratenbegrenzung pro Instanz (Fluid Compute hält Instanzen warm; für die
// Testphase ausreichend — kein externer Dienst nötig).
//
// Der Schlüssel lebt nur im Arbeitsspeicher und wird weder gespeichert noch
// geloggt. Für IPv6 wird pro Haushalt gebündelt (siehe ratenSchluessel) —
// ein Anschluss kontrolliert dort Abermilliarden Einzeladressen, Rotation
// darf die Bremse nicht aushebeln.

import { ipParsen } from "./netz/erkennung";

const MAX_EINTRAEGE = 10_000;

export function ratenBegrenzer(proMinute: number): (key: string) => boolean {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return function begrenzt(key: string): boolean {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      if (buckets.size >= MAX_EINTRAEGE) {
        // Erst Abgelaufenes räumen; reicht das nicht, die ältesten Einträge
        // (Map = Einfüge-Reihenfolge). NIE alles leeren — sonst schenkt ein
        // Angreifer per Map-Flutung allen (auch sich) frische Limits.
        for (const [k, b] of buckets) {
          if (b.resetAt < now) buckets.delete(k);
        }
        for (const k of buckets.keys()) {
          if (buckets.size < MAX_EINTRAEGE * 0.9) break;
          buckets.delete(k);
        }
      }
      buckets.set(key, { count: 1, resetAt: now + 60_000 });
      return false;
    }
    bucket.count += 1;
    return bucket.count > proMinute;
  };
}

/**
 * Macht aus einer Client-IP den Begrenzungs-Schlüssel: IPv4 einzeln,
 * IPv6 als /64-Block (die übliche Zuteilung für EINEN Anschluss).
 */
export function ratenSchluessel(ip: string | null): string {
  if (!ip) return "unbekannt";
  const geparst = ipParsen(ip);
  if (!geparst) return "unbekannt";
  return geparst.familie === "v4"
    ? `v4:${geparst.wert.toString(16)}`
    : `v6:${(geparst.wert >> 64n).toString(16)}`;
}
