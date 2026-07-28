// Welche gespeicherten Messungen ins Urteil einfließen — und welche nicht.
//
// Die Rechnung selbst steht in `tarife/kriterien.ts` und kann schon immer eine
// ganze Messreihe beurteilen. Sie bekam bisher nur nie eine. Diese Datei ist
// das Stück dazwischen: Sie entscheidet, WELCHE Messungen eine Reihe bilden.
//
// Warum das eine eigene Entscheidung ist und nicht einfach "alle": Die Regel
// des Gesetzes lautet "an 2 von 3 Messtagen". Über alle jemals gespeicherten
// Messungen gelesen, wären das irgendwann 2 schlechte Tage von 40 — und das
// wäre kein Urteil mehr, sondern ein Daueralarm, der Nutzer in eine
// 14-tägige offizielle Kampagne schickt, die sich für sie nicht lohnt.
//
// Drei Filter, alle aus der offiziellen Kampagne der Bundesnetzagentur
// übernommen, damit unsere Vorabprüfung dieselbe Reihe beurteilt, die dort
// später zählen würde:
//
//   1. Nur der aktuell gewählte Tarif. Ein anderer Vertrag heißt ein anderes
//      Produktinformationsblatt — Werte dagegen zu halten, wäre schlicht
//      die falsche Messlatte.
//   2. Mindestens 5 Minuten Abstand. Zehn Messungen in zehn Minuten
//      beschreiben eine Viertelstunde, keine Leitung.
//   3. Die letzten 3 Messtage, und nur innerhalb von 14 Tagen. Sonst
//      verschmölzen der 1. Januar und der 15. März zu "drei Messtagen".

import { MINDEST_MESSTAGE, type Messwert } from "../tarife/kriterien.ts";

/**
 * Eine gespeicherte Messung.
 *
 * `tag` ist der Kalendertag als "JJJJ-MM-TT" in der LOKALEN Zeit des Geräts —
 * dieselbe Überlegung wie bei `Messwert.tag`: Ob eine Messung um 00:30 noch
 * zum Vortag zählt, hängt an der Zeitzone. `zeit` steht daneben, weil ein
 * Kalendertag keine Reihenfolge innerhalb des Tages kennt und der
 * 5-Minuten-Abstand genau die braucht.
 */
export interface VerlaufEintrag {
  /**
   * Eigene Kennung der Messung.
   *
   * Sie ist der Grund, warum ein späterer Server-Verlauf ohne Umbau
   * danebenpasst: Zwei Listen derselben Person lassen sich nur dann
   * zusammenführen, wenn jede Messung sich selbst benennen kann. Nachträglich
   * ließe sich das nicht ergänzen — die Messungen wären dann schon da.
   */
  id: string;
  /** Gemessene Download-Rate in Mbit/s. */
  mbps: number;
  /** Kalendertag "JJJJ-MM-TT", lokale Zeit des Geräts. */
  tag: string;
  /** Zeitpunkt der Messung in Millisekunden seit 1970 (UTC). */
  zeit: number;
  /** Der Tarif, gegen den gemessen wurde. */
  tarifSlug: string;
  /** Wie das Gerät am Router hing. */
  verbindung: "wifi" | "lan" | "unknown";
}

/**
 * Geforderter Mindestabstand zwischen zwei Messungen, die beide zählen.
 *
 * Die offizielle Kampagne verlangt genau das. Ohne die Regel könnte jemand
 * während einer kurzen Störung zehnmal auf den Knopf hauen und bekäme ein
 * Urteil über seine Leitung, das eine Viertelstunde beschreibt.
 */
export const MINDEST_ABSTAND_MS = 5 * 60 * 1000;

/**
 * Spanne, über die sich die Messtage höchstens verteilen dürfen.
 *
 * Auch das ist die offizielle Vorgabe: Die Kampagne läuft in einem Fenster von
 * 14 Tagen. Ohne diese Klammer wären der 1. Januar und der 15. März zusammen
 * "drei Messtage", und das Urteil vermischte zehn Wochen.
 */
export const FENSTER_TAGE = 14;

