// Abgleich zwischen dem, was auf einer Rechnung steht, und der Tarif-Datenbank.
//
// Warum diese Datei die Schleuse der ganzen Phase ist: Von der Rechnung liest
// das Modell nur TEXT. Die Zahlen, auf denen Urteil und später der Kulanz-Brief
// beruhen, kommen IMMER aus dem Produktinformationsblatt — sonst hinge ein
// Rechtsanspruch daran, was eine Bilderkennung auf einem verwackelten Handyfoto
// zu sehen glaubt. Hier wird deshalb nur durchgelassen, was sich in unseren
// eigenen Daten wiederfindet; alles andere wird verworfen und der Nutzer landet
// im normalen Picker.
//
// Bewusst rein: Daten als Parameter, kein Netz, kein Zustand, kein API-Schlüssel
// — vollständig offline nachprüfbar.
//
// NICHT verwendet wird der Rechnungsbetrag. Gemessen an den echten Daten löst er
// nur 3 von 62 mehrdeutigen Namen wirklich auf, und er ist systematisch
// irreführend: Auf der Rechnung steht der TATSÄCHLICH gezahlte Betrag (Rabatt,
// Aktion, Bündel), im Blatt der Listenpreis. Er wird angezeigt, aber er
// bestimmt nie den Tarif.

import { FESTNETZ_ANBIETER } from "../netz/anbieter.ts";
import { klassenAusTarifen, type Tarif, type TarifDaten, type TarifVorschlag } from "./vorschlag.ts";

/** Was das Modell von der Rechnung gelesen hat — reiner, ungeprüfter Text. */
export interface GeleseneRechnung {
  anbieter: string | null;
  tarifname: string | null;
}

export type AbgleichLage =
  /** Genau eine Bewertungs-Klasse — der Nutzer muss nichts mehr wählen. */
  | "eindeutig"
  /** Name erkannt, aber er trägt mehrere Urteile: eine kurze Rückfrage. */
  | "rueckfrage"
  /** Anbieter erkannt, Vertragsname nicht — zurück in den normalen Picker. */
  | "kein_tarif"
  /** Nicht einmal der Anbieter war lesbar oder ist einer, den wir führen. */
  | "kein_anbieter";

export interface Abgleich {
  lage: AbgleichLage;
  /** Kanonischer Anbietername aus FESTNETZ_ANBIETER — nie der rohe Lesetext. */
  anbieter: string | null;
  /** Kanonischer Vertragsname aus der Datenbank, sofern einer getroffen wurde. */
  tarifname: string | null;
  /** Bei "eindeutig" genau eine, bei "rueckfrage" mehrere, sonst leer. */
  klassen: TarifVorschlag[];
}

const UMLAUTE: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

// Markennamen, die je nach Rechnung anders geschrieben werden, vor dem
// Zerlegen auf eine Form bringen. Ohne das zerfiele "1&1" in die Zahl-Tokens
// "1" und "1" — und die Zahlenprüfung unten hielte "1&1 DSL 100" und
// "1&1 DSL 16" fälschlich für verträglich, weil beide eine "1" enthalten.
const MARKEN: [RegExp, string][] = [
  [/\b1\s*(?:&|und)\s*1\b/g, "einsundeins"],
  [/\bo\s*2\b/g, "o2"],
];

/**
 * Auf Vergleichsform bringen: Kleinschreibung, Umlaute ausgeschrieben, Akzente
 * weg (PŸUR → pyur), Marken vereinheitlicht, alles Übrige zu Wörtern zerlegt.
 */
export function normalisieren(text: string): string {
  // Reihenfolge ist wesentlich:
  // 1. Umlaute VOR der Zerlegung — sonst zerfiele "ü" in u + Zeichen und
  //    würde zu "u" statt zu "ue".
  // 2. Zerlegen und Zeichen entfernen — macht aus "PŸUR" ein "pyur" und aus
  //    dem tiefgestellten "O₂" ein "o2".
  // 3. Marken DANACH — sonst liefe die o2-Regel ins Leere, solange dort noch
  //    ein "₂" steht.
  let s = text
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTE[c])
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  for (const [muster, ersatz] of MARKEN) s = s.replace(muster, ersatz);
  return s.replace(/[^a-z0-9]+/g, " ").trim();
}

/** Wörter der Vergleichsform; das Füllwort "und" fällt weg. */
function tokens(text: string): string[] {
  return normalisieren(text)
    .split(" ")
    .filter((t) => t.length > 0 && t !== "und");
}

