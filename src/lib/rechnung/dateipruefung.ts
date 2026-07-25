// Eingangskontrolle für hochgeladene Rechnungen.
//
// Grundsatz: Was der Browser über die Datei BEHAUPTET (Dateiname, Content-Type
// im Formular), ist eine Angabe des Absenders und damit wertlos. Entschieden
// wird ausschließlich anhand der ersten Bytes der Datei selbst.
//
// Rein und ohne Seiteneffekte — vollständig ohne Netz und ohne API-Schlüssel
// prüfbar.

/** Formate, die Claude lesen kann und die wir deshalb annehmen. */
export type Dateityp = "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "application/pdf";

/**
 * Obergrenze pro Upload.
 *
 * Nicht zur Kostenbegrenzung gedacht — die übernimmt das Modell selbst, das
 * ein Bild unabhängig von seiner Größe auf höchstens rund 4.800 Token
 * herunterrechnet. Handyfotos liegen bei 2–5 MB, ein Rechnungs-PDF darunter.
 *
 * Der Wert MUSS unter der Grenze der Plattform bleiben (derzeit 10 MB), ab
 * der der Anfrage-Körper abgeschnitten wird. Sonst entstünde der übelste
 * Fehler überhaupt: ein LEISER. Der Dateikopf wäre intakt, die Typprüfung
 * liefe durch, und an Claude ginge ein halbes Bild — mit einem Ergebnis, das
 * niemand als falsch erkennen könnte. Lieber ehrlich ablehnen.
 */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Höchstzahl Seiten eines PDFs.
 *
 * Anders als beim Bild kostet jede PDF-Seite eigene Token. Eine Telekom-
 * Rechnung hat gut und gern acht Seiten, ein untergeschobenes 600-Seiten-PDF
 * wäre dagegen ein Kostenloch.
 */
export const MAX_PDF_SEITEN = 15;

const beginntMit = (bytes: Uint8Array, muster: number[], ab = 0): boolean =>
  muster.every((b, i) => bytes[ab + i] === b);

const zeichen = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

/**
 * Erkennt den Dateityp an den ersten Bytes — `null`, wenn es keiner der
 * unterstützten ist.
 *
 * Ein umbenanntes Video oder ein als Bild deklariertes Skript fällt hier
 * durch, egal was im Formular stand.
 */
export function erkenneDateityp(bytes: Uint8Array): Dateityp | null {
  if (beginntMit(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (beginntMit(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (beginntMit(bytes, zeichen("GIF87a")) || beginntMit(bytes, zeichen("GIF89a"))) {
    return "image/gif";
  }
  // WebP ist ein RIFF-Container: "RIFF" ....(Länge).... "WEBP"
  if (beginntMit(bytes, zeichen("RIFF")) && beginntMit(bytes, zeichen("WEBP"), 8)) {
    return "image/webp";
  }
  // Die PDF-Kennung darf laut Norm etwas eingerückt stehen.
  const kopf = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (kopf.includes("%PDF-")) return "application/pdf";
  return null;
}

/**
 * Grobe Seitenzahl eines PDFs.
 *
 * Bewusst eine Schätzung per Textsuche statt einer PDF-Bibliothek: Sie dient
 * nur als Deckel gegen absurd große Dokumente, und eine Fehlschätzung ist
 * durch MAX_UPLOAD_BYTES ohnehin nach oben begrenzt. Komprimierte
 * Objekt-Ströme kann sie nicht sehen — deshalb wird bei 0 gefundenen Seiten
 * NICHT abgelehnt, sondern durchgelassen.
 */
export function pdfSeitenSchaetzen(bytes: Uint8Array): number {
  const text = new TextDecoder("latin1").decode(bytes);
  return (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

export type PruefErgebnis =
  | { ok: true; typ: Dateityp }
  | { ok: false; grund: "leer" | "zu_gross" | "unbekannter_typ" | "zu_viele_seiten" };

/** Vollständige Eingangsprüfung einer hochgeladenen Datei. */
export function dateiPruefen(bytes: Uint8Array): PruefErgebnis {
  if (bytes.length === 0) return { ok: false, grund: "leer" };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, grund: "zu_gross" };

  const typ = erkenneDateityp(bytes);
  if (!typ) return { ok: false, grund: "unbekannter_typ" };

  if (typ === "application/pdf") {
    const seiten = pdfSeitenSchaetzen(bytes);
    if (seiten > MAX_PDF_SEITEN) return { ok: false, grund: "zu_viele_seiten" };
  }

  return { ok: true, typ };
}
