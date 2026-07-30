// Wer außer uns Daten zu sehen bekommt — und was auf dem Gerät des Nutzers
// liegt. Grundlage der Empfängertabelle in der Datenschutzerklärung.
//
// WARUM DIESE DATEI ÜBERHAUPT EXISTIERT
//
// Eine Datenschutzerklärung veraltet leise. Eine spätere Phase schließt einen
// Dienst an, und der Text bleibt stehen — er behauptet dann etwas Falsches,
// ohne dass jemand etwas merkt. Genau dieser Fehler ist in diesem Projekt schon
// einmal passiert: Der Einwilligungstext des Rechnungs-Scans nannte drei
// Felder, gelesen wurden vier (siehe Kommentar in messung-flow.tsx).
//
// Deshalb trägt jeder Eintrag einen BELEG: die Stelle im Code, an der man
// nachlesen kann, dass es diesen Empfänger wirklich gibt. `verarbeiter.test.mjs`
// prüft jeden Beleg gegen die echte Datei und schlägt Alarm, wenn eine neue
// Abhängigkeit oder eine neue Umgebungsvariable auftaucht, die hier fehlt.
//
// Die Namen von Cookie und Gerätespeicher werden NICHT abgeschrieben, sondern
// dort importiert, wo sie definiert sind. Abgeschriebene Werte können
// auseinanderlaufen; importierte nicht.

import { GATE_COOKIE } from "../gate.ts";
import { SPEICHER_SCHLUESSEL } from "../verlauf/speicher.ts";

/** Ein Nachweis im Code, dass es einen Empfänger gibt. */
export interface Beleg {
  /** Pfad ab dem Projektstamm. */
  datei: string;
  /** Zeichenkette, die in dieser Datei vorkommen muss. */
  enthaelt: string;
}

export interface Empfaenger {
  name: string;
  /** Wofür — in der Sprache des Nutzers, nicht in Fachsprache. */
  zweck: string;
  /** Wo verarbeitet wird. Drittland wird ausdrücklich benannt. */
  ort: string;
  /** Rechtsgrundlage nach DSGVO. */
  grundlage: string;
  aufbewahrung: string;
  /**
   * Ob der Weg nur nach ausdrücklicher Einwilligung beschritten wird. Steuert
   * die Hervorhebung in der Tabelle — der Nutzer soll auf einen Blick sehen,
   * was von ihm abhängt und was ohnehin passiert.
   */
  nurMitEinwilligung: boolean;
  /**
   * ALLE Stellen, an denen dieser Empfänger im Code auftaucht — Mehrzahl mit
   * Grund.
   *
   * Anthropic steht sowohl als Paket in package.json als auch als Schlüssel in
   * .env.example. Mit nur einem Beleg je Empfänger fehlte der Paketname, und
   * der Wächter-Test verlangte dann einen Eintrag für einen Empfänger, der
   * längst dasteht. Genau das ist beim ersten Lauf passiert.
   */
  belege: Beleg[];
}

/**
 * Alle Stellen außerhalb unserer eigenen Anwendung, die Daten sehen.
 *
 * Reihenfolge: was jeden betrifft, steht oben; was nur nach ausdrücklicher
 * Einwilligung passiert, unten.
 */
