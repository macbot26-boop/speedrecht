// Tests für den PIB-Parser.
//
// Die Vorlagen unten bilden die Satz-Eigenheiten der sechs Anbieter nach,
// wie `pdftotext -layout` sie liefert — insbesondere die Spaltenabstände.
// Genau daran hängt die Zuordnung Download/Upload, deshalb sind die
// Leerzeichen hier bedeutungstragend und dürfen nicht "aufgeräumt" werden.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  pibAuswerten,
  tabellenFinden,
  technologieBestimmen,
  titelFinden,
  zahl,
} from "./pib-parser.mjs";

// --- Vorlagen -------------------------------------------------------------

const TELEKOM = `Produktinformationsblatt gem. § 1 TK-Transparenzverordnung                    Telekom Deutschland GmbH

MagentaZuhause L
mit Geschwindigkeit Internet-Zugang VDSL 100 (Festnetz)

☑ Internet     ☑ Telefonie      □ TV                                               Vermarktung seit 01.08.2018

Das Produkt MagentaZuhause L mit Geschwindigkeit Internet-Zugang VDSL 100 beinhaltet einen Festnetz-Anschluss
mit Zugang zum Internet sowie Telefonieleistungen.

1    Datenübertragungsraten im Festnetz

 Datenübertragungsraten im Festnetz                    im Download                        im Upload


 Maximal                                                100 MBit/s                        40 MBit/s

 Normalerweise zur Verfügung stehend                   83,8 MBit/s                       33,4 MBit/s

 Minimal                                                 54 MBit/s                        20 MBit/s


2    Weitere Produktinformationen

 Monatliches Entgelt für das
 Komplettprodukt                                                         48,95 EUR

(Amtsgericht Bonn, HRB 5919)                                                          Versionsstand: 01.10.2025
`;

// Vodafone schreibt "75Mbit/s" ohne Leerzeichen — das darf nicht durchfallen.
const VODAFONE = `Produktinformationsblatt gemäß § 1 TK-Transparenzverordnung

GigaZuhause 1000 Kabel Januar 2026                                                       Vermarktet seit 29.01.2026

Das Produkt umfasst eine Internet-Flat und eine Telefonie-Flat.

 Datenübertragungsraten Inland                                im Download                       im Upload


 Maximal                                                       1000 Mbit/s                       75Mbit/s


 Normalerweise zur Verfügung stehend                           850 Mbit/s                        55 Mbit/s


 Minimal                                                       600 Mbit/s                        15 Mbit/s


Weitere Produktinformationen

 Listenpreis inkl. MwSt.                                                        Monatlich

 ohne Router                                                                      64,99 €

Version: 3.0                      Datum: 29.01.2026
`;

// 1&1 setzt den Blatt-Kopf über zwei Zeilen — die zweite ist NICHT der Titel.
const EINSUNDEINS = `Produktinformationsblatt
gem. §1 TK-Transparenzverordnung

1&1 Glasfaser 300                                                                  Vermarktet seit 07.11.2025

Das Produkt „1&1 Glasfaser 300“ beinhaltet einen Internetzugang.

                Datenübertragungsrate                           Download                       Upload
 Maximal                                                        300 Mbit/s                    150 Mbit/s
 Normalerweise zur Verfügung stehend                            300 Mbit/s                    150 Mbit/s
 Minimal                                                        300 Mbit/s                    150 Mbit/s

                                      Weitere Produktinformationen
 Monatliches Entgelt für das Komplettprodukt
                                                                              54,99 €/Monat
 (Listenpreis ohne Endgeräte)

1&1 Telecom GmbH, Elgendorfer Straße 57, 56410 Montabaur. Stand: 03.12.2025
`;

