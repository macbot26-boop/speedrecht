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
  /**
   * Repräsentant der Klasse — trägt die Zahlen, auf denen das Urteil beruht.
   * Identisch mit `namensWahl[0]` (kürzester Name = Basis-Variante).
   */
  tarif: Tarif;
  /**
   * Ein Vertrag je Vertragsnamen dieser Klasse, kürzester Name zuerst.
   *
   * Ein einziger Eintrag heißt: die Klasse ist eindeutig benannt, ein Tap
   * genügt. Mehrere heißt: der Nutzer muss seinen Namen selbst wählen — sonst
   * stünde im Ergebnis (und später im Kulanz-Brief) ein Vertragsname, den er
   * nie bestellt hat. Das Urteil ist für alle gleich, der Name nicht.
   */
  namensWahl: Tarif[];
  /**
   * Produktnamen für die Knopf-Beschriftung — so viele, wie draufpassen
   * (`MAX_KNOPF_NAMEN`, `KNOPF_NAMEN_BUDGET`), mindestens einer.
   * Zusatz-Varianten ("… L Flex") stehen unter ihrem Grundnamen ("… L") —
   * der Knopf soll die wirklich verschiedenen Produkte zeigen, nicht dieselbe
   * Familie dreimal.
   */
  produkte: string[];
  /** Wie viele Vertragsnamen der Knopf NICHT zeigt (0 = er zeigt alle). */
  weitereNamen: number;
  /**
   * Zusatz zur Beschriftung, wo zwei Auswahl-Knöpfe sonst gleich aussähen —
   * gleiche Namen UND gleiche bis-zu-Rate, aber verschiedene Urteile.
   * Nur gesetzt, wo er wirklich gebraucht wird, und nur so viel, wie zum
   * Auseinanderhalten nötig ist.
   */
  unterscheidung?: { normalMbps?: number; minMbps?: number };
}

/** Mehr als zwei Namen sprengen den Knopf auch dann, wenn beide kurz sind. */
export const MAX_KNOPF_NAMEN = 2;

/**
 * So viel Platz haben die Produktnamen zusammen auf einem Knopf.
 *
 * Der erste Name steht immer da, auch wenn er allein schon länger ist — ein
 * Vertragsname wird nie abgeschnitten, sonst stünde wieder etwas auf dem
 * Schirm, das so auf keiner Rechnung steht. Ein zweiter kommt nur dazu, wenn
 * beide zusammen darunter bleiben; sonst würde aus Vodafones langen Namen ein
 * vierzeiliger Klotz auf dem Handy.
 */
export const KNOPF_NAMEN_BUDGET = 48;

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
    // Schlüssel ist genau das, was der Nutzer sieht — auch der "+3"-Zähler.
    // Zwei Knöpfe mit denselben zwei Namen und derselben Restzahl sind für ihn
    // ununterscheidbar, egal wie verschieden die verdeckten Namen sind.
    const etikett = `${v.produkte.join(", ")}|+${v.weitereNamen}|${aufAnzeige(v.tarif.download_max_mbps)}`;
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

// Reihenfolge der Namen: kürzester zuerst (= Basis-Variante vor "… Flex"),
// bei Gleichstand alphabetisch nach slug — deterministisch.
function nachNamensLaenge(a: Tarif, b: Tarif): number {
  return (
    a.tarifname.length - b.tarifname.length ||
    a.tarifname.localeCompare(b.tarifname) ||
    a.slug.localeCompare(b.slug)
  );
}

// Ein Vertrag je Vertragsnamen — gleichnamige Blätter (verschiedene Jahrgänge,
// verschiedene Regional-Zuschläge) sind für die Auswahl derselbe Eintrag.
function jeNamenEinTarif(tarife: Tarif[]): Tarif[] {
  const proName = new Map<string, Tarif>();
  for (const t of [...tarife].sort(nachNamensLaenge)) {
    if (!proName.has(t.tarifname)) proName.set(t.tarifname, t);
  }
  return [...proName.values()];
}

// Produktnamen einer Klasse: Namen, die nicht bloß Zusatz-Variante eines
// kürzeren Namens derselben Klasse sind. "MagentaZuhause L Flex" fällt unter
// "MagentaZuhause L"; "O2 Home M 100" ist ein eigenes Produkt und bleibt.
function produktNamen(namen: string[]): string[] {
  return namen.filter((n) => !namen.some((m) => m !== n && n.startsWith(m + " ")));
}

// So viele Produktnamen, wie auf den Knopf passen — mindestens einer.
function aufKnopfPassend(produkte: string[]): string[] {
  const gezeigt = [produkte[0]];
  for (const name of produkte.slice(1, MAX_KNOPF_NAMEN)) {
    if ([...gezeigt, name].join(", ").length > KNOPF_NAMEN_BUDGET) break;
    gezeigt.push(name);
  }
  return gezeigt;
}

// Eine Klasse in die Form bringen, die Auswahl und Ergebnis brauchen.
function alsVorschlag(tarife: Tarif[]): TarifVorschlag {
  const namensWahl = jeNamenEinTarif(tarife);
  const produkte = aufKnopfPassend(produktNamen(namensWahl.map((t) => t.tarifname)));
  return {
    tarif: namensWahl[0],
    namensWahl,
    produkte,
    weitereNamen: namensWahl.length - produkte.length,
  };
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
    bewertet.slice(0, maxAnzahl).map(({ klasse }) => alsVorschlag(klasse.tarife))
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
      .map((klasse) => alsVorschlag(klasse.tarife))
      .sort(
        (a, b) =>
          a.tarif.download_max_mbps - b.tarif.download_max_mbps ||
          a.tarif.tarifname.localeCompare(b.tarif.tarifname)
      )
  );
}
