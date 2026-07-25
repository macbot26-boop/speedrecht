// Wohin der Kulanz-Brief geht — Anschrift und, falls es sie gibt, E-Mail.
//
// ZWEI REGELN BESTIMMEN DIESE DATEI:
//
// 1. Adressiert wird die VERTRAGSGESELLSCHAFT, nicht der Website-Betreiber.
//    Das ist dieselbe Lehre wie beim Rechnungs-Scan: Im Briefkopf einer
//    Rechnung steht die abrechnende Gesellschaft, und die weicht von der Marke
//    ab. Bei 1&1 ist der Unterschied greifbar — das Impressum der Website nennt
//    die "1&1 Telecommunication SE", die Produktinformationsblätter nennen in
//    jedem einzelnen Fall die "1&1 Telecom GmbH". Der Brief geht an die
//    Gesellschaft, mit der der Vertrag besteht.
//
// 2. Jeder Eintrag trägt seine Quelle und sein Prüfdatum. Eine tote
//    Kontaktadresse fällt niemandem auf — der Brief geht raus und kommt nie an.
//    Wer diese Datei auffrischt, prüft jeden Eintrag neu gegen die genannte
//    Quelle und schreibt das Datum fort.
//
// WAS HIER FEHLT UND WARUM: Vier der sechs Anbieter haben KEINE E-Mail-Adresse
// für Kundenanliegen. Geprüft am 25.07.2026 an den Impressen von Telekom,
// Vodafone, o2 und Deutsche Glasfaser: Dort steht jeweils nur eine Adresse für
// das Impressum selbst (etwa impressum@telekom.de), und die Anbieter verweisen
// ausdrücklich auf ihre Kontaktformulare und Kundenportale. Deutsche Glasfaser
// führt zusätzlich business@ — ausdrücklich für Geschäftskunden.
// Eine Impressums-Adresse als Kundenkontakt auszugeben wäre erfunden, und der
// Brief landete an einer Stelle, die ihn nicht bearbeitet. Deshalb steht dort
// `email: null`, und die Oberfläche sagt dem Nutzer offen, dass er die Adresse
// selbst einträgt.

/** Postanschrift der Vertragsgesellschaft, zeilenweise für den Briefkopf. */
export interface AnbieterKontakt {
  /** Firmierung, wie sie in den Produktinformationsblättern gedruckt ist. */
  gesellschaft: string;
  /** Straße und Hausnummer. `null` bei Anbietern mit Großempfänger-Postleitzahl. */
  strasse: string | null;
  /** Postleitzahl und Ort. */
  ort: string;
  /**
   * E-Mail für Kundenanliegen — `null`, wenn der Anbieter keine veröffentlicht.
   * Ausdrücklich NICHT die Impressums-Adresse: Die ist für Anliegen zum
   * Impressum bestimmt und bearbeitet keine Vertragsfragen.
   */
  email: string | null;
  /** Woher die Angaben stammen — nachschlagbar, nicht aus dem Gedächtnis. */
  beleg: string;
  /** Wann zuletzt gegen die Quelle geprüft, als "JJJJ-MM-TT". */
  geprueft: string;
}

/**
 * Verzeichnis nach Anbietername aus `FESTNETZ_ANBIETER`.
 *
 * Enthalten sind die sechs Anbieter, für die es auch Tarifdaten gibt. Für
 * NetCologne, EWE und M-net gibt es keine Blätter in der Datenbank — dort käme
 * ohnehin kein Tarif und damit kein Brief zustande.
 */