// Der schwierige Fall: DREI Tarife in einem Blatt, der letzte mit ZWEI
// Technologie-Tabellen. Beschriftung umgebrochen, und beim mittleren Tarif
// steht der Upload-Wert in der Zeile ÜBER "Maximal", gefolgt von einer
// regionalen Erläuterung, die NICHT der Wert ist.
const O2 = `               Produktinformationsblatt gem. § 1 TK-Transparenzverordnung


O2 Home L 175/250/300 (Festnetz)

                 Das Produkt O2 Home L beinhaltet einen Festnetz-Anschluss für Internet und Telefonie. Die
                 Leistungen können über DSL, Glasfaser, Kabel oder Mobilfunk bereitgestellt werden.

                   O2 Home L 175

                               Datenübertragungsraten
                                                               im Download                         im Upload
                               über DSL

                               Maximal                           175 MBit/s                          40 MBit/s

                               Normalerweise zur Verfügung
                                                                 145 MBit/s                         35 MBit/s
                               stehend

                               Minimal                           105 MBit/s                         18 MBit/s

                   O2 Home L 250

                           Datenübertragungsraten
                                                               im Download                         im Upload
                           über DSL und Glasfaser
                                                                                                    40 MBit/s
                           Maximal                              250 MBit/s           Bei Glasfaser 50 Mbit/s oder 125 Mbit/s in
                                                                                              ausgewählten Regionen

                                                                                                    35 MBit/s
                           Normalerweise zur Verfügung          200 MBit/s           Bei Glasfaser 40 Mbit/s oder 100 Mbit/s in
                           stehend                                                            ausgewählten Regionen

                                                                                                    20 MBit/s
                           Minimal                              105 MBit/s           Bei Glasfaser 23 Mbit/s oder 56 Mbit/s in
                                                                                              ausgewählten Regionen


O2 Home L 300

 Datenübertragungsraten
 über wilhelm.tel-DSL und                im Download                         im Upload
 Glasfaser

 Maximal                                  300 MBit/s                          150 MBit/s

 Normalerweise zur Verfügung
                                          300 MBit/s                          150 MBit/s
 stehend

 Minimal                                  300 MBit/s                          150 MBit/s

 Datenübertragungsraten
                                         im Download                         im Upload
 über Kabel

 Maximal                                  300 MBit/s                           50 MBit/s

 Normalerweise zur Verfügung
                                          255 MBit/s                          35 MBit/s
 stehend

 Minimal                                  180 MBit/s                          15 MBit/s


Weitere Produktinformationen

Entgelt für das Komplettprodukt      Monatlich
(Listenpreis) inkl. MwSt.

exkl. Hardware                       44,99 €

Stand 01/26, Version 1.0
`;

// Ältere o2-Blätter enthalten einen Tippfehler in der Einheit: "MBits/s"
// statt "MBit/s". Er steht so in der amtlichen Quelle und darf den Wert
// nicht verschlucken.
const O2_ALT = `Produktinformationsblatt gem. § 1 TK-Transparenzverordnung

O2 DSL S (Festnetz)

 Datenübertragungsraten                                im Download                         im Upload

 Maximal                                                25 MBit/s                           5 MBit/s

 Normalerweise zur Verfügung stehend                    10 MBit/s                           1 MBit/s


 Minimal                                                   6 MBit/s                       0,7 MBits/s

Weitere Produktinformationen

Entgelt für das Komplettprodukt                            24,99 €
`;

// Vodafone beschriftete die Höchstrate früher als "Geschätzter Maximalwert",
// über zwei Zeilen gebrochen — und setzte die Werte in die Zeile DARÜBER.
const VODAFONE_ALT = `Produktinformationsblatt gemäß § 1 TK-Transparenzverordnung

Red Internet & Phone 1000 Cable

Das Produkt umfasst einen Festnetz-Anschluss inkl. Router.

                                    Datenübertragungs-               Datenübertragungs-
                                    raten im Download                raten im Upload

                                              1000 Mbit/s                       50 Mbit/s
         Geschätzter Maximalwert

     Normalerweise zur Verfügung
                                               800 Mbit/s                       35 Mbit/s
     stehend

                          Minimal               600 Mbit/s                      15 Mbit/s

Weitere Produktinformationen

 Listenpreis inkl. MwSt.                                        49,99 €
`;

// Auf den Übersichtsseiten zeigen einzelne Einträge auf das falsche Blatt.
// Mobilfunk-PIBs haben ebenfalls eine Tabelle — sie dürfen nicht als
// Hausanschluss durchgehen.
const MOBILFUNK = `Produktinformationsblatt gemäß § 1 TK-Transparenzverordnung

GigaMobil XS+

Das Produkt umfasst eine Flat im Mobilfunknetz von Vodafone.

                                      Datenübertragungs-                Datenübertragungs-
                                      raten* im Download                  raten* im Upload

         Geschätzter Maximalwert                500 Mbit/s                          100 Mbit/s

         Normalerweise zur Verfügung stehend     50 Mbit/s                           25 Mbit/s

         Minimal                                 32 kbit/s                           32 kbit/s

Weitere Produktinformationen

 Listenpreis inkl. MwSt.                                        29,99 €
`;

