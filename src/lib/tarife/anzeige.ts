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

/** Dieselbe Zahl als Text — "–", wenn nichts vorliegt. */
export function formatMbps(wert: number | null): string {
  if (wert === null) return "–";
  return wert >= 100 ? Math.round(wert).toString() : wert.toFixed(1);
}
