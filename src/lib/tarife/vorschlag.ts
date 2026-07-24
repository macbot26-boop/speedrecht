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
}

/**
 * Schlägt bis zu `maxAnzahl` Geschwindigkeits-Klassen des Anbieters vor,
 * sortiert nach Nähe zur gemessenen Download-Geschwindigkeit.
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

  // Klassen bilden: ein Eintrag pro Maximal-Download.
  const klassen = new Map<number, Tarif[]>();
  for (const tarif of passende) {
    const liste = klassen.get(tarif.download_max_mbps) ?? [];
    liste.push(tarif);
    klassen.set(tarif.download_max_mbps, liste);
  }

  // Abstand auf Log-Skala (16 vs. 25 ist "näher" als 1000 vs. 2000 linear);
  // Klassen UNTER dem Messwert bekommen einen Malus — der eigene Vertrag
  // liegt praktisch nie unter dem, was man tatsächlich misst.
  const bewertet = [...klassen.entries()].map(([maxMbps, tarife]) => {
    let abstand = Math.abs(Math.log(maxMbps / gemessenMbps));
    if (maxMbps < gemessenMbps) abstand *= 2.5;
    return { maxMbps, tarife, abstand };
  });

  bewertet.sort((a, b) => a.abstand - b.abstand || a.maxMbps - b.maxMbps);

  return bewertet.slice(0, maxAnzahl).map(({ tarife }) => {
    const repraesentant = [...tarife].sort(
      (a, b) => a.tarifname.length - b.tarifname.length || a.slug.localeCompare(b.slug)
    )[0];
    return { tarif: repraesentant, varianten: tarife.length };
  });
}