// 1&1 führt in manchen Blättern ZWEI Anschlussarten in derselben Tabelle.
// Die Wertezeilen stehen abwechselnd über und unter ihrer Beschriftung.
const EINSUNDEINS_ZWEI_TECHNIKEN = `Produktinformationsblatt
gem. §1 TK-Transparenzverordnung

1&1 DSL 100 / 1&1 Glasfaser 100                                                 Vermarktet seit 15/11/2021

Das Produkt beinhaltet einen Internetzugang, kombiniert mit einem Telefonanschluss.

 Datenübertragungsrate                    Download                                Upload

                              100 MBit/s bei VDSL-Technologie         40 MBit/s bei VDSL-Technologie
 Maximal
                            100 MBit/s bei Glasfaser-Technologie     50 MBit/s bei Glasfaser-Technologie
 Normalerweise zur           83,8 MBit/s bei VDSL-Technologie         33,4 MBit/s bei VDSL-Technologie
 Verfügung stehend          100 MBit/s bei Glasfaser-Technologie     50 MBit/s bei Glasfaser-Technologie
                              54 MBit/s bei VDSL-Technologie          20 MBit/s bei VDSL-Technologie
 Minimal
                             80 MBit/s bei Glasfaser-Technologie     45 MBit/s bei Glasfaser-Technologie

                                     Weitere Produktinformationen
 Komplettprodukt                                                      44,99 €
`;

// Regionale Ausnahme direkt unter dem Wert — der Zusatz ist NICHT der Wert.
const EINSUNDEINS_REGIONAL = `Produktinformationsblatt
gem. §1 TK-Transparenzverordnung

1&1 Glasfaser 50                                                                  Vermarktet seit 08/03/2024

Das Produkt beinhaltet einen Internetzugang.

  Datenübertragungsrate                    Download                                 Upload

                                                                                  20 MBit/s
 Maximal                                    50 MBit/s
                                                                       In bestimmten Gebieten 10 MBit/s
 Normalerweise zur                                                                20 MBit/s
                                            50 MBit/s
 Verfügung stehend                                                     In bestimmten Gebieten 10 MBit/s
                                           50 MBit/s                               20 MBit/s
 Minimal
                                In bestimmten Gebieten 45 MBit/s        In bestimmten Gebieten 8 MBit/s

                                     Weitere Produktinformationen
 Komplettprodukt                                                      39,99 €
`;

// Reines Telefonie-Blatt: kein Internet, also keine Tabelle — kein Fehler.
const NUR_TELEFONIE = `Produktinformationsblatt gem. § 1 TK-Transparenzverordnung

Red Phone 12 Monate (Festnetz)

Das Produkt beinhaltet einen Telefonanschluss mit einer Flatrate.

Weitere Produktinformationen
Vertragslaufzeiten          12 Monate

Listenpreis inkl. MwSt.                            19,99 €
`;

// --- Grundbausteine -------------------------------------------------------

test("zahl liest deutsche Schreibweise", () => {
  assert.equal(zahl("83,8"), 83.8);
  assert.equal(zahl("1.000"), 1000);
  assert.equal(zahl("48,95"), 48.95);
  assert.equal(zahl("1.000,5"), 1000.5);
});

test("zahl verwechselt englischen Dezimalpunkt nicht mit Tausendertrenner", () => {
  // Einzelne 1&1-Blätter schreiben englisch. "0.768 MBit/s" als
  // Tausenderpunkt gelesen ergäbe 768 — das Tausendfache des Wahren.
  assert.equal(zahl("0.768"), 0.768);
  assert.equal(zahl("5.8"), 5.8);
  assert.equal(zahl("0.36"), 0.36);
  // Echte Tausender bleiben Tausender.
  assert.equal(zahl("1.500"), 1500);
});

test("technologieBestimmen nimmt die zuerst genannte Technologie", () => {
  // "DSL und Glasfaser": DSL ist die Regelversorgung, Glasfaser der Sonderfall.
  assert.equal(technologieBestimmen("DSL und Glasfaser"), "dsl");
  assert.equal(technologieBestimmen("VDSL 100"), "vdsl");
  assert.equal(technologieBestimmen("FTTH 1.000"), "glasfaser");
  assert.equal(technologieBestimmen("G.Fast 1.000"), "glasfaser-gfast");
  assert.equal(technologieBestimmen("Kabel"), "kabel");
  assert.equal(technologieBestimmen("Pure Speed 1000 (DOCSIS)"), "kabel");
});

test("technologieBestimmen geht die Quellen der Reihe nach durch", () => {
  assert.equal(technologieBestimmen(null, "GigaZuhause 1000 Kabel"), "kabel");
  assert.equal(technologieBestimmen(null, null, null), "unbekannt");
});