/**
 * Ein Datenbank-Name kann zwei Vertragsnamen tragen ("1&1 DSL 100 /
 * 1&1 Glasfaser 100") — auf der Rechnung steht dann nur einer davon.
 * Alle Slash-Namen der Datenbank benutzen " / " mit Leerzeichen; "MBit/s"
 * bleibt dadurch unangetastet.
 */
export function namensVarianten(tarifname: string): string[] {
  const teile = tarifname
    .split(" / ")
    .map((t) => t.trim())
    .filter(Boolean);
  return teile.length > 0 ? teile : [tarifname];
}

/** Wörter, die nur aus Ziffern bestehen — die Geschwindigkeits-Angaben. */
function zahlen(woerter: string[]): Set<string> {
  return new Set(woerter.filter((t) => /^\d+$/.test(t)));
}

/** Anteil der Wörter aus `teil`, die in `menge` vorkommen. */
function deckung(teil: string[], menge: Set<string>): number {
  if (teil.length === 0) return 0;
  return teil.filter((t) => menge.has(t)).length / teil.length;
}

/**
 * Mindestanteil des Datenbank-Namens, der auf der Rechnung wiederauftauchen
 * muss. Darunter ist es kein Lesefehler mehr, sondern ein anderer Vertrag.
 */
const MIN_DECKUNG_NAME = 0.7;

/** Untergrenze für die Gesamtpunktzahl — darunter gilt: nicht gefunden. */
const MIN_PUNKTE = 0.6;

/**
 * Wie dicht ein zweiter Name am Bestplatzierten liegen darf, um noch als
 * ernsthafte Alternative zu gelten.
 *
 * Gleichstand ist der Normalfall, nicht die Ausnahme: "1&1 DSL 16" und
 * "1&1 DSL 16 / 1&1 Glasfaser 16" sind für den Nutzer derselbe Vertrag und
 * punkten exakt gleich. Solche Kandidaten werden zusammengeworfen und über
 * die übliche Klassenbildung sortiert — ergibt das eine Klasse, ist die Sache
 * eindeutig; ergibt es mehrere, wird gefragt.
 */
const NOETIGER_VORSPRUNG = 0.05;

/**
 * Mehr Auswahlknöpfe als das ergeben keine Rückfrage mehr, sondern einen
 * zweiten Picker — dann ist der bestehende Picker der ehrlichere Weg.
 */
const MAX_RUECKFRAGE_KLASSEN = 5;

/**
 * Punktzahl für einen Datenbank-Namen gegen den Rechnungstext — `null`, wenn
 * er ausgeschlossen ist.
 *
 * Der Datenbank-Name wiegt schwerer als der Rechnungstext (0,75 zu 0,25): Auf
 * der Rechnung steht oft Beiwerk ("MagentaZuhause L (bis zu 100 MBit/s)"),
 * das den Vertrag nicht falsch macht. Umgekehrt fehlt aber kein halber
 * Vertragsname auf einer echten Rechnung.
 */
function punkte(gelesen: string[], kandidat: string): number | null {
  const kandidatWoerter = tokens(kandidat);
  if (kandidatWoerter.length === 0) return null;

  // Jede Zahl des Vertragsnamens MUSS auf der Rechnung stehen: "DSL 100" und
  // "DSL 16" unterscheiden sich in genau einem Wort, aber es ist das einzige,
  // auf das es ankommt.
  //
  // Nur in diese eine Richtung: Auf der Rechnung stehen reichlich weitere
  // Zahlen (Preis, Positionsnummer, "bis zu 100 MBit/s"), und die dürfen den
  // richtigen Vertrag nicht ausschließen. Fehlt umgekehrt die Zahl ganz
  // ("1&1 Glasfaser" ohne Tempo), fällt jede Tempo-Variante durch — richtig
  // so, denn dann ist wirklich nicht bestimmbar, welche gemeint ist.
  const zahlenGelesen = zahlen(gelesen);
  for (const z of zahlen(kandidatWoerter)) {
    if (!zahlenGelesen.has(z)) return null;
  }

  const mengeGelesen = new Set(gelesen);
  const deckungName = deckung(kandidatWoerter, mengeGelesen);
  if (deckungName < MIN_DECKUNG_NAME) return null;

  const deckungText = deckung(gelesen, new Set(kandidatWoerter));
  return 0.75 * deckungName + 0.25 * deckungText;
}

