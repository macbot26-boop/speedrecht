// Gemeinsame Helfer für das Zugangs-Gate (genutzt von proxy.ts und
// /api/zugang). Cookie enthält nur einen SHA-256-Hash, nie den Klartext-Code.

import { angabenSindEcht } from "./rechtliches/anbieter.ts";

export const GATE_COOKIE = "sr_zugang";

/**
 * Pfade, die immer erreichbar sind: die Code-Eingabe selbst und harmlose
 * statische PWA-Dateien.
 */
const IMMER_OEFFENTLICH = new Set([
  "/zugang",
  "/api/zugang",
  "/icon.svg",
  "/manifest.webmanifest",
  "/sw.js",
  "/favicon.ico",
]);

/**
 * Die Rechtsseiten. Ihre Erreichbarkeit hängt an den Anbieterangaben — siehe
 * `istOeffentlich`.
 */
export const RECHTSSEITEN = ["/impressum", "/datenschutz"] as const;

/**
 * Plattform-Pfade von Vercel — hier läuft kein eigener Code von uns.
 *
 * Warum das eine eigene Regel braucht: Der Proxy-Filter schließt nur `/_next/`
 * aus, nicht `/_vercel/`. Die Reichweitenmessung sendet aber an
 * `/_vercel/insights/view` (am Prüfstand bestätigt). Ohne diese Ausnahme
 * bekäme dieser Aufruf bei gesetztem ACCESS_CODE eine Weiterleitung zur
 * Code-Eingabe — und die Zählung lieferte GENAU IN DER TESTPHASE nichts, also
 * dann, wenn die Zahlen gebraucht werden. Der Fehler wäre dabei vollkommen
 * leise: Die App funktioniert weiter, nur die Statistik bleibt leer.
 *
 * Ob Vercel diese Pfade ohnehin vor dem Proxy abfängt, ist nicht dokumentiert.
 * Die Regel kostet nichts und macht uns von dieser Frage unabhängig — durch
 * sie wird nichts von der App erreichbar, es sind ausschließlich
 * Plattform-Endpunkte.
 *
 * Als Präfix, nicht als genaue Übereinstimmung: Es ist ein Namensraum mit
 * mehreren Endpunkten (insights, speed-insights).
 */
const PLATTFORM_PRAEFIX = "/_vercel/";

/**
 * Darf dieser Pfad ohne Zugangscode gesehen werden?
 *
 * DIE REGEL, UM DIE ES HIER GEHT:
 *
 *   Impressum und Datenschutzerklärung sind genau dann öffentlich, wenn die
 *   Anbieterangaben echt sind.
 *
 * Zwei Fehler wären ohne diese Kopplung möglich, und beide wären teuer:
 *
 *   1. Rechtsseiten hinter dem Code. Gesetzlich muss ein Impressum „ständig
 *      verfügbar" sein — für jeden, ohne Hürde. Partnerprogramme (Awin) prüfen
 *      es vor der Freigabe; hinter einem Gate sehen sie es nicht.
 *   2. Ein erfundenes Impressum öffentlich. Solange Beispieldaten drinstehen,
 *      wäre die Seite eine falsche Angabe im Rechtsverkehr — schlimmer als
 *      keine Seite.
 *
 * Weil beides gleichzeitig droht, entscheidet nicht das Gedächtnis, sondern
 * `angabenSindEcht`. Mit dem Eintragen der echten Firmendaten öffnen sich die
 * Seiten von selbst; solange Beispieldaten dastehen, bleiben sie zu und tragen
 * zusätzlich einen Warnbalken.
 *
 * `rechtstexteEcht` ist ein Parameter und kein direkter Aufruf, damit der Test
 * beide Welten durchspielen kann, ohne die ausgelieferten Daten zu verbiegen.
 */
export function istOeffentlich(
  pathname: string,
  rechtstexteEcht: boolean = angabenSindEcht()
): boolean {
  if (IMMER_OEFFENTLICH.has(pathname)) return true;
  if (pathname.startsWith(PLATTFORM_PRAEFIX)) return true;
  return rechtstexteEcht && (RECHTSSEITEN as readonly string[]).includes(pathname);
}

export async function gateCookieValue(code: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`speedrecht-gate:${code}`)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