test("titelFinden überspringt die Fortsetzung des Blatt-Kopfs", () => {
  assert.equal(titelFinden(EINSUNDEINS), "1&1 Glasfaser 300");
});

test("titelFinden setzt einen über zwei Zeilen gebrochenen Namen zusammen", () => {
  // Alle neueren Vodafone-Blätter brechen den Namen genau dort, wo er
  // unterscheidbar wird. Ohne Fortsetzung fielen "Kooperationspartner I",
  // "II" und "III" zu einem Namen zusammen.
  const blatt = [
    "Produktinformationsblatt gemäß § 1 TK-Transparenzverordnung",
    "GigaZuhause 1000 Glasfaser - Ausbau durch",
    "Kooperationspartner III (Deutsche Glasfaser) 2025",
    "                                        Vermarktet seit 26.10.2025",
  ].join("\n");
  assert.equal(
    titelFinden(blatt),
    "GigaZuhause 1000 Glasfaser - Ausbau durch Kooperationspartner III (Deutsche Glasfaser) 2025"
  );
});

test("titelFinden hängt einen klein beginnenden Zusatz NICHT an den Namen", () => {
  // Die Telekom setzt unter den Produktnamen eine technische Präzisierung:
  //     MagentaZuhause L
  //     mit Geschwindigkeit Internet-Zugang VDSL 100 (Festnetz)
  // Auf der Rechnung steht nur "MagentaZuhause L" — und genau danach sucht
  // der Rechnungs-Abgleich. Nähme man den Zusatz mit, fände er das Produkt
  // nicht mehr, weil dessen Zahl (100) auf keiner Rechnung steht.
  assert.equal(titelFinden(TELEKOM), "MagentaZuhause L");
});

test("titelFinden hört bei Seitenmöbel und Fließtext auf", () => {
  // Nach dem Titel darf nur weitergelesen werden, was zum Namen gehört.
  const mitMoebel = [
    "Produktinformationsblatt gem. § 1 TK-Transparenzverordnung",
    "GigaZuhause 1000 Glasfaser - Ausbau durch",
    "Kooperationspartner III (Deutsche Glasfaser) 2025",
    "Festnetz",
    "Vermarktet seit 26.10.2025",
  ].join("\n");
  assert.equal(
    titelFinden(mitMoebel),
    "GigaZuhause 1000 Glasfaser - Ausbau durch Kooperationspartner III (Deutsche Glasfaser) 2025"
  );

  // Eine Leerzeile beendet den Überschriften-Block — sonst zöge der erste
  // Satz des Fließtextes in den Vertragsnamen.
  const mitLuecke = [
    "Produktinformationsblatt gem. § 1 TK-Transparenzverordnung",
    "GigaZuhause 1000 Kabel",
    "",
    "Das Produkt umfasst eine Internet-Flat.",
  ].join("\n");
  assert.equal(titelFinden(mitLuecke), "GigaZuhause 1000 Kabel");

  // Satzartig beendet = Fließtext, kein Namensteil.
  const mitSatz = [
    "Produktinformationsblatt gem. § 1 TK-Transparenzverordnung",
    "GigaZuhause 1000 Kabel",
    "Das Produkt umfasst eine Internet-Flat.",
  ].join("\n");
  assert.equal(titelFinden(mitSatz), "GigaZuhause 1000 Kabel");
});

test("titelFinden schneidet die rechte Spalte und '(Festnetz)' ab", () => {
  assert.equal(titelFinden(VODAFONE), "GigaZuhause 1000 Kabel Januar 2026");
  assert.equal(titelFinden(O2), "O2 Home L 175/250/300");
});

// --- Einfache Blätter -----------------------------------------------------

test("Telekom: Werte, Zugang aus dem Fließtext, Versionsstand", () => {
  const { tarife } = pibAuswerten(TELEKOM, { slug: "magentazuhause-l-2-vdsl-100" });
  assert.equal(tarife.length, 1);
  assert.deepEqual(tarife[0], {
    tarifname: "MagentaZuhause L",
    zugang: "VDSL 100",
    technologie: "vdsl",
    download_max_mbps: 100,
    download_normal_mbps: 83.8,
    download_min_mbps: 54,
    upload_max_mbps: 40,
    upload_normal_mbps: 33.4,
    upload_min_mbps: 20,
    monatspreis_eur: 48.95,
    versionsstand: "2025-10-01",
  });
});