export const ANBIETER_KONTAKTE: Readonly<Record<string, AnbieterKontakt>> = {
  Telekom: {
    gesellschaft: "Telekom Deutschland GmbH",
    strasse: "Landgrabenweg 149",
    ort: "53227 Bonn",
    email: null,
    beleg:
      "Anschrift in 47 von 47 Telekom-Produktinformationsblättern, gleichlautend im Impressum telekom.de/impressum. Dort keine Kunden-E-Mail, Verweis auf telekom.de/kontakt.",
    geprueft: "2026-07-25",
  },
  Vodafone: {
    gesellschaft: "Vodafone GmbH",
    strasse: "Ferdinand-Braun-Platz 1",
    ort: "40549 Düsseldorf",
    email: null,
    beleg:
      "Anschrift in 313 Vodafone-Produktinformationsblättern. Keine Kunden-E-Mail im Impressum; dort nur impressum@vodafone.com und ein Kontaktformular.",
    geprueft: "2026-07-25",
  },
  o2: {
    gesellschaft: "Telefónica Germany GmbH & Co. OHG",
    strasse: "Georg-Brauchle-Ring 50",
    ort: "80992 München",
    email: null,
    beleg:
      "Anschrift in 96 o2-Produktinformationsblättern und im Impressum o2online.de/recht/impressum. 36 ältere Blätter nennen noch Georg-Brauchle-Ring 23-25 — überholt. Keine Kunden-E-Mail, nur impressum@cc.o2online.de.",
    geprueft: "2026-07-25",
  },
  "1&1": {
    gesellschaft: "1&1 Telecom GmbH",
    strasse: "Elgendorfer Straße 57",
    ort: "56410 Montabaur",
    email: "info@1und1.de",
    beleg:
      "Anschrift in allen 1&1-Produktinformationsblättern. E-Mail im Impressum unternehmen.1und1.de/impressum unter „Kontakt 1&1“ als allgemeiner Kundenkontakt ausgewiesen.",
    geprueft: "2026-07-25",
  },
  PŸUR: {
    gesellschaft: "PYUR Sales & Service GmbH",
    strasse: "Messe-Allee 2",
    ort: "04356 Leipzig",
    email: "kundenservice@pyur.com",
    beleg:
      "Anschrift in 60 PŸUR-Produktinformationsblättern. E-Mail im Impressum pyur.com/impressum ausdrücklich „für Kundenanfragen“. Achtung: PŸUR nennt fünf kundenführende Gesellschaften, die Vertragspartnerin hängt an der Anschrift des Anschlusses.",
    geprueft: "2026-07-25",
  },
  "Deutsche Glasfaser": {
    gesellschaft: "Deutsche Glasfaser Wholesale GmbH",
    // Großempfänger-Postleitzahl: Düsseldorf 40463 nimmt die Post ohne Straße
    // an. So steht es in den Blättern und so steht es im Impressum.
    strasse: null,
    ort: "40463 Düsseldorf",
    email: null,
    beleg:
      "Gesellschaft und Postanschrift in 6 von 6 Deutsche-Glasfaser-Produktinformationsblättern („Kontakt: 40463 Düsseldorf (Postanschrift)“), gleichlautend im Impressum. Keine Kunden-E-Mail für Privatkunden — business@ ist ausdrücklich für Geschäftskunden.",
    geprueft: "2026-07-25",
  },
};

/**
 * Kontakt zu einem Anbieternamen — `null`, wenn keiner hinterlegt ist.
 *
 * `Object.hasOwn` statt eines schlichten Zugriffs: Der Anbietername kann aus
 * der gescannten Rechnung stammen, also aus fremdem Text. Ohne die Prüfung
 * lieferte `kontaktFuer("toString")` die geerbte Funktion des Objekts zurück
 * statt `null` — und der Aufrufer hielte einen Kontakt in der Hand, den es
 * nicht gibt.
 */
export function kontaktFuer(anbieter: string): AnbieterKontakt | null {
  return Object.hasOwn(ANBIETER_KONTAKTE, anbieter) ? ANBIETER_KONTAKTE[anbieter] : null;
}

/**
 * Die Anschrift als Zeilen für den Briefkopf.
 *
 * Eigene Funktion, damit PDF-Ausdruck und Bildschirm dieselbe Reihenfolge
 * zeigen und die fehlende Straße an einer Stelle behandelt wird.
 */
export function anschriftZeilen(kontakt: AnbieterKontakt): string[] {
  return [kontakt.gesellschaft, kontakt.strasse, kontakt.ort].filter(
    (zeile): zeile is string => zeile !== null
  );
}
