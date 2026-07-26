// Die Eingangskontrolle für jede Anfrage, die eine Rechnung mitbringt.
//
// Herausgelöst, weil es ZWEI Routen gibt, die dasselbe Foto entgegennehmen:
// `/api/rechnung` liest Anbieter und Vertragsnamen, `/api/rechnung/name` liest
// auf ausdrückliche Einwilligung hin den Namen für den Kulanz-Brief. Getrennte
// Routen mit getrennten Schemata sind Absicht — der Tarif-Scan kann so gar
// kein Namensfeld zurückgeben, auch nicht versehentlich.
//
// WARUM DIE BREMSEN HIER STEHEN UND NICHT IN DEN ROUTEN: Als Zustand auf
// Modulebene zählen beide Routen in denselben Eimer, SOLANGE SIE IM SELBEN
// PROZESS LAUFEN. Läge je eine eigene Bremse in jeder Route, wäre die Grenze
// auch dann verdoppelt, wenn ein Prozess beide bedient.
//
// Was das NICHT leistet: Die Begrenzung ist und bleibt „pro Instanz" (siehe
// Kopf von rate-limit.ts). Legt die Plattform die Routen in getrennte
// Prozesse oder skaliert sie hoch, zählt jeder Prozess für sich. Die Bremse
// ist eine grobe Notbremse gegen Fluten und versehentliche Mehrfachversuche,
// kein verlässliches Kontingent — dafür bräuchte es einen gemeinsamen
// Speicher außerhalb des Prozesses.
//
// Die Reihenfolge ist von billig nach teuer: Herkunft und angekündigte Größe
// (nur Header), dann die Anfragebremse, dann die Datei selbst, und erst ganz
// zum Schluss die Bremse für den bezahlten Aufruf.

import { uploadPostAblehnung } from "../herkunft";
import { ratenBegrenzer, ratenSchluessel } from "../rate-limit";
import { ipAusRequest } from "../netz/server";
import { MAX_UPLOAD_BYTES, dateiPruefen, type Dateityp } from "./dateipruefung";
import { scanVerfuegbar } from "./extraktion";

/** Etwas Luft über der reinen Dateigröße für den Multipart-Rahmen. */
const MAX_ANFRAGE_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;

// ZWEI Bremsen, weil nicht jede Anfrage gleich viel kostet.
//
// Die eine zählt alles, was hereinkommt, und hält bloßes Fluten ab. Die
// andere zählt nur, was tatsächlich bis zum bezahlten Aufruf kommt.
//
// Der Unterschied ist keine Feinheit: Läge nur eine Bremse vorn, würde jemand,
// der versehentlich das falsche Bild erwischt, seine Scans verbrauchen, ohne
// dass uns das einen Cent gekostet hätte — bestraft würde der Ungeschickte,
// nicht der Angreifer.
const ANFRAGEN_PRO_STUNDE = 40;
const SCANS_PRO_STUNDE = 8;
const STUNDE = 60 * 60 * 1000;

const anfrageBremse = ratenBegrenzer(ANFRAGEN_PRO_STUNDE, STUNDE);
const scanBremse = ratenBegrenzer(SCANS_PRO_STUNDE, STUNDE);

const zuVieleAnfragen = () =>
  Response.json(
    { error: "Zu viele Versuche. Bitte in einer Stunde noch einmal probieren." },
    { status: 429 }
  );

/** Klartext für die Fälle, in denen die Datei gar nicht erst brauchbar ist. */
const DATEI_MELDUNG: Record<string, string> = {
  leer: "Die Datei ist leer.",
  zu_gross: "Die Datei ist zu groß.",
  unbekannter_typ: "Das ist kein Foto und kein PDF.",
  zu_viele_seiten: "Das PDF hat zu viele Seiten — bitte nur die Rechnung schicken.",
};

export type AnfrageErgebnis =
  /** Alles geprüft, der bezahlte Aufruf ist freigegeben. */
  | { ok: true; bytes: Uint8Array; typ: Dateityp }
  /** Fertige Antwort für den Browser — die Route gibt sie unverändert zurück. */
  | { ok: false; antwort: Response };

/**
 * Nimmt die hochgeladene Rechnung an und prüft alles, was vor dem bezahlten
 * Aufruf zu prüfen ist.
 *
 * Gibt bei Erfolg die geprüften Bytes samt erkanntem Typ zurück — erkannt
 * anhand der ersten Bytes, nicht anhand der Behauptung des Browsers.
 */
export async function rechnungAnfrageAnnehmen(request: Request): Promise<AnfrageErgebnis> {
  const ablehnung = uploadPostAblehnung(request, MAX_ANFRAGE_BYTES);
  if (ablehnung) return { ok: false, antwort: ablehnung };

  // Nur zur Ratenbegrenzung, flüchtig im Arbeitsspeicher — die IP wird weder
  // gespeichert noch geloggt.
  const schluessel = ratenSchluessel(ipAusRequest(request));
  if (anfrageBremse(schluessel)) return { ok: false, antwort: zuVieleAnfragen() };

  if (!scanVerfuegbar()) {
    return {
      ok: false,
      antwort: Response.json({ error: "Der Scan ist gerade nicht verfügbar." }, { status: 503 }),
    };
  }

  let datei: File | null = null;
  try {
    const formular = await request.formData();
    const wert = formular.get("datei");
    if (wert instanceof File) datei = wert;
  } catch {
    return {
      ok: false,
      antwort: Response.json({ error: "Anfrage nicht lesbar." }, { status: 400 }),
    };
  }
  if (!datei) {
    return { ok: false, antwort: Response.json({ error: "Keine Datei dabei." }, { status: 400 }) };
  }

  const bytes = new Uint8Array(await datei.arrayBuffer());
  const pruefung = dateiPruefen(bytes);
  if (!pruefung.ok) {
    return {
      ok: false,
      antwort: Response.json(
        {
          error: DATEI_MELDUNG[pruefung.grund] ?? "Datei nicht verwendbar.",
          grund: pruefung.grund,
        },
        { status: 422 }
      ),
    };
  }

  // Ab hier wird es kostenpflichtig — erst jetzt zählt der Scan.
  if (scanBremse(schluessel)) return { ok: false, antwort: zuVieleAnfragen() };

  return { ok: true, bytes, typ: pruefung.typ };
}

/**
 * Übersetzt einen Lesefehler in eine Antwort.
 *
 * Trennt, was der Nutzer selbst beheben kann (422), von einer Störung auf
 * unserer Seite (503) — sonst versucht er es gar nicht erst noch einmal.
 */
export function leseFehlerAntwort(fehler: string): Response {
  const behebbar = fehler === "unlesbar" || fehler === "abgelehnt";
  return Response.json(
    {
      error: behebbar
        ? "Die Datei konnte nicht gelesen werden. Bitte noch einmal fotografieren."
        : "Der Scan ist gerade gestört. Bitte später noch einmal versuchen.",
      grund: fehler,
    },
    { status: behebbar ? 422 : 503 }
  );
}
