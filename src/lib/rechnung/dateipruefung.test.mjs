// Tests für die Eingangskontrolle hochgeladener Rechnungen.
//
// Kernaussage, die hier abgesichert wird: Entschieden wird anhand der ersten
// Bytes der Datei, NICHT anhand dessen, was der Browser über sie behauptet.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PDF_SEITEN,
  MAX_UPLOAD_BYTES,
  dateiPruefen,
  erkenneDateityp,
  pdfSeitenSchaetzen,
} from "./dateipruefung.ts";

const bytes = (...teile) =>
  new Uint8Array(
    teile.flatMap((t) => (typeof t === "string" ? [...t].map((c) => c.charCodeAt(0)) : t))
  );

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], "JFIF");
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "IHDR");
const GIF = bytes("GIF89a", [0x01, 0x00]);
const WEBP = bytes("RIFF", [0x24, 0x00, 0x00, 0x00], "WEBPVP8 ");
const PDF = bytes("%PDF-1.7\n", "/Type /Page\n", "trailer\n");

test("die gängigen Foto-Formate werden erkannt", () => {
  assert.equal(erkenneDateityp(JPEG), "image/jpeg");
  assert.equal(erkenneDateityp(PNG), "image/png");
  assert.equal(erkenneDateityp(GIF), "image/gif");
  assert.equal(erkenneDateityp(WEBP), "image/webp");
  assert.equal(erkenneDateityp(PDF), "application/pdf");
});

test("ein umbenanntes Programm ist kein Foto", () => {
  // ELF-Kopf (Linux-Programm) und ZIP-Kopf — beide oft als Bild getarnt.
  assert.equal(erkenneDateityp(bytes([0x7f], "ELF")), null);
  assert.equal(erkenneDateityp(bytes("PK", [0x03, 0x04])), null);
  assert.equal(erkenneDateityp(bytes("<html><script>")), null);
  assert.equal(erkenneDateityp(bytes("")), null);
});

test("RIFF allein genügt nicht — es muss WEBP dranstehen", () => {
  // Eine WAV-Datei ist ebenfalls ein RIFF-Container.
  assert.equal(erkenneDateityp(bytes("RIFF", [0x24, 0x00, 0x00, 0x00], "WAVEfmt ")), null);
});

test("leere und übergroße Dateien werden abgewiesen", () => {
  assert.deepEqual(dateiPruefen(new Uint8Array(0)), { ok: false, grund: "leer" });

  const zuGross = new Uint8Array(MAX_UPLOAD_BYTES + 1);
  zuGross.set([0xff, 0xd8, 0xff], 0);
  assert.deepEqual(dateiPruefen(zuGross), { ok: false, grund: "zu_gross" });
});

test("unbekannte Dateitypen werden abgewiesen", () => {
  assert.deepEqual(dateiPruefen(bytes("nur Text")), { ok: false, grund: "unbekannter_typ" });
});

test("ein normales Foto kommt durch", () => {
  assert.deepEqual(dateiPruefen(JPEG), { ok: true, typ: "image/jpeg" });
});

test("PDF-Seiten werden gezählt und gedeckelt", () => {
  assert.equal(pdfSeitenSchaetzen(PDF), 1);

  const vieleSeiten = bytes("%PDF-1.7\n", "/Type /Page\n".repeat(MAX_PDF_SEITEN + 1));
  assert.ok(pdfSeitenSchaetzen(vieleSeiten) > MAX_PDF_SEITEN);
  assert.deepEqual(dateiPruefen(vieleSeiten), { ok: false, grund: "zu_viele_seiten" });

  const genauAmDeckel = bytes("%PDF-1.7\n", "/Type /Page\n".repeat(MAX_PDF_SEITEN));
  assert.deepEqual(dateiPruefen(genauAmDeckel), { ok: true, typ: "application/pdf" });
});

test("'/Type /Pages' ist der Seitenbaum, keine Seite", () => {
  // Ohne die Abgrenzung würde jeder Sammelknoten mitgezählt.
  assert.equal(pdfSeitenSchaetzen(bytes("%PDF-1.7\n/Type /Pages\n")), 0);
});

test("ein PDF ohne erkennbare Seiten wird durchgelassen, nicht abgelehnt", () => {
  // Bei komprimierten Objekt-Strömen findet die Textsuche nichts. Lieber
  // durchlassen und die Byte-Grenze wirken lassen, als eine echte Rechnung
  // abzuweisen.
  const komprimiert = bytes("%PDF-1.7\n", [0x78, 0x9c, 0x01, 0x02, 0x03]);
  assert.equal(pdfSeitenSchaetzen(komprimiert), 0);
  assert.deepEqual(dateiPruefen(komprimiert), { ok: true, typ: "application/pdf" });
});
