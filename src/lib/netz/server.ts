// Serverseitiger Zugang zur Anbieter-Erkennung: lädt die generierte Tabelle
// einmal pro Instanz und stellt fertige Helfer bereit.
//
// Datenschutz-Regel (nicht verhandelbar): Die IP wird hier nur flüchtig
// nachgeschlagen — nie gespeichert, nie geloggt, nie an Dritte gegeben.

import netzdaten from "./netzdaten.generated.json";
import { erkennerAufbauen, type Erkennung, type NetzDaten } from "./erkennung";

const erkenner = erkennerAufbauen(netzdaten as NetzDaten);

/** Stand-Datum der Netz-Tabelle (für Transparenz in der API-Antwort). */
export const NETZDATEN_STAND: string = (netzdaten as NetzDaten).stand;

export function netzErkennen(ip: string): Erkennung {
  return erkenner.erkennen(ip);
}

/** Client-IP aus dem Request lesen (Vercel/Proxy-Header, erster Eintrag). */
export function ipAusRequest(request: Request): string | null {
  const weitergeleitet = request.headers.get("x-forwarded-for");
  if (weitergeleitet) {
    const erste = weitergeleitet.split(",")[0]?.trim();
    if (erste) return erste;
  }
  return request.headers.get("x-real-ip")?.trim() || null;
}