test("Telekom: Versionsstand schlägt das Vermarktungsdatum", () => {
  // Im Blatt steht zuerst "Vermarktung seit 01.08.2018" — das ist NICHT
  // der Stand der Werte. Sonst wirkten die Daten sieben Jahre zu alt.
  const { tarife } = pibAuswerten(TELEKOM);
  assert.equal(tarife[0].versionsstand, "2025-10-01");
});

test("Vodafone: Rate ohne Leerzeichen ('75Mbit/s') wird gelesen", () => {
  const { tarife } = pibAuswerten(VODAFONE);
  assert.equal(tarife.length, 1);
  assert.equal(tarife[0].upload_max_mbps, 75);
  assert.equal(tarife[0].download_max_mbps, 1000);
  assert.equal(tarife[0].download_normal_mbps, 850);
  assert.equal(tarife[0].download_min_mbps, 600);
  assert.equal(tarife[0].technologie, "kabel");
  assert.equal(tarife[0].monatspreis_eur, 64.99);
});

test("1&1: Kopfzeile ohne 'im', Preis mit '/Monat'", () => {
  const { tarife } = pibAuswerten(EINSUNDEINS);
  assert.equal(tarife.length, 1);
  assert.equal(tarife[0].tarifname, "1&1 Glasfaser 300");
  assert.equal(tarife[0].download_max_mbps, 300);
  assert.equal(tarife[0].upload_min_mbps, 150);
  assert.equal(tarife[0].monatspreis_eur, 54.99);
  assert.equal(tarife[0].versionsstand, "2025-12-03");
});

// --- o2: der schwierige Fall ---------------------------------------------

test("o2: ein Blatt liefert vier eigenständige Tarif-Zeilen", () => {
  const { tarife } = pibAuswerten(O2);
  assert.equal(tarife.length, 4);
  assert.deepEqual(
    tarife.map((t) => `${t.tarifname} / ${t.zugang}`),
    [
      "O2 Home L 175 / DSL",
      "O2 Home L 250 / DSL und Glasfaser",
      "O2 Home L 300 / wilhelm.tel-DSL und Glasfaser",
      "O2 Home L 300 / Kabel",
    ]
  );
});

test("o2: umgebrochene Beschriftung findet ihre Werte", () => {
  const { tarife } = pibAuswerten(O2);
  const l175 = tarife[0];
  assert.equal(l175.download_normal_mbps, 145);
  assert.equal(l175.upload_normal_mbps, 35);
});

test("o2: regionale Erläuterung wird NICHT als Wert gelesen", () => {
  // Im Blatt steht neben "Maximal 250 MBit/s" der Zusatz "Bei Glasfaser
  // 50 Mbit/s oder 125 Mbit/s in ausgewählten Regionen". Der echte
  // Upload-Wert (40) steht eine Zeile HÖHER. Wer hier 50 oder 125 liest,
  // schreibt dem Nutzer einen falschen Vertrag zu.
  const { tarife } = pibAuswerten(O2);
  const l250 = tarife[1];
  assert.equal(l250.download_max_mbps, 250);
  assert.equal(l250.upload_max_mbps, 40);
  assert.equal(l250.upload_normal_mbps, 35);
  assert.equal(l250.upload_min_mbps, 20);
});

test("o2: zweite Tabelle behält den Namen ihres Blocks", () => {
  // Die Kabel-Tabelle gehört noch zu "O2 Home L 300" — nicht zum
  // Dokumenttitel "O2 Home L 175/250/300".
  const { tarife } = pibAuswerten(O2);
  const kabel = tarife[3];
  assert.equal(kabel.tarifname, "O2 Home L 300");
  assert.equal(kabel.technologie, "kabel");
  assert.equal(kabel.download_max_mbps, 300);
  assert.equal(kabel.download_normal_mbps, 255);
  assert.equal(kabel.download_min_mbps, 180);
  assert.equal(kabel.upload_max_mbps, 50);
});

test("o2: gleiche bis-zu-Rate, aber getrennte Zeilen", () => {
  // Glasfaser-300 und Kabel-300 haben beide 300 bis-zu, aber ein anderes
  // "normalerweise" (300 vs. 255). Sie dürfen nicht verschmelzen.
  const { tarife } = pibAuswerten(O2);
  assert.equal(tarife[2].download_normal_mbps, 300);
  assert.equal(tarife[3].download_normal_mbps, 255);
});

test("o2-Altblatt: Tippfehler 'MBits/s' in der Quelle wird gelesen", () => {
  const { tarife } = pibAuswerten(O2_ALT);
  assert.equal(tarife.length, 1);
  assert.equal(tarife[0].upload_min_mbps, 0.7);
  assert.equal(tarife[0].download_min_mbps, 6);
});

