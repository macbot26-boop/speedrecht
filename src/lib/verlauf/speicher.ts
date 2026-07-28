// Wo der Messverlauf liegt: im Speicher des Geräts, nicht auf unserem Server.
//
// Warum auf dem Gerät: Ein Verlauf, der einer Person zugeordnet werden kann,
// sind personenbezogene Daten — mit allem, was daran hängt. Hier verlässt
// nichts das Gerät, es gibt kein Konto und keine Kennung, die uns erreicht.
//
// Warum trotzdem mit Kennung, Zeitstempel und Formatversion: Genau die drei
// Felder braucht eine spätere Zusammenführung mit einem Server-Verlauf, und
// genau die lassen sich nicht nachrüsten — die Messungen wären dann schon da,
// ohne sie. Sie kosten heute fast nichts und halten die Tür offen.
//
// GRUNDSATZ DIESER DATEI: Ein Speicher darf nie ein Urteil verhindern. Jeder
// Weg hier endet mit einer brauchbaren Liste, auch wenn der Browser das
// Schreiben verweigert (privater Modus) oder alte Daten beschädigt sind.
// Lieber ein Verlauf, der bei null anfängt, als eine App, die nicht startet.

import type { VerlaufEintrag } from "./fenster.ts";

/**
 * Der Schlüssel trägt die Formatversion im Namen.
 *
 * Ein späteres Format schreibt unter "…v2" und lässt "…v1" unberührt liegen —
 * so kann eine neue Fassung alte Messungen übernehmen, statt beim ersten
 * Einlesen über sie zu stolpern.
 */
export const SPEICHER_SCHLUESSEL = "speedrecht.verlauf.v1";

/**
 * Obergrenze für gespeicherte Messungen.
 *
 * Beurteilt werden ohnehin nur die letzten 3 Messtage; alles darüber ist
 * Vorgeschichte. Die Grenze verhindert, dass der Speicher eines Vielmessers
 * über Jahre unbemerkt wächst — überzählige Messungen fallen von hinten weg,
 * also immer die ältesten.
 */
export const MAX_EINTRAEGE = 500;

/** Der Ausschnitt der Browser-Ablage, den wir benutzen — für Tests ersetzbar. */
export interface Ablage {
  getItem(schluessel: string): string | null;
  setItem(schluessel: string, wert: string): void;
}

/**
 * Die Ablage des Browsers — oder `null`, wenn es keine gibt.
 *
 * Der Zugriff selbst steht im try: Blockiert jemand Cookies, wirft schon das
 * Lesen von `window.localStorage` einen Fehler, nicht erst das Schreiben.
 * Auf dem Server (kein `window`) gibt es sie ohnehin nicht.
 */
export function geraeteAblage(): Ablage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Prüft eine gelesene Messung Feld für Feld — fremde Daten sind nie vertrauenswürdig. */
function alsEintrag(roh: unknown): VerlaufEintrag | null {
  if (typeof roh !== "object" || roh === null) return null;
  const e = roh as Record<string, unknown>;
  if (typeof e.id !== "string" || e.id === "") return null;
  if (typeof e.tarifSlug !== "string" || e.tarifSlug === "") return null;
  if (typeof e.tag !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.tag)) return null;
  if (typeof e.mbps !== "number" || !Number.isFinite(e.mbps) || e.mbps < 0) return null;
  if (typeof e.zeit !== "number" || !Number.isFinite(e.zeit) || e.zeit <= 0) return null;
  const verbindung =
    e.verbindung === "wifi" || e.verbindung === "lan" ? e.verbindung : "unknown";
  return {
    id: e.id,
    mbps: e.mbps,
    tag: e.tag,
    zeit: e.zeit,
    tarifSlug: e.tarifSlug,
    verbindung,
  };
}

/**
 * Liest den Verlauf. Bei fehlender Ablage, kaputtem Inhalt oder unbekanntem
 * Format kommt eine leere Liste zurück — nie ein Fehler.
 *
 * Einzelne unbrauchbare Messungen werden übersprungen, statt die ganze Liste
 * zu verwerfen: Ein beschädigter Eintrag soll nicht 40 gesunde mitnehmen.
 */
export function verlaufLesen(ablage: Ablage | null = geraeteAblage()): VerlaufEintrag[] {
  if (!ablage) return [];
  let roh: string | null;
  try {
    roh = ablage.getItem(SPEICHER_SCHLUESSEL);
  } catch {
    return [];
  }
  if (!roh) return [];
  try {
    const gelesen: unknown = JSON.parse(roh);
    if (!Array.isArray(gelesen)) return [];
    const eintraege: VerlaufEintrag[] = [];
    for (const r of gelesen) {
      const e = alsEintrag(r);
      if (e) eintraege.push(e);
    }
    return eintraege;
  } catch {
    return [];
  }
}

/**
 * Nimmt eine Messung auf und gibt den vollständigen Verlauf zurück.
 *
 * Gibt die neue Liste AUCH DANN zurück, wenn das Speichern fehlgeschlagen ist.
 * Das ist der wichtigste Zug dieser Datei: Im privaten Modus mancher Browser
 * lässt sich nichts schreiben — die gerade gemessene Zahl steht dem Urteil
 * aber trotzdem zur Verfügung, und der Nutzer sieht dasselbe Ergebnis wie
 * vorher. Nur seine Vorgeschichte fehlt.
 *
 * Gleiche Kennung überschreibt: Wer im Ergebnis den Tarif korrigiert, hat
 * nicht neu gemessen — dieselbe Messung gehört dann nur zu einem anderen
 * Vertrag. Ohne das Überschreiben stünde sie doppelt in der Reihe.
 */
export function verlaufEintragen(
  eintrag: VerlaufEintrag,
  ablage: Ablage | null = geraeteAblage()
): VerlaufEintrag[] {
  const vorher = verlaufLesen(ablage);
  const ohneAlte = vorher.filter((e) => e.id !== eintrag.id);
  // Nach Zeit sortiert ablegen, damit "die ältesten fallen weg" am Anfang der
  // Liste steht und nicht von der Einfügereihenfolge abhängt.
  const alle = [...ohneAlte, eintrag].sort((a, b) => a.zeit - b.zeit || a.id.localeCompare(b.id));
  const gekuerzt = alle.slice(-MAX_EINTRAEGE);
  try {
    ablage?.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(gekuerzt));
  } catch {
    // Speicher voll oder gesperrt — die Liste unten stimmt trotzdem.
  }
  return gekuerzt;
}

/**
 * Eine neue Kennung für eine Messung.
 *
 * `crypto.randomUUID` gibt es nicht überall (ältere Safari-Fassungen). Der
 * Ersatz muss nicht kryptografisch sein: Die Kennung unterscheidet Messungen
 * EINES Geräts voneinander, sie ist kein Geheimnis und keine Wiedererkennung.
 */
export function neueKennung(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fällt unten durch
  }
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Der Kalendertag "JJJJ-MM-TT" in der LOKALEN Zeit des Geräts.
 *
 * Bewusst von Hand zusammengesetzt statt über `toISOString()`: Das rechnet
 * nach UTC um, und für alle östlich von Greenwich läge eine Messung um 00:30
 * damit auf dem Vortag — mitten in der Nacht spränge der Messtag zurück.
 */
export function lokalerTag(zeitpunkt: Date): string {
  const zweistellig = (n: number) => String(n).padStart(2, "0");
  return [
    zeitpunkt.getFullYear(),
    zweistellig(zeitpunkt.getMonth() + 1),
    zweistellig(zeitpunkt.getDate()),
  ].join("-");
}
