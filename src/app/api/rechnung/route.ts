// POST /api/rechnung — nimmt EIN Foto oder PDF einer Rechnung entgegen, liest
// die gedruckten Angaben aus und ordnet den Vertragsnamen unserer Tarifliste zu.
//
// Datenschutz: Die Datei wird NICHT gespeichert. Sie lebt für die Dauer dieser
// einen Anfrage im Arbeitsspeicher, geht einmal an Claude und wird danach
// fallen gelassen — kein Schreibvorgang, kein Zwischenspeicher, keine
// Datenbank. Auch die ausgelesenen Angaben (Name, Anschrift, Kundennummer)
// werden nirgends abgelegt, sondern nur an den Browser zurückgegeben, der sie
// angefragt hat. Es wird bewusst NICHTS aus dieser Anfrage protokolliert, auch
// keine Fehlermeldungen der Bibliothek — die können Teile der Anfrage
// enthalten, und in der Anfrage steckt die Rechnung.
//
// Sicherheitsmodell: Weder der Client noch der Bildinhalt sind
// vertrauenswürdig. Vier Ebenen, von billig nach teuer geordnet, damit
// Missbrauch früh und ohne Kosten abprallt:
//   1. Herkunft und angekündigte Größe (nur Header, noch kein Byte gelesen)
//   2. Ratenbremse pro Anschluss
//   3. Dateityp anhand der ersten Bytes, nicht anhand der Behauptung des
//      Browsers; Seitenzahl bei PDFs
//   4. Nach dem Lesen: jedes Feld geprüft, der Vertragsname muss sich in
//      unserer Tarifliste wiederfinden — sonst wird er verworfen
//
// Anweisungen, die jemand auf sein Bild schreibt, laufen deshalb ins Leere:
// Es gibt kein Werkzeug, das sie auslösen könnten, kein freies Antwortformat
// und kein Feld, dessen Inhalt ungeprüft weiterwandert.

import tarifDaten from "@/lib/tarife/tarife.generated.json";
import { rechnungAbgleichen } from "@/lib/tarife/rechnung-abgleich";
import { uploadPostAblehnung } from "@/lib/herkunft";
import { ratenBegrenzer, ratenSchluessel } from "@/lib/rate-limit";
import { ipAusRequest } from "@/lib/netz/server";
import { MAX_UPLOAD_BYTES, dateiPruefen } from "@/lib/rechnung/dateipruefung";
import { rechnungLesen, scanVerfuegbar } from "@/lib/rechnung/extraktion";

// Etwas Luft über der reinen Dateigröße für den Multipart-Rahmen.
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

export async function POST(request: Request) {
  const ablehnung = uploadPostAblehnung(request, MAX_ANFRAGE_BYTES);
  if (ablehnung) return ablehnung;

  // Nur zur Ratenbegrenzung, flüchtig im Arbeitsspeicher — die IP wird weder
  // gespeichert noch geloggt.
  const schluessel = ratenSchluessel(ipAusRequest(request));
  if (anfrageBremse(schluessel)) return zuVieleAnfragen();

  if (!scanVerfuegbar()) {
    return Response.json({ error: "Der Scan ist gerade nicht verfügbar." }, { status: 503 });
  }

  let datei: File | null = null;
  try {
    const formular = await request.formData();
    const wert = formular.get("datei");
    if (wert instanceof File) datei = wert;
  } catch {
    return Response.json({ error: "Anfrage nicht lesbar." }, { status: 400 });
  }
  if (!datei) return Response.json({ error: "Keine Datei dabei." }, { status: 400 });

  const bytes = new Uint8Array(await datei.arrayBuffer());
  const pruefung = dateiPruefen(bytes);
  if (!pruefung.ok) {
    return Response.json(
      { error: DATEI_MELDUNG[pruefung.grund] ?? "Datei nicht verwendbar.", grund: pruefung.grund },
      { status: 422 }
    );
  }

  // Ab hier wird es kostenpflichtig — erst jetzt zählt der Scan.
  if (scanBremse(schluessel)) return zuVieleAnfragen();

  const gelesen = await rechnungLesen(bytes, pruefung.typ);
  if (!gelesen.ok) {
    // Was der Nutzer selbst beheben kann (422), von einer Störung auf unserer
    // Seite (503) trennen — sonst versucht er es gar nicht erst noch einmal.
    const behebbar = gelesen.fehler === "unlesbar" || gelesen.fehler === "abgelehnt";
    return Response.json(
      {
        error: behebbar
          ? "Die Datei konnte nicht gelesen werden. Bitte noch einmal fotografieren."
          : "Der Scan ist gerade gestört. Bitte später noch einmal versuchen.",
        grund: gelesen.fehler,
      },
      { status: behebbar ? 422 : 503 }
    );
  }

  const { angaben } = gelesen;
  if (!angaben.istRechnung) {
    return Response.json({ istRechnung: false });
  }

  // Der gelesene Text ist ab hier nur noch Suchanfrage: Was sich nicht in
  // unserer Tarifliste wiederfindet, wird verworfen.
  const abgleich = rechnungAbgleichen(tarifDaten, {
    anbieter: angaben.anbieter,
    tarifname: angaben.tarifname,
  });

  return Response.json({
    istRechnung: true,
    lage: abgleich.lage,
    anbieter: abgleich.anbieter,
    tarifname: abgleich.tarifname,
    klassen: abgleich.klassen,
    // Rein anzeigend bzw. für den Kulanz-Brief in Phase 5. Der Preis wird
    // ausdrücklich NICHT zur Tarifbestimmung benutzt (siehe rechnung-abgleich).
    kundennummer: angaben.kundennummer,
    monatspreisEur: angaben.monatspreisEur,
    name: angaben.name,
    anschrift: angaben.anschrift,
  });
}
