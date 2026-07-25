// Die drei Kriterien für eine "erhebliche, kontinuierliche oder regelmäßig
// wiederkehrende Abweichung" nach § 57 Abs. 4 TKG.
//
// Portiert aus dem Labor (`prototype/public/check.html`), wo die Regeln gegen
// echte Messreihen geprüft wurden. Hier stehen sie pur und getestet, damit
// Ergebnis-Anzeige und Kulanz-Brief dieselbe Rechnung benutzen.
//
// Erfüllt ist die Abweichung, wenn EINES der drei Kriterien greift — das
// Gesetz verknüpft sie mit "oder", nicht mit "und":
//
//   1. 90-%-Kriterium   Nicht an mindestens 2 von 3 Messtagen wird jeweils
//                       mindestens einmal 90 % der maximalen Rate erreicht.
//   2. Üblich-Kriterium Nicht in 90 % der Messungen wird die normalerweise
//                       verfügbare Rate erreicht.
//   3. Minimal-Kriterium An mindestens 2 von 3 Messtagen wird die vereinbarte
//                       Mindestrate unterschritten.
//
// WAS DIESE DATEI NICHT IST: ein Rechtsnachweis. Als Nachweis gilt allein die
// offizielle Breitbandmessung der Bundesnetzagentur (Desktop-App, festes
// Messprotokoll). Unsere Messung ist ein Indiz — sie zeigt dem Nutzer, ob sich
// der Aufwand der offiziellen Kampagne überhaupt lohnt. Deshalb heißen die
// Stände hier "auffaellig"/"unauffaellig" und nicht "Anspruch besteht".
//
// Rein gehalten (Messwerte und Tarif als Parameter) — testbar ohne Bundler.

import { aufAnzeige } from "./anzeige.ts";
import type { Tarif } from "./vorschlag";

/**
 * Eine einzelne Messung.
 *
 * `tag` ist der Kalendertag als "JJJJ-MM-TT" in der LOKALEN Zeit des Nutzers.
 * Bewusst ein fertiger String und kein Zeitstempel: Ob eine Messung um 00:30
 * noch zum Vortag zählt, hängt an der Zeitzone des Geräts. Diese Entscheidung
 * gehört dorthin, wo die Zeitzone bekannt ist — nicht in die Rechnung.
 */
export interface Messwert {
  /** Gemessene Download-Rate in Mbit/s. */
  mbps: number;
  /** Kalendertag "JJJJ-MM-TT", lokale Zeit des Nutzers. */
  tag: string;
}

/**
 * - "auffaellig"        — das Kriterium spricht für eine erhebliche Abweichung
 * - "unauffaellig"      — beurteilbar, aber im Rahmen
 * - "zu_wenig_daten"    — noch nicht beurteilbar (siehe `nochNoetig`)
 * - "kein_referenzwert" — das Produktinformationsblatt nennt den Wert nicht
 */
export type KriteriumStand = "auffaellig" | "unauffaellig" | "zu_wenig_daten" | "kein_referenzwert";

export type KriteriumName = "90_prozent" | "ueblich" | "minimum";

export interface Kriterium {
  name: KriteriumName;
  stand: KriteriumStand;
  /**
   * Der Wert, gegen den geprüft wurde, in Mbit/s — auf Anzeige-Genauigkeit
   * gerundet, damit Text und Rechnung dieselbe Zahl nennen. Beim
   * 90-%-Kriterium ist das nicht die Maximalrate, sondern 90 % davon.
   * `null`, wenn das Blatt den Wert nicht führt.
   */
  referenzMbps: number | null;
  /**
   * Wie viele Messtage (Kriterium 1 und 3) bzw. Messungen (Kriterium 2) noch
   * fehlen, bis geurteilt werden kann. Nur bei "zu_wenig_daten" gesetzt.
   *
   * Das ist die ehrlichste Auskunft, die wir nach einer einzelnen Messung
   * geben können: nicht "kein Anspruch", sondern "dafür fehlen noch zwei Tage".
   */
  nochNoetig: number | null;
}