test("Vodafone alt: 'Geschätzter Maximalwert' zählt als Höchstrate", () => {
  const { tarife } = pibAuswerten(VODAFONE_ALT);
  assert.equal(tarife.length, 1);
  assert.equal(tarife[0].download_max_mbps, 1000);
  assert.equal(tarife[0].upload_max_mbps, 50);
  assert.equal(tarife[0].download_normal_mbps, 800);
  assert.equal(tarife[0].download_min_mbps, 600);
});

test("falsch verlinktes Mobilfunk-Blatt wird nicht als Festnetz-Tarif gelesen", () => {
  // Sonst stünde beim Nutzer ein Handytarif als sein Hausanschluss.
  const ergebnis = pibAuswerten(MOBILFUNK);
  assert.equal(ergebnis.tarife, undefined);
  assert.match(ergebnis.uebersprungen, /Mobilfunk/);
});

test("Festnetz-Blatt darf Mobilfunk als Zuführung erwähnen", () => {
  // o2 nennt im Fließtext "über DSL, Glasfaser, Kabel oder Mobilfunk".
  const { tarife } = pibAuswerten(O2);
  assert.equal(tarife.length, 4);
});

test("Absatz-Ende wird nicht als Tarifname missverstanden", () => {
  // o2s Fließtext endet auf "… vor Beginn Ihrer Bestellung." — eine kurze
  // Zeile direkt über der Tabelle. Als Tarifname wäre das grober Unfug.
  const mitAbsatz = O2.replace(
    "                   O2 Home L 175",
    "                 verfügbaren Bandbreiten erfahren Sie im Verfügbarkeitscheck vor Beginn Ihrer\n                 Bestellung."
  );
  const { tarife } = pibAuswerten(mitAbsatz);
  assert.equal(tarife[0].tarifname, "O2 Home L 175/250/300");
  assert.ok(!tarife.some((t) => /Bestellung/.test(t.tarifname)));
});

// --- 1&1: zwei Anschlussarten und regionale Ausnahmen ---------------------

test("1&1: zwei Anschlussarten in einer Tabelle werden getrennt", () => {
  // VDSL-Kunden steht 83,8 zu, Glasfaser-Kunden 100. Verschmölzen die
  // Zeilen, bekäme die Hälfte der Kunden das falsche Urteil.
  const { tarife } = pibAuswerten(EINSUNDEINS_ZWEI_TECHNIKEN);
  assert.equal(tarife.length, 2);

  const vdsl = tarife.find((t) => t.zugang === "VDSL");
  assert.deepEqual(
    [vdsl.download_max_mbps, vdsl.download_normal_mbps, vdsl.download_min_mbps],
    [100, 83.8, 54]
  );
  assert.deepEqual(
    [vdsl.upload_max_mbps, vdsl.upload_normal_mbps, vdsl.upload_min_mbps],
    [40, 33.4, 20]
  );

  const glas = tarife.find((t) => t.zugang === "Glasfaser");
  assert.deepEqual(
    [glas.download_max_mbps, glas.download_normal_mbps, glas.download_min_mbps],
    [100, 100, 80]
  );
  assert.equal(glas.technologie, "glasfaser");
});

test("1&1: regionale Ausnahme wird nicht als Wert gelesen", () => {
  // "In bestimmten Gebieten 10 MBit/s" steht neben dem echten Wert 20.
  const { tarife } = pibAuswerten(EINSUNDEINS_REGIONAL);
  assert.equal(tarife.length, 1);
  assert.deepEqual(
    [tarife[0].upload_max_mbps, tarife[0].upload_normal_mbps, tarife[0].upload_min_mbps],
    [20, 20, 20]
  );
  assert.deepEqual(
    [
      tarife[0].download_max_mbps,
      tarife[0].download_normal_mbps,
      tarife[0].download_min_mbps,
    ],
    [50, 50, 50]
  );
});

// --- Abgrenzung: überspringen vs. laut scheitern --------------------------

test("Blatt ohne Geschwindigkeits-Tabelle wird übersprungen, nicht gemeldet", () => {
  const ergebnis = pibAuswerten(NUR_TELEFONIE);
  assert.equal(ergebnis.uebersprungen, "keine Geschwindigkeits-Tabelle");
  assert.equal(ergebnis.tarife, undefined);
  assert.equal(ergebnis.fehler, undefined);
});

