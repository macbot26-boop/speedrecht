// Tarif-Vorschlag: "Du bist bei <Anbieter> und misst <X> Mbit/s —
// welcher dieser Tarife ist wohl deiner?"
//
// Idee: Tarife desselben Anbieters werden zu Geschwindigkeits-Klassen
// gebündelt (alle Varianten mit gleichem Maximal-Download, z. B. Flex /
// On-Net / All-Net). Vorgeschlagen werden die Klassen, die am besten zur
// gemessenen Geschwindigkeit passen — bevorzugt solche, deren Maximum die
// Messung abdeckt (der eigene Vertrag liegt selten UNTER dem Messwert;
// umgekehrt ständig, z. B. wegen WLAN).
//
// Pur gehalten (Daten als Parameter) — testbar ohne Bundler-Magie.

import { aufAnzeige } from "./anzeige.ts";

export interface Tarif {
  anbieter: string;
  slug: string;
  tarifname: string;
  zugang: string | null;
  technologie: string;
  download_max_mbps: number;
  download_normal_mbps: number | null;
  download_min_mbps: number | null;
  upload_max_mbps: number;
  upload_normal_mbps: number | null;
  upload_min_mbps: number | null;
  monatspreis_eur: number | null;
  quelle_url: string;
  versionsstand: string | null;
}

export interface TarifDaten {
  stand: string;
  quelle: string;
  tarife: Tarif[];
}

export interface TarifVorschlag {
  /** Repräsentant der Klasse (kürzester Name = Basis-Variante). */
  tarif: Tarif;
  /** Wie viele Vertrags-Varianten es in dieser Klasse gibt. */
  varianten: number;
  /**
   * Zusatz zur Beschriftung, wo zwei Auswahl-Knöpfe sonst gleich aussähen —
   * gleicher Name UND gleiche bis-zu-Rate, aber verschiedene Urteile.
   * Nur gesetzt, wo er wirklich gebraucht wird, und nur so viel, wie zum
   * Auseinanderhalten nötig ist.
   */
  unterscheidung?: { normalMbps?: number; minMbps?: number };
}

// Eine Bewertungs-Klasse: Tarife, die für den Vergleich gleichwertig sind —
// gleiche bis-zu-, normalerweise- UND Minimum-Rate. Reine Namensvarianten
// (z. B. "L" vs. "L Flex") werden zusammengefasst; Tarife mit anderen Werten
// (z. B. "L" 83,8 vs. "M" 83,3 bei derselben bis-zu-Rate 100) bleiben getrennt
// — sonst stünde ein falscher Name oder ein falsches Urteil auf dem Schirm.
interface Klasse {
  download_max_mbps: number;
  tarife: Tarif[];
}

// Auf Anzeige-Genauigkeit, nicht auf Rohwerte: Zwei Blätter desselben Tarifs
// aus verschiedenen Jahrgängen schreiben mal "0,77", mal "0,768" Mbit/s. Auf
// dem Schirm steht beide Male "0.8", und das Urteil ist dasselbe — als zwei
// Auswahl-Knöpfe wären sie für niemanden unterscheidbar.
function klassenSchluessel(tarif: Tarif): string {
  const w = (n: number | null) => (n == null ? "-" : aufAnzeige(n));
  return `${w(tarif.download_max_mbps)}|${w(tarif.download_normal_mbps)}|${w(tarif.download_min_mbps)}`;
}

function klassenBilden(tarife: Tarif[]): Klasse[] {
  const map = new Map<string, Tarif[]>();
  for (const tarif of tarife) {
    const schluessel = klassenSchluessel(tarif);
    let liste = map.get(schluessel);
    if (!liste) {
      liste = [];
      map.set(schluessel, liste);
    }
    liste.push(tarif);
  }
  return [...map.values()].map((gruppe) => ({
    download_max_mbps: gruppe[0].download_max_mbps,
    tarife: gruppe,
  }));
}

/**
 * Versieht Optionen, die in der Auswahl sonst gleich aussähen, mit dem Wert,
 * der sie tatsächlich unterscheidet.
 *
 * Ohne das stünden bei o2 und 1&1 zwei identisch beschriftete Knöpfe
 * nebeneinander ("1&1 Glasfaser 50 · bis zu 50"), die zu verschiedenen
 * Urteilen führen — der Nutzer könnte nur raten, welcher seiner ist.
 */
