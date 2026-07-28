// Anzeige-Genauigkeit — eine Quelle für Auswahl, Urteil und Darstellung.
//
// Warum das an einer Stelle stehen muss: Das Urteil wird auf denselben Zahlen
// gefällt, die auf dem Schirm stehen. Liefen Rundung und Anzeige auseinander,
// stünde "bei dir kommen 83,8 an" unter einem "das passt nicht", obwohl die
// gezeigten Zahlen gleich sind. Aus demselben Grund gelten zwei Tarife, deren
// Werte sich erst hinter der Anzeige-Genauigkeit unterscheiden, als derselbe
// Tarif — sie sähen in der Auswahl identisch aus und bekämen dasselbe Urteil.

/** Auf die Anzeige-Genauigkeit runden: ab 100 ganzzahlig, sonst 1 Nachkomma. */
export function aufAnzeige(n: number): number {
  return n >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
}

/**
 * Dieselbe Zahl als Text in deutscher Schreibweise — "–", wenn nichts vorliegt.
 *
 * Geht bewusst durch aufAnzeige, statt die Rundung ein zweites Mal
 * hinzuschreiben: Sonst stünde 99,96 als "100,0" auf dem Schirm, während die
 * Klassenbildung es als 100 führt — die beiden Regeln liefen an der Grenze
 * auseinander, und genau das soll diese Datei verhindern.
 */
export function formatMbps(wert: number | null): string {
  if (wert === null) return "–";
  const gerundet = aufAnzeige(wert);
  const roh = gerundet >= 100 ? gerundet.toString() : gerundet.toFixed(1);
  return deutscheSchreibweise(roh);
}

/**
 * Aus der maschinellen Schreibweise die deutsche machen: "2000.5" → "2.000,5".
 *
 * Von Hand statt über Intl.NumberFormat("de-DE"): Fehlen einer Umgebung die
 * vollen Sprachdaten, fällt Intl still auf Englisch zurück und schriebe
 * "2,000" — dieselbe Zahl, die im Deutschen "zwei Komma null" heißt. Im
 * Kulanz-Brief an den Anbieter stünde dann eine Zusicherung von 2 statt
 * 2000 Mbit/s, ohne dass irgendwo ein Fehler gemeldet würde. Diese Zeilen
 * liefern überall dasselbe Ergebnis.
 */
function deutscheSchreibweise(roh: string): string {
  const [ganz, nachkomma] = roh.split(".");
  // Von rechts nach jeder dritten Ziffer ein Punkt — aber nie ganz vorn und
  // nie hinter dem Minuszeichen (\B trifft keinen Wortanfang): 2000 → 2.000.
  const mitTausenderpunkt = ganz.replace(/\B(?=(\d{3})+$)/g, ".");
  return nachkomma === undefined ? mitTausenderpunkt : `${mitTausenderpunkt},${nachkomma}`;
}
