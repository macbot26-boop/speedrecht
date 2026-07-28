// Unter welchen Bedingungen gemessen wurde — und wann eine Messung nicht mehr
// misst, sondern nur noch steht.
//
// WARUM ES DIESE DATEI GIBT: Browser bremsen Seiten aus, die im Hintergrund
// liegen. Für eine Messung ist das doppelt schlimm.
//
//   1. Die Zahlen werden falsch. Gemessen wurde im A/B-Versuch ein Ping von
//      88–172 ms statt der ~2 ms, die derselbe Code im Vordergrund liefert.
//      Die Messung sieht dabei völlig normal aus — sie lügt nur.
//   2. Die Messung kann ewig hängen. Die offizielle Messbibliothek löscht ihre
//      eigene Notbremse, sobald die Verbindungen stehen (control.js:430); ab da
//      hängt der Abschluss an einem Timer (control.js:590) — und genau solche
//      Timer drosselt der Browser im Hintergrund auf etwa einen Aufruf pro
//      Minute. Kein Ende, keine Zeitüberschreitung, keine Fehlermeldung.
//
// Hier steht nur die Rechnung, kein Browser: Diese Datei nimmt Ereignisse
// entgegen und beantwortet zwei Fragen — „wurde die Seite ausgebremst?" und
// „steht die Messung?". Wer die Ereignisse liefert, entscheidet
// `use-ias-measurement.ts`. Das hält die Regeln testbar ohne Browser, genau wie
// bei `verlauf/fenster.ts`.

/** Abstand zwischen zwei Herzschlägen des Wächters. */
export const TAKT_MS = 1000;

/**
 * Ab wann ein verspäteter Herzschlag als Drosselung gilt.
 *
 * Bewusst grosszügig: Während der Messung laufen vier Datenströme, da darf ein
 * Timer ein paar hundert Millisekunden zu spät kommen, ohne dass irgendetwas
 * gedrosselt wäre. Echte Drosselung liegt eine ganze Grössenordnung darüber —
 * der Browser lässt eine ausgebremste Seite nur noch etwa einmal pro Minute
 * arbeiten. Zwischen 0,3 s Zappeln und 60 s Drosselung ist so viel Luft, dass
 * die Grenze irgendwo dazwischen liegen darf; 3 s ist die vorsichtige Wahl.
 */
export const TAKT_TOLERANZ_MS = 3000;

/**
 * So lange darf die Messbibliothek schweigen, bevor der Wächter abbricht.
 *
 * Eine vollständige Messung dauert etwa 30 Sekunden und meldet dabei mehrmals
 * pro Sekunde. Eine halbe Minute ohne jedes Lebenszeichen ist deshalb kein
 * langsamer Lauf mehr, sondern ein stehender.
 */
export const STILLSTAND_MS = 30_000;

/**
 * Dasselbe für eine bereits als gedrosselt erkannte Seite — deutlich länger.
 *
 * Das ist der wichtigste Sonderfall dieser Datei: Eine stark gedrosselte Seite
 * bekommt nur noch etwa EINEN Timer-Aufruf pro Minute. Ihre Messung läuft dann
 * zwar quälend langsam, aber sie läuft. Mit der 30-Sekunden-Grenze würden wir
 * genau solche Läufe abwürgen — obwohl die Entscheidung lautet: weitermessen,
 * nur kennzeichnen. Über 90 Sekunden kommt jede Seite, die überhaupt noch
 * arbeitet, mindestens einmal zum Zug; wer das reissen lässt, steht wirklich.
 */
export const STILLSTAND_GEDROSSELT_MS = 90_000;

/** Was wir über einen laufenden Messvorgang wissen. */
export interface Bedingungen {
  /**
   * War die Seite während dieses Laufs mindestens einmal unsichtbar?
   *
   * Einmal genügt und wird nie zurückgenommen: Ein Tab, der zwischendurch im
   * Hintergrund lag, hat dort womöglich genau die Sekunden verbracht, in denen
   * der Download gemessen wurde. Nachträglich lässt sich nicht mehr trennen,
   * welcher Teil der Zahl sauber ist.
   */
  jeVerborgen: boolean;
  /** Grösste Verspätung eines Herzschlags in Millisekunden. */
  groessterVerzug: number;
  /** Zeitpunkt des letzten Herzschlags. */
  letzterTakt: number;
  /** Zeitpunkt des letzten Ereignisses aus der Messbibliothek. */
  letztesLebenszeichen: number;
}

/** Der Anfangsstand zu Beginn eines Laufs. */
export function neueBedingungen(jetzt: number, verborgen: boolean): Bedingungen {
  return {
    jeVerborgen: verborgen,
    groessterVerzug: 0,
    letzterTakt: jetzt,
    letztesLebenszeichen: jetzt,
  };
}

/**
 * Meldet, ob die Seite gerade sichtbar ist.
 *
 * Gibt denselben Stand unverändert zurück, wenn sich nichts geändert hat —
 * so kann der Aufrufer ohne Vergleich erkennen, dass nichts passiert ist.
 */
export function mitSichtbarkeit(stand: Bedingungen, verborgen: boolean): Bedingungen {
  if (!verborgen || stand.jeVerborgen) return stand;
  return { ...stand, jeVerborgen: true };
}

/** Merkt sich, dass die Messbibliothek gerade etwas gemeldet hat. */
export function mitLebenszeichen(stand: Bedingungen, jetzt: number): Bedingungen {
  return { ...stand, letztesLebenszeichen: jetzt };
}

/**
 * Nimmt einen Herzschlag auf und merkt sich, wie spät er dran war.
 *
 * Die Verspätung ist das zweite Signal neben der Sichtbarkeit — und das
 * einzige, das den Fall erwischt, den `visibilityState` nicht sieht: ein
 * Fenster, das laut Browser sichtbar ist, aber vollständig hinter einem
 * anderen liegt. Auch das bremst der Browser aus.
 */
export function mitTakt(stand: Bedingungen, jetzt: number): Bedingungen {
  const verzug = jetzt - stand.letzterTakt - TAKT_MS;
  return {
    ...stand,
    letzterTakt: jetzt,
    groessterVerzug: Math.max(stand.groessterVerzug, verzug),
  };
}

/** Wurde die Seite während des Laufs ausgebremst? */
export function istEingeschraenkt(stand: Bedingungen): boolean {
  return stand.jeVerborgen || stand.groessterVerzug >= TAKT_TOLERANZ_MS;
}

/** Wie lange Schweigen dieser Lauf sich leisten darf. */
export function stillstandGrenze(stand: Bedingungen): number {
  return istEingeschraenkt(stand) ? STILLSTAND_GEDROSSELT_MS : STILLSTAND_MS;
}

/** Steht die Messung? */
export function istHaenger(stand: Bedingungen, jetzt: number): boolean {
  return jetzt - stand.letztesLebenszeichen >= stillstandGrenze(stand);
}