function unterscheidbarMachen(vorschlaege: TarifVorschlag[]): TarifVorschlag[] {
  const gruppen = new Map<string, TarifVorschlag[]>();
  for (const v of vorschlaege) {
    const etikett = `${v.tarif.tarifname}|${aufAnzeige(v.tarif.download_max_mbps)}`;
    gruppen.set(etikett, [...(gruppen.get(etikett) ?? []), v]);
  }

  const angezeigt = (n: number | null) => (n == null ? "-" : aufAnzeige(n));
  const alleVerschieden = (gruppe: TarifVorschlag[], werte: (v: TarifVorschlag) => string) =>
    new Set(gruppe.map(werte)).size === gruppe.length;

  for (const gruppe of gruppen.values()) {
    if (gruppe.length < 2) continue;

    // So wenig wie möglich anzeigen: "normalerweise" zuerst, weil das Urteil
    // daran hängt. Reicht ein Wert nicht (drei Tarife, von denen sich zwei
    // erst im Minimum unterscheiden), kommen beide dazu.
    const nurNormal = alleVerschieden(gruppe, (v) => `${angezeigt(v.tarif.download_normal_mbps)}`);
    const nurMin = alleVerschieden(gruppe, (v) => `${angezeigt(v.tarif.download_min_mbps)}`);

    for (const v of gruppe) {
      const normal = v.tarif.download_normal_mbps;
      const min = v.tarif.download_min_mbps;
      if (nurNormal) {
        if (normal != null) v.unterscheidung = { normalMbps: normal };
      } else if (nurMin) {
        if (min != null) v.unterscheidung = { minMbps: min };
      } else {
        v.unterscheidung = {
          ...(normal != null ? { normalMbps: normal } : {}),
          ...(min != null ? { minMbps: min } : {}),
        };
      }
    }
  }
  return vorschlaege;
}

// Repräsentant einer Klasse: der kürzeste Name (= Basis-Variante), bei
// Gleichstand alphabetisch nach slug — deterministisch.
function waehleRepraesentant(tarife: Tarif[]): Tarif {
  return [...tarife].sort(
    (a, b) => a.tarifname.length - b.tarifname.length || a.slug.localeCompare(b.slug)
  )[0];
}

/**
 * Schlägt bis zu `maxAnzahl` Bewertungs-Klassen des Anbieters vor, sortiert
 * nach Nähe zur gemessenen Download-Geschwindigkeit.
 */
export function tarifVorschlaege(
  daten: TarifDaten,
  anbieter: string,
  gemessenMbps: number,
  maxAnzahl = 3
): TarifVorschlag[] {
  if (!Number.isFinite(gemessenMbps) || gemessenMbps <= 0) return [];

  const passende = daten.tarife.filter((t) => t.anbieter === anbieter);
  if (passende.length === 0) return [];

  // Abstand auf Log-Skala (16 vs. 25 ist "näher" als 1000 vs. 2000 linear);
  // Klassen UNTER dem Messwert bekommen einen Malus — der eigene Vertrag
  // liegt praktisch nie unter dem, was man tatsächlich misst.
  const bewertet = klassenBilden(passende).map((klasse) => {
    let abstand = Math.abs(Math.log(klasse.download_max_mbps / gemessenMbps));
    if (klasse.download_max_mbps < gemessenMbps) abstand *= 2.5;
    return { klasse, abstand };
  });

  bewertet.sort(
    (a, b) => a.abstand - b.abstand || a.klasse.download_max_mbps - b.klasse.download_max_mbps
  );

  return unterscheidbarMachen(
    bewertet.slice(0, maxAnzahl).map(({ klasse }) => ({
      tarif: waehleRepraesentant(klasse.tarife),
      varianten: klasse.tarife.length,
    }))
  );
}

/**
 * Alle Bewertungs-Klassen eines Anbieters, aufsteigend nach beworbener Rate.
 * Für den "Meiner ist nicht dabei"-Fall: die ganze Auswahl zum Durchblättern.
 */
export function tarifKlassen(daten: TarifDaten, anbieter: string): TarifVorschlag[] {
  const passende = daten.tarife.filter((t) => t.anbieter === anbieter);
  if (passende.length === 0) return [];

  return unterscheidbarMachen(
    klassenBilden(passende)
      .sort(
        (a, b) =>
          a.download_max_mbps - b.download_max_mbps ||
          waehleRepraesentant(a.tarife).tarifname.localeCompare(
            waehleRepraesentant(b.tarife).tarifname
          )
      )
      .map((klasse) => ({
        tarif: waehleRepraesentant(klasse.tarife),
        varianten: klasse.tarife.length,
      }))
  );
}
