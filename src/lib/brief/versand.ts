// Die drei Wege, auf denen der Brief den Nutzer verlässt: Zwischenablage,
// Druck (und damit „Als PDF sichern"), E-Mail-Entwurf.
//
// Alles hier ist reine Zeichenketten-Arbeit und damit ohne Browser prüfbar.
// Das ist kein Selbstzweck — an beiden Stellen lauert ein LEISER Fehler:
//
// 1. Ein zu langer `mailto:`-Verweis wird von manchen Mailprogrammen
//    stillschweigend GEKÜRZT. Der Nutzer sähe einen Entwurf, dem hinten etwas
//    fehlt, und schickte ihn ab. Deshalb eine eigene Längengrenze mit Test
//    über alle Tarife der Datenbank — dieselbe Haltung wie bei der
//    Upload-Grenze des Rechnungs-Scans.
//
// 2. In das Druck-Dokument fließen Tarifname (aus unserer Datenbank, aber
//    ursprünglich aus einem PDF) sowie Name und Kundennummer (vom Nutzer oder
//    aus einer gescannten Rechnung). Alles davon ist fremder Text und wird
//    maskiert, bevor es HTML wird.

import type { Brief } from "./text.ts";
import type { AnbieterKontakt } from "./kontakte.ts";
import { anschriftZeilen } from "./kontakte.ts";

/**
 * Obergrenze für den `mailto:`-Verweis, konservativ gewählt.
 *
 * Ältere Windows-Mailprogramme schneiden oberhalb von etwa 2000 Zeichen ab,
 * ohne es zu melden. 1800 lässt Luft und ist immer noch weit über dem, was
 * unsere Briefe brauchen (gemessen: gut 1200 Zeichen beim längsten Tarifnamen).
 */
export const MAILTO_MAX_LAENGE = 1800;

export interface Mailto {
  /** Der fertige Verweis, oder `null`, wenn er zu lang würde. */
  url: string | null;
  /**
   * Warum kein Verweis gebaut wurde. `"zu_lang"` heißt: Der Entwurf käme
   * womöglich gekürzt an — dann ist Kopieren der ehrlichere Weg.
   */
  grund: "zu_lang" | null;
}

/**
 * Baut den `mailto:`-Verweis.
 *
 * Der Empfänger darf leer sein: Vier der sechs Anbieter veröffentlichen keine
 * Kundenadresse (siehe kontakte.ts). Dann öffnet das Mailprogramm mit fertigem
 * Betreff und Text, und der Nutzer trägt die Adresse selbst ein — besser, als
 * eine Adresse zu erfinden, die den Brief nicht bearbeitet.
 */
export function mailtoUrl(empfaenger: string | null, brief: Brief): Mailto {
  const felder = new URLSearchParams({ subject: brief.betreff, body: brief.text });
  // URLSearchParams kodiert Leerzeichen als "+", was in einem mailto-Verweis
  // als Pluszeichen im Text ankäme. Deshalb %20.
  const url = `mailto:${encodeURIComponent(empfaenger ?? "")}?${felder.toString().replace(/\+/g, "%20")}`;
  if (url.length > MAILTO_MAX_LAENGE) return { url: null, grund: "zu_lang" };
  return { url, grund: null };
}

/** Maskiert fremden Text, bevor er HTML wird. */
export function htmlSicher(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface DruckEingabe {
  brief: Brief;
  kontakt: AnbieterKontakt | null;
  /** Datum, fertig formatiert — dieselbe Regel wie in text.ts. */
  datum: string;
  /** Absendername, falls angegeben. */
  name: string | null;
}

/**
 * Das vollständige Druck-Dokument als HTML.
 *
 * Eigene Seite statt eines Druck-Stylesheets für die App: Der Ergebnis-Schirm
 * enthält Knöpfe, Messwerte und Hinweise, die auf einem Brief nichts zu suchen
 * haben. Ein eigenes Dokument ist verlässlicher als der Versuch, das alles
 * per `@media print` wieder auszublenden.
 *
 * Kein Skript, keine externen Verweise — das Dokument wird in einen leeren
 * Rahmen geschrieben und gedruckt, sonst nichts.
 */
export function briefHtml({ brief, kontakt, datum, name }: DruckEingabe): string {
  const empfaenger = kontakt
    ? anschriftZeilen(kontakt).map(htmlSicher).join("<br>")
    : "<span class=\"leer\">Anschrift deines Anbieters</span>";

  const absaetze = brief.text
    .split("\n\n")
    .map((absatz) => `<p>${htmlSicher(absatz).replace(/\n/g, "<br>")}</p>`)
    .join("\n    ");

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>${htmlSicher(brief.betreff)}</title>
<style>
  @page { margin: 25mm 20mm; }
  body { font: 11pt/1.6 Helvetica, Arial, sans-serif; color: #000; }
  .absender { font-size: 9pt; color: #444; margin-bottom: 18mm; }
  .empfaenger { margin-bottom: 12mm; }
  .datum { text-align: right; margin-bottom: 10mm; }
  .betreff { font-size: 11pt; font-weight: bold; margin: 0 0 8mm; }
  p { margin: 0 0 5mm; }
  .leer { color: #888; font-style: italic; }
</style>
</head>
<body>
  <div class="absender">${name ? htmlSicher(name) : ""}</div>
  <div class="empfaenger">${empfaenger}</div>
  <div class="datum">${htmlSicher(datum)}</div>
  <h1 class="betreff">${htmlSicher(brief.betreff)}</h1>
  ${absaetze}
</body>
</html>`;
}