test("unvollständige Tabelle scheitert LAUT statt still zu raten", () => {
  const kaputt = VODAFONE.replace("600 Mbit/s", "").replace("15 Mbit/s", "");
  const ergebnis = pibAuswerten(kaputt);
  assert.equal(ergebnis.tarife, undefined);
  assert.match(ergebnis.fehler, /min\/Download/);
});

test("unlogische Reihenfolge min>max scheitert LAUT", () => {
  // Sicherheitsnetz für die 1000 Zeilen, die niemand einzeln nachliest:
  // minimal ≤ normalerweise ≤ maximal ist gesetzlich zwingend.
  const verdreht = VODAFONE.replace("600 Mbit/s", "6000 Mbit/s");
  const ergebnis = pibAuswerten(verdreht);
  assert.equal(ergebnis.tarife, undefined);
  assert.match(ergebnis.fehler, /min≤normal≤max verletzt/);
});

test("Nebenangaben dürfen fehlen — Geschwindigkeiten nicht", () => {
  const ohnePreis = VODAFONE.replace("64,99 €", "").replace("Listenpreis", "");
  const { tarife } = pibAuswerten(ohnePreis);
  assert.equal(tarife.length, 1);
  assert.equal(tarife[0].monatspreis_eur, null);
  assert.equal(tarife[0].download_max_mbps, 1000);
});

test("Telefonie-Tarif mit Null-Tabelle landet nicht in der Auswahl", () => {
  // Vodafones "Red Phone" füllt die Tabelle mit 0,00 Mbit/s. Sauber
  // gelesen — aber als wählbarer Internet-Tarif wäre es Unsinn.
  const nullen = VODAFONE.replace(/1000 Mbit\/s/, "0,00 Mbit/s")
    .replace(/850 Mbit\/s/, "0,00 Mbit/s")
    .replace(/600 Mbit\/s/, "0,00 Mbit/s")
    .replace(/75Mbit\/s/, "0,00 Mbit/s")
    .replace(/55 Mbit\/s/, "0,00 Mbit/s")
    .replace(/15 Mbit\/s/, "0,00 Mbit/s");
  const ergebnis = pibAuswerten(nullen);
  assert.equal(ergebnis.tarife, undefined);
  assert.equal(ergebnis.uebersprungen, "keine auswertbare Tabelle");
});

test("nurWenn-Filter hält fremde Blätter heraus", () => {
  const ergebnis = pibAuswerten(VODAFONE, { nurWenn: (t) => /\(Festnetz\)/.test(t) });
  assert.equal(ergebnis.uebersprungen, "kein Festnetz-Internet-Blatt");
});

test("tabellenFinden zählt die Tabellen je Blatt", () => {
  assert.equal(tabellenFinden(TELEKOM).length, 1);
  assert.equal(tabellenFinden(O2).length, 4);
  assert.equal(tabellenFinden(NUR_TELEFONIE).length, 0);
});

// --- Nachbarzelle darf den Wert nicht überschreiben -----------------------
//
// Die drei folgenden Vorlagen stammen 1:1 aus echten Blättern, in denen der
// Parser zuvor den Wert der NACHBARZELLE gelesen hat. Alle drei Fehler haben
// dieselbe Wurzel: Etwas, das gar nicht zur Zelle gehört, stand an einer
// Stelle, an der der Parser zuerst nachgesehen hat.

// 1&1 DSL 16: Die regionale Fußnote von "Maximal" läuft auf die Zeile direkt
// ÜBER "Normalerweise" aus. Dort steht sie ohne ihre erklärenden Wörter —
// wer von oben nach unten liest, hält die 16 für den Normalwert und rechnet
// dem Kunden 16 Mbit/s vor, obwohl sein Vertrag 9,5 hergibt.
const EINSUNDEINS_FUSSNOTE_OBEN = `Produktinformationsblatt gem. § 1 TK-Transparenzverordnung

1&1 DSL 16

                Datenübertragungsrate                           Download                      Upload
                                                               20 MBit/s In                5,8 MBit/s In
 Maximal                                                  bestimmten Gebieten          bestimmten Gebieten
                                                                16 MBit/s                    2,4 MBit/s
 Normalerweise zur Verfügung stehend                             9,5 Mbit/s                  1,5 Mbit/s
                                                                                          0,364 MBit/s In
 Minimal                                                       0,768 MBit/s            bestimmten Gebieten
                                                                                           0,064 MBit/s

 Weitere Produktinformationen
`;

