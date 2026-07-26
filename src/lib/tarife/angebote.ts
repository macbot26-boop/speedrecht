// Das Angebots-Regal — "was es heute für deine Geschwindigkeit gibt".
//
// Was das hier NICHT ist: eine Ersparnis-Rechnung. Wir behaupten nie, dass
// jemand X Euro spart. Der Grund ist nicht Zurückhaltung, sondern Datenlage:
// Der Preis, den wir vom Nutzer kennen, steht in SEINEM Blatt — und zwei von
// drei Verträgen stammen von einem Blatt vor 2025. Eine Ersparnis gegen einen
// Listenpreis von 2018 zu rechnen, wäre keine Ersparnis, sondern Inflation.
// Deshalb stellt das Regal aktuelle Angebote hin und überlässt die Rechnung
// dem Nutzer. Erst wenn der Rechnungs-Scan den ECHTEN Monatsbetrag geliefert
// hat, darf sein Preis danebenstehen — auch dann als zweite Zahl, nicht als
// behauptete Differenz.
//
// Alle Preise in den Blättern sind Listenpreise OHNE Endgeräte — geprüft an
// allen 270 aktuellen PDFs, alle fünf Anbieter zu 100 %. Sie sind damit
// gleichartig und untereinander vergleichbar; der Router kommt überall obendrauf.
// Das gehört als EIN Hinweis unter das Regal, nicht als Etikett an jeden Preis.
//
// Pur gehalten (Daten als Parameter) — testbar ohne Bundler-Magie.

import { aufAnzeige } from "./anzeige.ts";
import type { Tarif, TarifDaten } from "./vorschlag.ts";

/**
 * Wie alt ein Blatt höchstens sein darf, um als "heutiges Angebot" zu gelten.
 *
 * Gemessen wird gegen `daten.stand` (wann wir gesammelt haben), NICHT gegen
 * ein fest eingetragenes Datum. Ein festes Datum altert still mit: "seit 2025"
 * wäre 2028 immer noch erfüllt, das Regal zeigte dann drei Jahre alte Preise
 * und niemand merkte es. So verschiebt sich das Fenster mit den Daten.
 */
export const AKTUELL_MONATE = 18;

/**
 * Höchstens so viele Angebote stehen im Regal.
 *
 * Drei, weil das Regal eine Einordnung sein soll und kein Katalog: Wer
 * zwanzig Zeilen sieht, vergleicht nicht mehr, sondern blättert weg — und
 * vergleichen kann das Portal ohnehin besser als wir.
 */
export const MAX_ANGEBOTE = 3;

/**
 * Die Grenze, ab der ein Blatt als aktuell gilt — als Zeichenkette zum
 * Vergleichen, nicht als Kalendertag.
 *
 * Absichtlich Zeichenketten-Arithmetik: `versionsstand` ist überall
 * `YYYY-MM-DD`, und der Vergleich zweier solcher Zeichenketten ist derselbe
 * wie der Vergleich der Daten. Der zurückgerechnete Tag kann dabei rechnerisch
 * über das Monatsende hinauslaufen ("2024-09-31"); als GRENZE ist das
 * unschädlich — sie meint dann "nach dem 30. September".
 */
export function aktuellAb(stand: string): string {
  const [jahr, monat, tag] = stand.split("-");
  const verschoben = Number(jahr) * 12 + (Number(monat) - 1) - AKTUELL_MONATE;
  const neuesJahr = Math.floor(verschoben / 12);
  const neuerMonat = (verschoben % 12) + 1;
  return `${neuesJahr}-${String(neuerMonat).padStart(2, "0")}-${tag}`;
}

/**
 * Je Vertragsnamen EIN Blatt — und zwar das vorsichtigste.
 *
 * Warum das nötig ist: 58 von 126 aktuellen Vertragsnamen tragen mehrere
 * Blätter (1&1 DSL 16 allein 21), weil derselbe Vertrag je nach Region
 * verschiedene Raten zusagt. Zeigten wir die BESTE Variante und der Nutzer
 * bekäme an seiner Adresse die schlechteste, hätten wir ihm mehr versprochen,
 * als der Vertrag hergibt — und zwar mit einer Zahl, die aus einem echten
 * Blatt stammt und deshalb besonders glaubwürdig aussieht.
 *
 * Also gewinnt die NIEDRIGSTE normalerweise-Rate. Das Regal zeigt damit
 * eher zu wenig als zu viel; ein Vertrag, der es hineinschafft, hält seine
 * Zusage überall.
 *
 * Ein Eintrag bleibt dabei EIN Blatt: Rate, Preis und Quell-Verweis stammen
 * aus demselben Dokument. Mischten wir die Rate aus dem einen und den Preis
 * aus dem anderen Blatt, stünde eine Kombination auf dem Schirm, die es
 * nirgends gibt und die niemand nachschlagen könnte.
 */
