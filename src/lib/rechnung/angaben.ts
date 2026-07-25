// Prüfung der Felder, die das Modell von einer Rechnung zurückgibt.
//
// Bewusst von der Netz-Anbindung getrennt: Das hier ist die Stelle, an der
// fremder Text auf feste Grenzen trifft, und sie muss ohne API-Schlüssel und
// ohne Netz prüfbar sein.
//
// Haltung: wohlwollend gegenüber Formfehlern, streng gegenüber Inhalten. Was
// nicht passt, wird zu `null` — nie zu einem Fehler, der den ganzen Scan
// scheitern lässt. Ein fehlendes Feld kostet einen Handgriff, ein falsches
// Feld kostet Vertrauen.

/**
 * Was auf der Rechnung stand — geprüft, gekürzt, einzeilig.
 *
 * Name und Anschrift des Anschlussinhabers fehlen hier bewusst; siehe die
 * Begründung im Kopf von extraktion.ts.
 */
export interface RechnungsAngaben {
  /** Sieht das Dokument überhaupt nach einer Telekommunikations-Rechnung aus? */
  istRechnung: boolean;
  anbieter: string | null;
  tarifname: string | null;
  kundennummer: string | null;
  monatspreisEur: number | null;
}

/**
 * Längen, ab denen ein Feld nicht mehr plausibel ist.
 *
 * Sie begrenzen zugleich, wie viel fremder Text überhaupt weitergereicht
 * werden kann: Wer einen Roman auf seine Rechnung druckt, bekommt ihn hier
 * abgeschnitten.
 */
export const MAX_LAENGE = {
  anbieter: 80,
  tarifname: 120,
  kundennummer: 40,
} as const;

const MAX_MONATSPREIS_EUR = 1000;

/** Leere Angaben — die Antwort für alles, was keine Rechnung ist. */
export const KEINE_ANGABEN: RechnungsAngaben = {
  istRechnung: false,
  anbieter: null,
  tarifname: null,
  kundennummer: null,
  monatspreisEur: null,
};

export function alsText(wert: unknown, maxLaenge: number): string | null {
  if (typeof wert !== "string") return null;
  // Steuerzeichen raus (auch Zeilenumbrüche — alles wird einzeilig angezeigt),
  // Leerraum zusammenfassen, hart kürzen.
  const sauber = wert
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sauber ? sauber.slice(0, maxLaenge) : null;
}

export function alsBetrag(wert: unknown): number | null {
  if (typeof wert !== "number" || !Number.isFinite(wert)) return null;
  if (wert <= 0 || wert > MAX_MONATSPREIS_EUR) return null;
  return Math.round(wert * 100) / 100;
}

/** Bringt die Antwort des Modells auf geprüfte Form. */
export function angabenPruefen(roh: unknown): RechnungsAngaben {
  if (typeof roh !== "object" || roh === null) return KEINE_ANGABEN;
  const o = roh as Record<string, unknown>;
  if (o.ist_rechnung !== true) return KEINE_ANGABEN;

  return {
    istRechnung: true,
    anbieter: alsText(o.anbieter, MAX_LAENGE.anbieter),
    tarifname: alsText(o.tarifname, MAX_LAENGE.tarifname),
    kundennummer: alsText(o.kundennummer, MAX_LAENGE.kundennummer),
    monatspreisEur: alsBetrag(o.monatspreis_eur),
  };
}