test("1&1: Fußnote der Zelle darüber schlägt nicht den echten Normalwert", () => {
  const [tabelle] = tabellenFinden(EINSUNDEINS_FUSSNOTE_OBEN);
  assert.equal(tabelle.max.download, 20);
  assert.equal(tabelle.normal.download, 9.5, "9,5 steht auf der Beschriftungszeile selbst");
  assert.equal(tabelle.min.download, 0.768);
  assert.equal(tabelle.normal.upload, 1.5);
});

// o2 Kabel: Hier steht der echte Upload-Wert eine Zeile ÜBER seiner
// Beschriftung, und auf der Beschriftungszeile selbst steht die regionale
// Fußnote — also genau andersherum als bei 1&1. Der Parser muss beide Formen
// aushalten: Beschriftungszeile zuerst, aber Fußnoten erkennen, egal ob ihre
// erklärenden Wörter links oder rechts von der Zahl stehen.
const O2_FUSSNOTE_RECHTS = `Produktinformationsblatt gem. § 1 TK-Transparenzverordnung

  O2 Home M 150

  Datenübertragungsraten
                                         im Download                         im Upload
  über Kabel
                                                                               75 MBit/s
  Maximal                                 150 MBit/s               50 MBit/s in ausgewählten Regionen

  Normalerweise zur Verfügung                                                  55 MBit/s
                                          128 MBit/s
  stehend                                                          35 MBit/s in ausgewählten Regionen

  Minimal                                 105 MBit/s                          15 MBit/s

 Weitere Produktinformationen
`;

test("o2: regionale Fußnote RECHTS neben der Zahl gilt nicht als Wert", () => {
  const [tabelle] = tabellenFinden(O2_FUSSNOTE_RECHTS);
  assert.deepEqual(
    [tabelle.max.upload, tabelle.normal.upload, tabelle.min.upload],
    [75, 55, 15],
    "50 und 35 sind regionale Ausnahmen, nicht die Vertragswerte"
  );
  assert.deepEqual(
    [tabelle.max.download, tabelle.normal.download, tabelle.min.download],
    [150, 128, 105]
  );
});

test("eine Fußnote weiter rechts auf der Zeile entwertet den echten Wert nicht", () => {
  // Gegenprobe zur Regel oben: Steht die Erläuterung erst nach einem
  // Spaltensprung, gehört die Zahl davor sehr wohl in die Zelle.
  const mitAbstand = O2_FUSSNOTE_RECHTS.replace(
    "150 MBit/s               50 MBit/s in ausgewählten Regionen",
    "150 MBit/s        75 MBit/s      In einzelnen Regionen 10 MBit/s"
  );
  const [tabelle] = tabellenFinden(mitAbstand);
  assert.equal(tabelle.max.upload, 75);
});

// Beginnt eine Tabelle oben auf Seite 2, steht der Seitenkopf zwischen ihr
// und ihrer Überschrift. Er darf nicht als Tarifname durchgehen: Der Nutzer
// bekäme sonst zwei Knöpfe, von denen der richtig benannte die falschen
// Werte trägt — und damit das falsche Urteil.
const O2_SEITENUMBRUCH = `Produktinformationsblatt gem. § 1 TK-Transparenzverordnung

  O2 Home M 150

                Stand 06/26, Version 1.0
Produktinformationsblatt gem. § 1 TK-Transparenzverordnung

  Datenübertragungsraten
                                         im Download                         im Upload
  über Kabel

  Maximal                                 150 MBit/s                          75 MBit/s

  Normalerweise zur Verfügung stehend      128 MBit/s                          55 MBit/s

  Minimal                                 105 MBit/s                          15 MBit/s

 Weitere Produktinformationen
`;

test("Seitenkopf von Seite 2 wird nicht zum Tarifnamen", () => {
  const [tabelle] = tabellenFinden(O2_SEITENUMBRUCH);
  assert.equal(tabelle.ueberschrift, "O2 Home M 150");
});

test("Blatt mit Geschwindigkeiten, aber unlesbarer Tabelle, meldet sich LAUT", () => {
  // Ein Anbieter gestaltet sein Blatt um, und der Parser versteht die Form
  // nicht mehr. Das darf nicht im selben Topf landen wie ein reines
  // Telefonie-Blatt — sonst verschwindet der Tarif still aus der Datenbank.
  const unbekannteForm = `Produktinformationsblatt gem. § 1 TK-Transparenzverordnung

Beispiel-Tarif

  Datenübertragungsrate            Runterladen            Hochladen

  Maximal                          100 MBit/s              40 MBit/s
`;
  const ergebnis = pibAuswerten(unbekannteForm);
  assert.equal(ergebnis.uebersprungen, undefined);
  assert.match(ergebnis.fehler, /keine lesbare Tabelle/);
});
