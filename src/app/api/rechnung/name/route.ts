// POST /api/rechnung/name — liest AUSSCHLIESSLICH den Namen des
// Anschlussinhabers von einer Rechnung, für die Unterschrift unter dem
// Kulanz-Brief.
//
// Eigene Route mit eigenem Schema, statt eines Feldes mehr im Tarif-Scan: Der
// Tarif-Scan soll gar kein Namensfeld haben können. Ein Feld, das es nicht
// gibt, kann auch nicht versehentlich übertragen werden — und die Zusage im
// Einwilligungstext des Scans bleibt wörtlich wahr.
//
// Diese Route wird nur aufgerufen, nachdem der Nutzer beim Brief ausdrücklich
// eingewilligt hat. Sie teilt sich Herkunftsprüfung, Ratenbremsen und
// Dateiprüfung mit `/api/rechnung` (siehe `rechnung/anfrage.ts`) — vor allem
// die Bremsen, damit derselbe Anschluss nicht auf jeder Route eigene Scans
// bekommt.
//
// Datenschutz wie beim Tarif-Scan: Die Datei lebt für die Dauer dieser einen
// Anfrage im Arbeitsspeicher, geht einmal an Claude und wird fallen gelassen.
// Der gelesene Name wird NICHT gespeichert, sondern nur an den Browser
// zurückgegeben, der ihn angefragt hat. Aus dieser Anfrage wird nichts
// protokolliert, auch keine Fehlermeldungen der Bibliothek.

import { leseFehlerAntwort, rechnungAnfrageAnnehmen } from "@/lib/rechnung/anfrage";
import { namenLesen } from "@/lib/brief/namen-extraktion";

export async function POST(request: Request) {
  const anfrage = await rechnungAnfrageAnnehmen(request);
  if (!anfrage.ok) return anfrage.antwort;

  const gelesen = await namenLesen(anfrage.bytes, anfrage.typ);
  if (!gelesen.ok) return leseFehlerAntwort(gelesen.fehler);

  // `istRechnung: false` wird durchgereicht statt zu einem Fehler gemacht: Der
  // Nutzer hat dasselbe Bild eben schon erfolgreich scannen lassen — kommt hier
  // etwas anderes heraus, ist das eine Auskunft und keine Störung.
  return Response.json({ istRechnung: gelesen.istRechnung, name: gelesen.name });
}
