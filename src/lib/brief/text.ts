// Der Kulanz-Brief an den Anbieter — als reiner Textgenerator.
//
// WAS DIESER BRIEF IST: eine höfliche Bitte, den Anschluss zu prüfen.
//
// WAS ER AUSDRÜCKLICH NICHT IST: eine Minderung, eine Kündigung, eine
// Fristsetzung oder irgendeine andere Rechtsausübung. Der Grund steht in
// `tarife/kriterien.ts` und ist keine Vorsicht, sondern Arithmetik: Zwei der
// drei Kriterien des § 57 Abs. 4 TKG setzen drei Messtage voraus, das dritte
// zehn Messungen. Eine einzelne Messung kann keines davon erfüllen. Und selbst
// wenn sie es könnte, gilt als Nachweis allein das Messprotokoll aus dem
// Programm der Bundesnetzagentur — die Bundesnetzagentur schreibt dazu, die
// Rechte seien "unter Vorlage des Messprotokolls" geltend zu machen.
//
// Ein Brief, der hier Ansprüche behauptet, wäre also nicht bloß forsch, er wäre
// unhaltbar — und der Nutzer stünde damit vor seinem Anbieter. Der Test zu
// dieser Datei wacht darüber, dass keine solche Formulierung hineinwächst.
//
// Rein gehalten (alles kommt als Parameter herein) — testbar ohne Bundler.

import { formatMbps } from "../tarife/anzeige.ts";
import type { Tarif } from "../tarife/vorschlag";

/** Wie das Gerät bei der Messung am Router hing. */
export type Verbindung = "wlan" | "lan";

export interface BriefEingabe {
  /** Der gewählte Tarif — liefert Name und die zugesicherten Raten. */
  tarif: Tarif;
  /** Gemessene Download-Rate in Mbit/s. */
  gemessenMbps: number;
  /**
   * Messdatum, FERTIG FORMATIERT (etwa "25.07.2026").
   *
   * Bewusst ein fertiger String und kein Zeitstempel — dieselbe Regel wie bei
   * `Messwert.tag` in kriterien.ts: Welcher Kalendertag ein Zeitpunkt ist,
   * hängt an der Zeitzone des Geräts, und diese Entscheidung gehört dorthin,
   * wo die Zeitzone bekannt ist.
   */
  datum: string;
  /** `null`, wenn der Nutzer nichts angegeben hat — dann bleibt es unerwähnt. */
  verbindung: Verbindung | null;
  kundennummer: string | null;
  name: string | null;
}

export interface Brief {
  betreff: string;
  /** Der fertige Brieftext ohne Anschrift des Empfängers und ohne Datumszeile. */
  text: string;
}

/**
 * Zählt Angaben natürlichsprachlich auf: "a", "a und b", "a, b und c".
 *
 * Ohne das läse der Satz bei fehlenden Werten holprig ("2000 Mbit/s als
 * Maximalrate und  und 1400 Mbit/s"). Fehlende Werte sind der Normalfall:
 * Nicht jedes Produktinformationsblatt nennt alle drei Raten.
 */
function aufzaehlen(teile: string[]): string {
  if (teile.length <= 1) return teile[0] ?? "";
  return `${teile.slice(0, -1).join(", ")} und ${teile[teile.length - 1]}`;
}

/** Die Raten aus dem Blatt, so wie sie dort heißen. */
function ratenSatz(tarif: Tarif): string {
  const teile = [`${formatMbps(tarif.download_max_mbps)} Mbit/s als Maximalrate`];
  if (tarif.download_normal_mbps !== null) {
    teile.push(
      `${formatMbps(tarif.download_normal_mbps)} Mbit/s als normalerweise zur Verfügung stehende Rate`
    );
  }
  if (tarif.download_min_mbps !== null) {
    teile.push(`${formatMbps(tarif.download_min_mbps)} Mbit/s als Mindestrate`);
  }
  return aufzaehlen(teile);
}

/**
 * Wie gemessen wurde — offen benannt.
 *
 * Warum das drinsteht, auch wenn es den Brief schwächt: Wer über WLAN gemessen
 * hat und es verschweigt, steht blamiert da, sobald der Anbieter die Leitung
 * prüft und in Ordnung findet. Ist nichts angegeben, wird auch nichts
 * behauptet.
 */
function messwegSatz(verbindung: Verbindung | null): string {
  if (verbindung === "lan") return ", gemessen über ein LAN-Kabel direkt am Router";
  if (verbindung === "wlan") return ", gemessen über WLAN";
  return "";
}

/**
 * Baut Betreff und Brieftext.
 *
 * Alle Zahlen kommen aus dem Produktinformationsblatt beziehungsweise aus der
 * Messung — nie aus einem Modell und nie aus der Rechnung. Gerundet wird über
 * `formatMbps`, damit im Brief dieselben Zahlen stehen wie auf dem Schirm.
 */
export function briefBauen(eingabe: BriefEingabe): Brief {
  const { tarif, gemessenMbps, datum, verbindung, kundennummer, name } = eingabe;

  const betreff = kundennummer
    ? `Bitte um Prüfung meines Anschlusses – Kundennummer ${kundennummer}`
    : "Bitte um Prüfung meines Anschlusses";

  const absaetze = [
    "Sehr geehrte Damen und Herren,",
    kundennummer
      ? `ich habe bei Ihnen den Tarif „${tarif.tarifname}“, meine Kundennummer lautet ${kundennummer}.`
      : `ich habe bei Ihnen den Tarif „${tarif.tarifname}“.`,
    `Laut Produktinformationsblatt sind für diesen Anschluss im Download ${ratenSatz(tarif)} angegeben.`,
    `Bei einer eigenen Messung am ${datum} kamen bei mir ${formatMbps(gemessenMbps)} Mbit/s an${messwegSatz(verbindung)}.`,
    // Diese Einschränkung steht bewusst im Brief selbst und nicht nur in
    // unserer Oberfläche: Der Anbieter soll den Wert einordnen können, und der
    // Nutzer soll nicht mehr behaupten, als er belegen kann.
    "Diese Messung ist ein Anhaltspunkt und kein förmlicher Nachweis: Sie stammt nicht aus dem Messverfahren der Bundesnetzagentur, und eine einzelne Messung würde dafür ohnehin nicht genügen.",
    "Ich bitte Sie daher, meinen Anschluss zu prüfen und mir mitzuteilen, ob eine Störung oder eine dauerhafte Einschränkung vorliegt.",
    "Über eine Rückmeldung würde ich mich freuen.",
    name ? `Mit freundlichen Grüßen\n${name}` : "Mit freundlichen Grüßen",
  ];

  return { betreff, text: absaetze.join("\n\n") };
}
