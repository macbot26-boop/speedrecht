// Was zeigt der Bildschirm, nachdem die Rechnung gelesen wurde?
//
// Diese Datei entscheidet das und sonst nichts: rein, ohne Netz, ohne React —
// damit jeder Ausgang durchgespielt werden kann, ohne eine Rechnung
// hochzuladen und ohne einen bezahlten Aufruf auszulösen. Derselbe Zuschnitt
// wie bei dateipruefung.ts und rechnung-abgleich.ts.
//
// Zwei Haltungen stecken darin:
//
// 1. Aus JEDEM Ausgang führt ein Weg zurück in die normale Tarif-Auswahl.
//    Der Scan ist eine Abkürzung, keine Einbahnstraße — wessen Rechnung
//    nicht gelesen werden kann, der darf nicht schlechter dastehen als
//    jemand, der es gar nicht erst versucht hat.
//
// 2. Die Antwort kommt zwar vom eigenen Server, wird aber trotzdem geprüft.
//    Nicht aus Misstrauen gegen den Server, sondern weil eine spätere
//    Änderung an der Route sonst einen weißen Bildschirm erzeugen würde
//    statt einer Fehlermeldung.

import type { TarifVorschlag } from "../tarife/vorschlag.ts";

/** Der Bildschirm, der nach dem Lesen dran ist. */
export type ScanSchritt =
  /** Genau ein Vertrag kommt in Frage — nur noch bestätigen lassen. */
  | {
      art: "bestaetigen";
      anbieter: string;
      klasse: TarifVorschlag;
      /** Gelesener Vertragsname, sofern eindeutig — sonst der Klassen-Name. */
      tarifname: string;
      konflikt: string | null;
    }
  /** Der Name trägt mehrere Urteile: kurze Rückfrage statt Raten. */
  | {
      art: "namenswahl";
      anbieter: string;
      klassen: TarifVorschlag[];
      tarifname: string | null;
      konflikt: string | null;
    }
  /**
   * Anbieter erkannt, Vertragsname nicht — zurück in die Auswahl.
   *
   * Trägt die Konflikt-Warnung mit: Die Auswahl stellt sich anschließend auf
   * den Anbieter der RECHNUNG ein. Fiele die Warnung hier weg, stünde
   * hinterher ein Vertrag von Telekom neben einer Messung aus dem
   * Vodafone-Netz, ohne dass irgendwo steht, warum das nicht zusammenpasst.
   */
  | { art: "kein_tarif"; anbieter: string; konflikt: string | null }
  /** Nicht einmal der Anbieter war lesbar. */
  | { art: "kein_anbieter" }
  /** Das Dokument ist gar keine Telekommunikations-Rechnung. */
  | { art: "keine_rechnung" }
  /** Etwas ist schiefgegangen; `erneutMoeglich` sagt, ob ein zweiter Versuch lohnt. */
  | { art: "fehler"; meldung: string; erneutMoeglich: boolean };

/**
 * Wenn der Server keine brauchbare Meldung liefert (Netz weg, Proxy
 * dazwischen, Antwort kein JSON) — dann diese hier.
 */
export const STANDARD_FEHLER = "Die Rechnung konnte nicht gelesen werden.";

/** Länger als das ist keine Meldung mehr, sondern eine Seite. */
const MAX_MELDUNG = 200;

/**
 * Ein echtes Objekt — Arrays ausdrücklich NICHT.
 *
 * `typeof [] === "object"` ist wahr, und ohne diesen Zusatz käme eine
 * verirrte Liste bis zur Feldprüfung durch: Sie hätte kein `istRechnung`,
 * und der Nutzer läse "Das ist keine Rechnung" — also die Schuld bei seinem
 * Dokument, obwohl bei uns etwas kaputt ist.
 */
const istObjekt = (w: unknown): w is Record<string, unknown> =>
  typeof w === "object" && w !== null && !Array.isArray(w);

/**
 * Übernimmt die Meldung des Servers, wenn sie eine ist.
 *
 * Die Route formuliert je Fall unterschiedlich ("Die Datei ist zu groß",
 * "Das PDF hat zu viele Seiten") — die Texte hier zu doppeln hieße, dass
 * beide Seiten irgendwann auseinanderlaufen. Übernommen wird aber nur, was
 * strukturell eine kurze Zeichenkette ist.
 */
function meldungAus(daten: unknown): string {
  if (!istObjekt(daten) || typeof daten.error !== "string") return STANDARD_FEHLER;
  const text = daten.error.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, MAX_MELDUNG) : STANDARD_FEHLER;
}

