// POST /api/rechnung — nimmt EIN Foto oder PDF einer Rechnung entgegen, liest
// die gedruckten Angaben aus und ordnet den Vertragsnamen unserer Tarifliste zu.
//
// Datenschutz: Die Datei wird NICHT gespeichert. Sie lebt für die Dauer dieser
// einen Anfrage im Arbeitsspeicher, geht einmal an Claude und wird danach
// fallen gelassen — kein Schreibvorgang, kein Zwischenspeicher, keine
// Datenbank. Auch die ausgelesenen Angaben werden nirgends abgelegt, sondern
// nur an den Browser zurückgegeben, der sie angefragt hat. Nach Name und
// Anschrift wird gar nicht erst gefragt (Begründung im Kopf von
// rechnung/extraktion.ts). Es wird bewusst NICHTS aus dieser Anfrage
// protokolliert, auch keine Fehlermeldungen der Bibliothek — die können Teile
// der Anfrage enthalten, und in der Anfrage steckt die Rechnung.
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
import { leseFehlerAntwort, rechnungAnfrageAnnehmen } from "@/lib/rechnung/anfrage";
import { rechnungLesen } from "@/lib/rechnung/extraktion";

export async function POST(request: Request) {
  // Herkunft, Ratenbremsen und Dateiprüfung liegen in `anfrage.ts`, gemeinsam
  // mit `/api/rechnung/name` — damit beide Routen in denselben Eimer zählen,
  // solange sie im selben Prozess laufen (Grenzen der Bremse: dort im Kopf).
  const anfrage = await rechnungAnfrageAnnehmen(request);
  if (!anfrage.ok) return anfrage.antwort;

  const gelesen = await rechnungLesen(anfrage.bytes, anfrage.typ);
  if (!gelesen.ok) return leseFehlerAntwort(gelesen.fehler);

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
  });
}