/**
 * Kanonischer Anbieter aus freiem Text ("Telekom Deutschland GmbH" → "Telekom").
 * Nur Namen aus FESTNETZ_ANBIETER; alles andere ist `null`.
 */
export function anbieterAusText(text: string | null): string | null {
  if (!text) return null;
  const gelesen = tokens(text);
  if (gelesen.length === 0) return null;
  const menge = new Set(gelesen);

  let bester: string | null = null;
  let besteLaenge = 0;
  for (const anbieter of FESTNETZ_ANBIETER) {
    const woerter = tokens(anbieter);
    // Alle Wörter des Anbieternamens müssen vorkommen — "Deutsche Glasfaser"
    // darf nicht an "Deutsche Telekom" hängenbleiben.
    if (!woerter.every((w) => menge.has(w))) continue;
    // Der längste Treffer gewinnt: "Deutsche Glasfaser" schlägt einen
    // Anbieter, der nur mit einem seiner Wörter zufällig passt.
    if (woerter.length > besteLaenge) {
      bester = anbieter;
      besteLaenge = woerter.length;
    }
  }
  return bester;
}

/**
 * Ordnet die gelesene Rechnung einem Vertrag aus der Tarif-Datenbank zu.
 *
 * Gibt nie etwas zurück, das nicht in `daten` steht — der gelesene Text wird
 * ausschließlich als Suchanfrage benutzt, nie als Inhalt übernommen. Genau
 * das macht die Zuordnung immun dagegen, dass jemand Anweisungen oder
 * Wunschzahlen auf ein hochgeladenes Bild schreibt.
 */
export function rechnungAbgleichen(daten: TarifDaten, gelesen: GeleseneRechnung): Abgleich {
  const anbieter = anbieterAusText(gelesen.anbieter);
  const leer: Abgleich = { lage: "kein_anbieter", anbieter: null, tarifname: null, klassen: [] };
  if (!anbieter) return leer;

  const desAnbieters = daten.tarife.filter((t) => t.anbieter === anbieter);
  const ohneTarif: Abgleich = { lage: "kein_tarif", anbieter, tarifname: null, klassen: [] };
  if (desAnbieters.length === 0 || !gelesen.tarifname) return ohneTarif;

  const gelesenWoerter = tokens(gelesen.tarifname);
  if (gelesenWoerter.length === 0) return ohneTarif;

  // Beste Punktzahl je Datenbank-Name; ein Name kann über mehrere Blätter
  // (Jahrgänge, Regionalvarianten) auf viele Zeilen verteilt sein.
  const proName = new Map<string, { punkte: number; tarife: Tarif[] }>();
  for (const tarif of desAnbieters) {
    let beste: number | null = null;
    for (const variante of namensVarianten(tarif.tarifname)) {
      const p = punkte(gelesenWoerter, variante);
      if (p !== null && (beste === null || p > beste)) beste = p;
    }
    if (beste === null || beste < MIN_PUNKTE) continue;

    const eintrag = proName.get(tarif.tarifname);
    if (eintrag) {
      eintrag.punkte = Math.max(eintrag.punkte, beste);
      eintrag.tarife.push(tarif);
    } else {
      proName.set(tarif.tarifname, { punkte: beste, tarife: [tarif] });
    }
  }

  if (proName.size === 0) return ohneTarif;

  // Bei Gleichstand entscheidet der kürzere Name, dann alphabetisch —
  // damit dieselbe Rechnung immer dasselbe Ergebnis liefert.
  const sortiert = [...proName.entries()].sort(
    (a, b) => b[1].punkte - a[1].punkte || a[0].length - b[0].length || a[0].localeCompare(b[0])
  );

  // Alle Namen, die dem besten dicht genug auf den Fersen sind, kommen
  // zusammen in die Auswahl — wir raten nicht, welchen der Nutzer bestellt hat.
  const schwelle = sortiert[0][1].punkte - NOETIGER_VORSPRUNG;
  const engereWahl = sortiert.filter(([, e]) => e.punkte >= schwelle);

  const klassen = klassenAusTarifen(engereWahl.flatMap(([, e]) => e.tarife));
  if (klassen.length === 0 || klassen.length > MAX_RUECKFRAGE_KLASSEN) return ohneTarif;

  return {
    lage: klassen.length === 1 ? "eindeutig" : "rueckfrage",
    anbieter,
    // Nur bei einem einzigen Kandidatennamen ist "der Vertrag heißt X"
    // eine Aussage, die wir verantworten können.
    tarifname: engereWahl.length === 1 ? engereWahl[0][0] : null,
    klassen,
  };
}