/**
 * Sieht der Eintrag aus wie eine Tarif-Klasse, mit der die Oberfläche
 * arbeiten kann? Prüft nur, was sie tatsächlich anfasst.
 */
function istKlasse(wert: unknown): wert is TarifVorschlag {
  if (!istObjekt(wert)) return false;
  const tarif = wert.tarif;
  return (
    istObjekt(tarif) &&
    typeof tarif.slug === "string" &&
    typeof tarif.tarifname === "string" &&
    typeof tarif.download_max_mbps === "number" &&
    Array.isArray(wert.produkte)
  );
}

function klassenAus(wert: unknown): TarifVorschlag[] {
  return Array.isArray(wert) ? wert.filter(istKlasse) : [];
}

/**
 * Warnung, wenn Rechnung und Messung von verschiedenen Anschlüssen stammen.
 *
 * Der Fall ist echt: Man misst bei den Eltern, hat gerade gewechselt, oder
 * hängt im WLAN des Nachbarn. Ohne Warnung stünde ein Urteil auf dem Schirm,
 * das den Vertrag des einen Anschlusses gegen die Messung eines anderen hält
 * — und niemand könnte das erkennen. Das Ergebnis wird trotzdem gezeigt: Der
 * Vertrag stammt aus der Rechnung, und die ist die verlässlichere Quelle als
 * die IP-Adresse. Sichtbar sein muss es aber.
 */
function konfliktText(gelesen: string, gemessenesNetz: string | null): string | null {
  if (!gemessenesNetz || gemessenesNetz === gelesen) return null;
  return `Deine Rechnung ist von ${gelesen}, gemessen hast du gerade im Netz von ${gemessenesNetz}.`;
}

/**
 * Entscheidet aus der Antwort der Route, welcher Bildschirm dran ist.
 *
 * @param status  HTTP-Status; 0 steht für "Anfrage kam gar nicht durch".
 * @param daten   Der geparste Antwort-Körper (oder null, wenn kein JSON kam).
 * @param gemessenesNetz  Anbieter aus der IP-Erkennung — nur für die Warnung.
 */
export function scanSchritt(
  status: number,
  daten: unknown,
  gemessenesNetz: string | null
): ScanSchritt {
  if (status !== 200) {
    // 422 heißt: An der Datei liegt es — noch einmal fotografieren hilft.
    // Bei allem anderen (429 zu viele Versuche, 503 Dienst gestört, 0 kein
    // Netz) bringt sofortiges Wiederholen nichts; dann lieber gleich den
    // Weg in die normale Auswahl anbieten, statt ins Leere tippen zu lassen.
    return { art: "fehler", meldung: meldungAus(daten), erneutMoeglich: status === 422 };
  }

  if (!istObjekt(daten)) return { art: "fehler", meldung: STANDARD_FEHLER, erneutMoeglich: true };
  if (daten.istRechnung !== true) return { art: "keine_rechnung" };

  const anbieter = typeof daten.anbieter === "string" ? daten.anbieter : null;
  if (!anbieter) return { art: "kein_anbieter" };

  const konflikt = konfliktText(anbieter, gemessenesNetz);
  const klassen = klassenAus(daten.klassen);
  // Ohne brauchbare Klasse ist "eindeutig" eine leere Behauptung — dann gilt
  // dasselbe wie bei einem nicht gefundenen Vertragsnamen.
  if (klassen.length === 0) return { art: "kein_tarif", anbieter, konflikt };

  const tarifname = typeof daten.tarifname === "string" ? daten.tarifname : null;

  if (daten.lage === "eindeutig") {
    return {
      art: "bestaetigen",
      anbieter,
      klasse: klassen[0],
      // Der gelesene Name ist der, der auf der Rechnung steht — er wird
      // bevorzugt gezeigt. Fehlt er (mehrere Kandidaten punktgleich), tut es
      // der Name der Klasse; angezeigt wird nie etwas, das nicht aus unserer
      // eigenen Tarifliste stammt.
      tarifname: tarifname ?? klassen[0].tarif.tarifname,
      konflikt,
    };
  }

  if (daten.lage === "rueckfrage") {
    return { art: "namenswahl", anbieter, klassen, tarifname, konflikt };
  }

  // "kein_tarif" und alles Unerwartete landen hier: Anbieter steht, Vertrag
  // nicht — die normale Auswahl übernimmt, mit dem Anbieter schon gesetzt.
  return { art: "kein_tarif", anbieter, konflikt };
}
