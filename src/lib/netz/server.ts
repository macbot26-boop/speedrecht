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

/**
 * Client-IP aus dem Request lesen.
 *
 * Vertrauens-Annahme (bewusst erzwungen): x-forwarded-for/x-real-ip sind
 * gewöhnliche Header, die jeder Client fälschen kann. Auf Vercel ist ihnen
 * zu trauen, weil die Plattform sie garantiert selbst mit der echten
 * Verbindungs-IP überschreibt. Läuft die App woanders in Produktion,
 * geben wir lieber null zurück (keine Erkennung, gemeinsame Ratenbremse),
 * statt fälschbaren Headern zu glauben — Self-Hosting müsste diese
 * Funktion an seinen Proxy anpassen.
 */
export function ipAusRequest(request: Request): string | null {
  if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
    return null;
  }
  const weitergeleitet = request.headers.get("x-forwarded-for");
  if (weitergeleitet) {
    const erste = weitergeleitet.split(",")[0]?.trim();
    if (erste) return erste;
  }
  return request.headers.get("x-real-ip")?.trim() || null;
}