/** Zwischenergebnisse der Auswertung — für Anzeige und Brief, ohne Neuberechnung. */
export interface Kennzahlen {
  /** Anzahl aller Messungen. */
  messungen: number;
  /** Anzahl verschiedener Kalendertage. */
  messtage: number;
  /** Messtage, an denen 90 % der Maximalrate NIE erreicht wurde. */
  tageOhne90: number;
  /** Messtage, an denen die Mindestrate unterschritten wurde. */
  tageUnterMin: number;
  /** Anteil der Messungen, die die normale Rate erreichen (0…1). `null` ohne Referenzwert. */
  anteilNormal: number | null;
}

export interface Vorpruefung {
  /**
   * "auffaellig", sobald EIN Kriterium auffällig ist (das Gesetz verknüpft mit
   * "oder"). "unauffaellig" nur, wenn mindestens eines beurteilbar war und
   * keines auffällig ist. Sonst "zu_wenig_daten".
   */
  gesamt: KriteriumStand;
  kriterien: Kriterium[];
  kennzahlen: Kennzahlen;
}

/**
 * Messtage, die das Gesetz für die tagesbezogenen Kriterien voraussetzt.
 * Die offizielle Kampagne der Bundesnetzagentur umfasst genau drei Messtage.
 */
export const MINDEST_MESSTAGE = 3;

/**
 * Ab so vielen betroffenen Messtagen gilt ein tagesbezogenes Kriterium als
 * auffällig ("an mindestens 2 von 3 Messtagen").
 *
 * Bewusst eine feste Zahl und kein Anteil: Das Gesetz nennt "2 von 3", und die
 * offizielle Kampagne hat immer genau drei Messtage. Bei mehr als drei
 * Messtagen ist diese Regel damit strenger als ein Anteil es wäre — das ist
 * für einen Vorab-Check die richtige Richtung, weil sie den Nutzer eher zur
 * offiziellen Messung schickt, als ihn fälschlich beruhigt.
 */
export const AUFFAELLIG_AB_TAGEN = 2;

/**
 * Unter so vielen Messungen bleibt das Üblich-Kriterium unbeurteilt.
 * Die offizielle Kampagne misst zehn Mal je Tag; darunter ist ein
 * Prozentsatz kaum aussagekräftig.
 */
export const MINDEST_MESSUNGEN_UEBLICH = 10;

/** Geforderter Anteil der Messungen, die die normale Rate erreichen. */
export const ANTEIL_NORMAL = 0.9;

/** Anteil der Maximalrate, der an einem Messtag mindestens einmal fallen muss. */
export const ANTEIL_MAXIMUM = 0.9;

/**
 * Vergleich auf Anzeige-Genauigkeit.
 *
 * Warum nicht roh: Auf dem Schirm steht die gerundete Zahl. Läge der Vergleich
 * darunter, stünde "bei dir kommen 50,0 an" neben "Mindestrate 50 unterschritten"
 * — für eine Messung von 49,96. Dieselbe Regel benutzt `urteil.ts`; beide
 * müssen übereinstimmen, sonst widersprechen sich Urteil und Kriterien.
 */
const erreicht = (gemessen: number, schwelle: number): boolean =>
  aufAnzeige(gemessen) >= aufAnzeige(schwelle);

/** Messwerte nach Kalendertagen gruppieren. */
function nachTagen(werte: Messwert[]): Map<string, number[]> {
  const tage = new Map<string, number[]>();
  for (const m of werte) {
    const vorhanden = tage.get(m.tag);
    if (vorhanden) vorhanden.push(m.mbps);
    else tage.set(m.tag, [m.mbps]);
  }
  return tage;
}

/**
 * Baut ein tagesbezogenes Kriterium (90-%- und Minimal-Kriterium).
 * Beide zählen betroffene Messtage und brauchen dieselbe Mindestzahl an Tagen.
 */
function tagesKriterium(
  name: KriteriumName,
  referenz: number | null,
  betroffeneTage: number,
  messtage: number
): Kriterium {
  if (referenz === null) {
    return { name, stand: "kein_referenzwert", referenzMbps: null, nochNoetig: null };
  }
  const referenzMbps = aufAnzeige(referenz);
  if (messtage < MINDEST_MESSTAGE) {
    return {
      name,
      stand: "zu_wenig_daten",
      referenzMbps,
      nochNoetig: MINDEST_MESSTAGE - messtage,
    };
  }
  return {
    name,
    stand: betroffeneTage >= AUFFAELLIG_AB_TAGEN ? "auffaellig" : "unauffaellig",
    referenzMbps,
    nochNoetig: null,
  };
}