/** Was von einer Messreihe ins Urteil eingeht — und was daneben liegen blieb. */
export interface Fenster {
  /** Die Messungen, auf denen das Urteil beruht — Eingabe für `vorpruefung`. */
  werte: Messwert[];
  /** Dieselben Messungen als volle Einträge, für die Anzeige. */
  eintraege: VerlaufEintrag[];
  /** Zahl der Messtage im Urteil (0…3). */
  messtage: number;
  /**
   * Messungen, die wegen zu geringen Abstands nicht zählen.
   *
   * Wird auf dem Schirm genannt statt verschwiegen: Wer gerade gemessen hat
   * und den Zähler nicht steigen sieht, hält die App sonst für kaputt.
   */
  zuDicht: number;
  /** Messtage, die außerhalb der 3 Tage bzw. der 14-Tage-Spanne liegen. */
  ausserhalb: number;
}

/** Aufsteigend nach Zeit, damit "der vorige" eindeutig ist. */
function nachZeit(a: VerlaufEintrag, b: VerlaufEintrag): number {
  // Bei exakt gleicher Zeit entscheidet die Kennung — sonst hinge das
  // Ergebnis an der Reihenfolge im Speicher und wäre nicht wiederholbar.
  return a.zeit - b.zeit || a.id.localeCompare(b.id);
}

/**
 * Der Abstands-Filter: geht die Messungen der Reihe nach durch und behält
 * eine nur, wenn seit der letzten behaltenen genug Zeit vergangen ist.
 *
 * Behalten wird bewusst die FRÜHESTE einer dichten Gruppe, nicht die neueste.
 * Andersherum könnte eine gerade abgeschlossene Messung eine ältere, längst
 * gezählte aus dem Urteil verdrängen — der Zähler liefe dann rückwärts,
 * während der Nutzer zusieht.
 */
function mitAbstand(sortiert: VerlaufEintrag[]): { behalten: VerlaufEintrag[]; zuDicht: number } {
  const behalten: VerlaufEintrag[] = [];
  let zuDicht = 0;
  let letzte: number | null = null;
  for (const e of sortiert) {
    if (letzte !== null && e.zeit - letzte < MINDEST_ABSTAND_MS) {
      zuDicht++;
      continue;
    }
    behalten.push(e);
    letzte = e.zeit;
  }
  return { behalten, zuDicht };
}

/**
 * Stellt die Messreihe zusammen, die beurteilt wird.
 *
 * Gibt IMMER ein Fenster zurück, notfalls ein leeres — ein fehlender Verlauf
 * ist kein Fehlerfall, sondern der Normalzustand vor der ersten Messung.
 */
export function urteilsFenster(eintraege: VerlaufEintrag[], tarifSlug: string): Fenster {
  const leer: Fenster = { werte: [], eintraege: [], messtage: 0, zuDicht: 0, ausserhalb: 0 };

  const eigene = eintraege.filter((e) => e.tarifSlug === tarifSlug).sort(nachZeit);
  if (eigene.length === 0) return leer;

  const { behalten, zuDicht } = mitAbstand(eigene);
  if (behalten.length === 0) return { ...leer, zuDicht };

  // Die letzten Messtage, vom jüngsten her. Kalendertage als Text sortieren
  // sich in der Form "JJJJ-MM-TT" von selbst richtig — kein Datums-Rechnen,
  // und damit keine Zeitzonen-Falle an dieser Stelle.
  const tage = [...new Set(behalten.map((e) => e.tag))].sort();
  const juengsterTag = tage[tage.length - 1];
  const grenze = tagMinusTage(juengsterTag, FENSTER_TAGE - 1);

  const imFenster = tage.filter((t) => t >= grenze).slice(-MINDEST_MESSTAGE);
  const gezaehlteTage = new Set(imFenster);

  const drin = behalten.filter((e) => gezaehlteTage.has(e.tag));
  return {
    werte: drin.map((e) => ({ mbps: e.mbps, tag: e.tag })),
    eintraege: drin,
    messtage: gezaehlteTage.size,
    zuDicht,
    ausserhalb: behalten.length - drin.length,
  };
}

/**
 * "2026-07-28" minus n Tage, wieder als "JJJJ-MM-TT".
 *
 * Über UTC gerechnet, obwohl der Tag lokal gemeint ist: Hier wird nur eine
 * Kalenderspanne gebildet, und in UTC hat jeder Tag verlässlich 24 Stunden.
 * Lokal gerechnet lägen an den zwei Umstellungstagen im Jahr 23 bzw. 25
 * Stunden dazwischen, und die Grenze verschöbe sich um einen Tag.
 */
function tagMinusTage(tag: string, n: number): string {
  const ms = Date.parse(`${tag}T00:00:00Z`);
  if (Number.isNaN(ms)) return tag;
  return new Date(ms - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