export const EMPFAENGER: Empfaenger[] = [
  {
    name: "Vercel (Hosting)",
    zweck:
      "Betrieb der Website. Beim Aufruf einer Seite fällt technisch deine IP-Adresse an, wie bei jedem Aufruf im Internet.",
    ort: "Server in Frankfurt am Main; Unternehmen in den USA",
    grundlage: "Art. 6 Abs. 1 lit. f DSGVO — Betrieb und Sicherheit der Website",
    aufbewahrung: "kurzzeitig in Betriebsprotokollen des Hosters",
    nurMitEinwilligung: false,
    belege: [{ datei: "vercel.json", enthaelt: "fra1" }],
  },
  {
    name: "Unser Messserver in Frankfurt",
    zweck:
      "Die Messung selbst. Dein Gerät verbindet sich dafür direkt mit diesem Server — ohne diese Verbindung gibt es keine Geschwindigkeitsmessung. Er kennt währenddessen deine IP-Adresse.",
    ort: "Frankfurt am Main",
    grundlage:
      "Art. 6 Abs. 1 lit. b DSGVO — Durchführung der von dir angeforderten Messung",
    aufbewahrung:
      "kurzzeitig in den Betriebsprotokollen des Servers, ausschließlich zur Fehlersuche",
    nurMitEinwilligung: false,
    belege: [{ datei: ".env.example", enthaelt: "NEXT_PUBLIC_IAS_WS_TARGETS" }],
  },
  {
    name: "Supabase (Datenbank)",
    zweck:
      "Speichert die anonymen Messergebnisse und die Klickzählung des Wechsel-Angebots. Ohne IP-Adresse, ohne Kennung, ohne Kontobezug — die Werte lassen sich keiner Person zuordnen.",
    ort: "Europäische Union",
    grundlage:
      "Art. 6 Abs. 1 lit. f DSGVO — eigene Auswertung zur Verbesserung des Angebots",
    aufbewahrung: "dauerhaft, weil anonym",
    nurMitEinwilligung: false,
    belege: [{ datei: ".env.example", enthaelt: "SUPABASE_URL" }],
  },
  {
    name: "Vercel Web Analytics",
    zweck:
      "Zählt Seitenaufrufe und woher Besucher kommen. Ohne Cookie; auf deinem Gerät wird dafür nichts gespeichert. Vercel bildet serverseitig eine täglich wechselnde Kennung, die sich nicht auf dich zurückrechnen lässt.",
    ort: "Unternehmen in den USA",
    grundlage:
      "Art. 6 Abs. 1 lit. f DSGVO — Reichweitenmessung ohne Profilbildung",
    aufbewahrung: "nur zusammengefasste Zahlen",
    nurMitEinwilligung: false,
    belege: [{ datei: "package.json", enthaelt: "@vercel/analytics" }],
  },
  {
    name: "Anthropic (KI-Dienst)",
    zweck:
      "Liest dein Rechnungsfoto, um Anbieter, Vertragsname, Kundennummer und Monatsbetrag zu erkennen — und in einem getrennten Schritt, wenn du einen Brief schreiben willst, deinen Namen. Wir speichern das Foto nicht; es geht durch uns hindurch.",
    ort: "USA — also außerhalb der EU, ohne Verarbeitungsort in Europa",
    grundlage:
      "Art. 6 Abs. 1 lit. a und Art. 49 Abs. 1 lit. a DSGVO — deine ausdrückliche Einwilligung, auch für die Übermittlung in ein Drittland",
    aufbewahrung:
      "dort höchstens 30 Tage (Ausnahme: Verdacht auf Missbrauch), kein Training von KI-Modellen",
    nurMitEinwilligung: true,
    belege: [
      { datei: ".env.example", enthaelt: "ANTHROPIC_API_KEY" },
      { datei: "package.json", enthaelt: "@anthropic-ai/sdk" },
    ],
  },
  {
    name: "Vergleichsportal (Wechsel-Angebot)",
    zweck:
      "Wenn du auf das Wechsel-Angebot tippst, leiten wir dich dorthin weiter und hängen eine Zufallskennung an, damit uns eine Vermittlung zugerechnet wird. Der Partner erfährt von uns nur, dass der Klick von unserer Domain kam — nicht deine Messwerte.",
    ort: "je nach Partner",
    grundlage:
      "Art. 6 Abs. 1 lit. f DSGVO — Abrechnung der Vermittlung; die Weiterleitung geschieht nur, wenn du sie auslöst",
    aufbewahrung:
      "die Zufallskennung bei uns dauerhaft (ohne Personenbezug); beim Partner nach dessen eigener Erklärung",
    nurMitEinwilligung: false,
    belege: [{ datei: ".env.example", enthaelt: "WECHSEL_PARTNER_URL" }],
  },
];

export interface Geraeteablage {
  /** Der technische Name, unter dem es im Browser zu finden ist. */
  schluessel: string;
  art: "Cookie" | "Speicher deines Geräts";
  zweck: string;
  dauer: string;
  grundlage: string;
}

/**
 * Was auf dem Gerät des Nutzers liegt — vollständig.
 *
 * Beide Einträge sind technisch notwendig im Sinne des § 25 Abs. 2 Nr. 2
 * TDDDG, deshalb braucht diese Seite keinen Einwilligungsbanner. Käme je etwas
 * hinzu, das NICHT notwendig ist, wäre ein Banner Pflicht — dann ist diese
 * Liste die Stelle, an der das auffällt.
 */
export const GERAETEABLAGE: Geraeteablage[] = [
  {
    schluessel: GATE_COOKIE,
    art: "Cookie",
    zweck:
      "Merkt sich, dass du den Einladungscode der Testphase eingegeben hast. Enthält nur eine Prüfsumme, nicht den Code — und nichts über dich.",
    dauer: "bis zum Ende der Testphase bzw. bis du die Browserdaten löschst",
    grundlage: "§ 25 Abs. 2 Nr. 2 TDDDG — technisch notwendig für den Zugang",
  },
  {
    schluessel: SPEICHER_SCHLUESSEL,
    art: "Speicher deines Geräts",
    zweck:
      "Dein Messverlauf, damit über mehrere Tage ein Muster erkennbar wird. Diese Daten verlassen dein Gerät nicht und erreichen uns nie. Du löschst sie, indem du die Daten dieser Website im Browser löschst.",
    dauer: "bis du sie löschst (höchstens die letzten 500 Messungen)",
    grundlage:
      "§ 25 Abs. 2 Nr. 2 TDDDG — notwendig für die von dir angeforderte Verlaufsfunktion",
  },
];
