// Was in einer Klick-Zeile landet — und die Regel, nach der geprüft wird.
//
// Der Grundsatz dieser Datei unterscheidet sich bewusst von dem der
// Schreib-Routen: Dort wird eine fehlerhafte Anfrage ABGEWIESEN. Hier nicht.
// Ein Klick auf das Wechsel-Angebot ist ein Nutzer auf dem Weg zum Partner —
// und der Weg muss durchgehen, auch wenn ein Nebenwert unbrauchbar ist.
// Unbrauchbares wird deshalb zu `null` und die Zeile trotzdem geschrieben.
//
// Anders herum ausgedrückt: Lieber eine Klick-Zeile mit einer Lücke als ein
// verlorener Nutzer und gar keine Zeile.

import { BESTAETIGBARE_ANBIETER } from "../netz/anbieter.ts";
import type { UrteilTon } from "../tarife/urteil.ts";

/** Der Zusammenhang, aus dem ein Klick kam — alles anonym. */
export interface KlickAngaben {
  anbieter: string | null;
  tarifSlug: string | null;
  urteil: UrteilTon | null;
  downloadMbps: number | null;
  messungId: string | null;
}

/** Die Route, die zählt und weiterleitet. */
export const KLICK_PFAD = "/api/wechsel/weiter";

const URTEILE: ReadonlySet<string> = new Set<UrteilTon>(["gut", "unter_norm", "unter_min"]);

/**
 * Slugs stammen aus unserem eigenen Sammel-Skript und bestehen aus
 * Kleinbuchstaben, Ziffern und Bindestrichen (längster gemessener Slug:
 * 72 Zeichen). Alles andere kommt nicht von uns.
 */
const SLUG_MUSTER = /^[a-z0-9-]{1,160}$/;

const UUID_MUSTER =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Liest die Angaben aus der Adresse des Klicks.
 *
 * Der Anbieter wird gegen die kanonische Liste geprüft — sonst stünde in der
 * Auswertung irgendwann "Telekom", "telekom" und "Deutsche Telekom"
 * nebeneinander, und die Trichter-Rechnung wäre wertlos.
 */
export function klickAngabenLesen(params: URLSearchParams): KlickAngaben {
  const anbieterRoh = params.get("anbieter");
  const slugRoh = params.get("tarif");
  const urteilRoh = params.get("urteil");
  // Bewusst NICHT `Number(params.get("mbps"))`: Number(null) und Number("")
  // sind beide 0. In der Auswertung stünde dann eine gemessene Null, wo in
  // Wahrheit gar nichts angegeben war — und eine Null bedeutet hier "die
  // Leitung liefert nichts".
  const mbpsText = params.get("mbps");
  const mbpsRoh = mbpsText === null || mbpsText.trim() === "" ? Number.NaN : Number(mbpsText);
  const messungRoh = params.get("messung");

  return {
    anbieter:
      anbieterRoh && BESTAETIGBARE_ANBIETER.has(anbieterRoh) ? anbieterRoh : null,
    tarifSlug: slugRoh && SLUG_MUSTER.test(slugRoh) ? slugRoh : null,
    urteil: urteilRoh && URTEILE.has(urteilRoh) ? (urteilRoh as UrteilTon) : null,
    downloadMbps:
      Number.isFinite(mbpsRoh) && mbpsRoh >= 0 && mbpsRoh <= 100_000
        ? Math.round(mbpsRoh * 100) / 100
        : null,
    messungId: messungRoh && UUID_MUSTER.test(messungRoh) ? messungRoh : null,
  };
}

/**
 * Baut die Adresse des Klick-Verweises — die Gegenrichtung zu
 * `klickAngabenLesen`.
 *
 * Beide Seiten stehen bewusst in DERSELBEN Datei: Wer den Parameter `tarif`
 * hier in `tarif_slug` umbenennt, sieht die lesende Seite direkt daneben. Ein
 * Test schickt jede Angabe einmal hin und zurück — liefen die Namen
 * auseinander, käme beim Zählen still eine leere Zeile an, während der Nutzer
 * ganz normal beim Partner landet.
 *
 * Leere Angaben werden weggelassen statt leer gesetzt: Ein `mbps=` ohne Wert
 * ist keine Angabe, sondern Rauschen in der Adresse.
 */
export function klickPfad(angaben: KlickAngaben): string {
  const params = new URLSearchParams();
  if (angaben.anbieter) params.set("anbieter", angaben.anbieter);
  if (angaben.tarifSlug) params.set("tarif", angaben.tarifSlug);
  if (angaben.urteil) params.set("urteil", angaben.urteil);
  if (angaben.downloadMbps !== null) params.set("mbps", String(angaben.downloadMbps));
  if (angaben.messungId) params.set("messung", angaben.messungId);
  const query = params.toString();
  return query ? `${KLICK_PFAD}?${query}` : KLICK_PFAD;
}