/**
 * Prüft eine Messreihe gegen die drei Kriterien des § 57 Abs. 4 TKG.
 *
 * Gibt bei einer einzelnen Messung KEIN Urteil, sondern "zu_wenig_daten" mit
 * der Zahl der fehlenden Messtage — eine Messung kann keines der Kriterien
 * erfüllen, und so etwas zu behaupten wäre die gefährlichste Falschaussage,
 * die das Produkt machen könnte.
 */
export function vorpruefung(tarif: Tarif, werte: Messwert[]): Vorpruefung {
  const tage = nachTagen(werte);
  const messtage = tage.size;
  const messungen = werte.length;

  const max = tarif.download_max_mbps;
  const normal = tarif.download_normal_mbps;
  const min = tarif.download_min_mbps;
  const schwelle90 = max * ANTEIL_MAXIMUM;

  // Ein Messtag zählt als "ohne 90 %", wenn an ihm KEINE einzige Messung die
  // Schwelle erreicht — das Gesetz verlangt nur "mindestens einmal" je Tag.
  let tageOhne90 = 0;
  let tageUnterMin = 0;
  for (const werteDesTages of tage.values()) {
    if (!werteDesTages.some((v) => erreicht(v, schwelle90))) tageOhne90++;
    if (min !== null && werteDesTages.some((v) => !erreicht(v, min))) tageUnterMin++;
  }

  const anteilNormal =
    normal !== null && messungen > 0
      ? werte.filter((m) => erreicht(m.mbps, normal)).length / messungen
      : null;

  const kriterien: Kriterium[] = [
    tagesKriterium("90_prozent", schwelle90, tageOhne90, messtage),
    ueblichKriterium(normal, anteilNormal, messungen),
    tagesKriterium("minimum", min, tageUnterMin, messtage),
  ];

  return {
    gesamt: gesamtstand(kriterien),
    kriterien,
    kennzahlen: { messungen, messtage, tageOhne90, tageUnterMin, anteilNormal },
  };
}

/** Das Üblich-Kriterium zählt Messungen, nicht Tage — daher eigener Bau. */
function ueblichKriterium(
  normal: number | null,
  anteilNormal: number | null,
  messungen: number
): Kriterium {
  if (normal === null || anteilNormal === null) {
    return { name: "ueblich", stand: "kein_referenzwert", referenzMbps: null, nochNoetig: null };
  }
  const referenzMbps = aufAnzeige(normal);
  if (messungen < MINDEST_MESSUNGEN_UEBLICH) {
    return {
      name: "ueblich",
      stand: "zu_wenig_daten",
      referenzMbps,
      nochNoetig: MINDEST_MESSUNGEN_UEBLICH - messungen,
    };
  }
  return {
    name: "ueblich",
    stand: anteilNormal < ANTEIL_NORMAL ? "auffaellig" : "unauffaellig",
    referenzMbps,
    nochNoetig: null,
  };
}

/**
 * Ein auffälliges Kriterium genügt ("oder"-Verknüpfung des Gesetzes).
 * "unauffaellig" wird nur gemeldet, wenn überhaupt etwas beurteilbar war —
 * sonst stünde nach einer einzigen Messung ein beruhigendes Urteil da,
 * für das es keine Grundlage gibt.
 */
function gesamtstand(kriterien: Kriterium[]): KriteriumStand {
  if (kriterien.some((k) => k.stand === "auffaellig")) return "auffaellig";
  if (kriterien.some((k) => k.stand === "unauffaellig")) return "unauffaellig";
  // Kein Kriterium beurteilbar: fehlende Referenzwerte sind kein Datenmangel
  // des Nutzers, aber für ihn läuft beides auf dasselbe hinaus.
  if (kriterien.some((k) => k.stand === "zu_wenig_daten")) return "zu_wenig_daten";
  return "kein_referenzwert";
}