function jeNamenDasVorsichtigste(tarife: Tarif[]): Tarif[] {
  const proName = new Map<string, Tarif>();
  for (const tarif of tarife) {
    const schluessel = `${tarif.anbieter}|${tarif.tarifname}`;
    const bisher = proName.get(schluessel);
    if (!bisher || istVorsichtiger(tarif, bisher)) proName.set(schluessel, tarif);
  }
  return [...proName.values()];
}

// Feste Rangfolge statt Oder-Verkettung, damit die Auswahl nicht von der
// Reihenfolge in der Datei abhängt: niedrigste Rate, dann das neuere Blatt,
// dann der niedrigere Preis, zuletzt der slug als letzter Ausschlag.
function istVorsichtiger(a: Tarif, b: Tarif): boolean {
  const rateA = a.download_normal_mbps ?? Infinity;
  const rateB = b.download_normal_mbps ?? Infinity;
  if (rateA !== rateB) return rateA < rateB;
  const standA = a.versionsstand ?? "";
  const standB = b.versionsstand ?? "";
  if (standA !== standB) return standA > standB;
  const preisA = a.monatspreis_eur ?? Infinity;
  const preisB = b.monatspreis_eur ?? Infinity;
  if (preisA !== preisB) return preisA < preisB;
  return a.slug < b.slug;
}

/**
 * Aktuelle Verträge anderer Anbieter, die mindestens so viel zusagen wie der
 * eigene — günstigster zuerst, höchstens einer je Anbieter.
 *
 * Warum höchstens einer je Anbieter: Sonst stünde dreimal 1&1 im Regal, weil
 * ein Anbieter mit vielen Blättern die Preisliste anführt. Das Regal soll
 * zeigen, was der MARKT hergibt — drei Namen von drei Anbietern sagen mehr
 * als drei Namen von einem.
 *
 * Warum kein Filter auf "günstiger als deiner": Der eigene Preis ist der
 * Listenpreis aus dem eigenen Blatt und oft Jahre alt (siehe Kopf). Ein Regal,
 * das auch mal nur teurere Angebote zeigt, sagt dem Nutzer etwas Wahres —
 * nämlich dass sein Vertrag preislich in Ordnung ist.
 *
 * @param eigener Der Vertrag des Nutzers. Sein Anbieter fällt aus dem Regal
 *   (Founder-Entscheidung: wer mit seinem Anbieter unzufrieden ist, will nicht
 *   denselben Anbieter vorgeschlagen bekommen), seine normalerweise-Rate ist
 *   die Messlatte.
 */
export function angebote(daten: TarifDaten, eigener: Tarif): Tarif[] {
  // Ohne zugesagte Rate gibt es keine Messlatte. Dann lieber kein Regal als
  // eines, das an nichts hängt — sonst stünde vor einem 16-Mbit-Anschluss ein
  // Gigabit-Tarif als "Angebot".
  if (eigener.download_normal_mbps == null) return [];

  const grenze = aktuellAb(daten.stand);
  const messlatte = aufAnzeige(eigener.download_normal_mbps);

  const aktuelle = daten.tarife.filter(
    (t) =>
      t.anbieter !== eigener.anbieter &&
      t.versionsstand != null &&
      t.versionsstand >= grenze &&
      t.monatspreis_eur != null &&
      t.download_normal_mbps != null
  );

  // Vergleich über aufAnzeige wie überall im Projekt: Sonst fiele ein Tarif
  // mit 49,96 gegen 50 heraus, obwohl auf dem Schirm bei beiden "50.0" steht.
  const passende = jeNamenDasVorsichtigste(aktuelle).filter(
    (t) => aufAnzeige(t.download_normal_mbps as number) >= messlatte
  );

  passende.sort(
    (a, b) =>
      (a.monatspreis_eur as number) - (b.monatspreis_eur as number) ||
      a.tarifname.localeCompare(b.tarifname) ||
      a.slug.localeCompare(b.slug)
  );

  const regal: Tarif[] = [];
  const schonVertreten = new Set<string>();
  for (const tarif of passende) {
    if (schonVertreten.has(tarif.anbieter)) continue;
    schonVertreten.add(tarif.anbieter);
    regal.push(tarif);
    if (regal.length === MAX_ANGEBOTE) break;
  }
  return regal;
}
