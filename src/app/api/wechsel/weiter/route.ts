// GET /api/wechsel/weiter — zählt einen Klick auf das Wechsel-Angebot und
// leitet zum Partner weiter.
//
// Warum eine Weiterleitung und nicht ein direkter Verweis zum Partner:
//
//   1. Die Zeile ist geschrieben, BEVOR der Nutzer weg ist. Der übliche
//      Gegenentwurf — im Browser mitzählen und per sendBeacon nachreichen —
//      verliert Einträge, sobald die Seite schon verlassen wird.
//   2. Der Knopf bleibt ein gewöhnlicher Verweis: kein JavaScript nötig, kein
//      Popup-Blocker, kein Klick, der ins Leere geht.
//   3. Die Partner-Adresse (mit unserer Partnerkennung) bleibt auf dem
//      Server. Sie landet nie im Browser-Bundle.
//
// Was NICHT gespeichert wird: IP-Adresse, Kennungen, Adresse, Name. Die IP
// wird nur flüchtig für die Ratenbegrenzung gelesen.

import { fremdeHerkunft } from "@/lib/herkunft";
import { ipAusRequest } from "@/lib/netz/server";
import { ratenBegrenzer, ratenSchluessel } from "@/lib/rate-limit";
import { klickAngabenLesen } from "@/lib/wechsel/klick";
import { partnerAusUmgebung, wechselUrl } from "@/lib/wechsel/partner";

// Diese Antwort darf NIE zwischengespeichert werden. Läge sie in einem Cache,
// bekäme jeder Nutzer dieselbe Klick-Kennung — alle Abschlüsse würden auf
// einen einzigen Klick verbucht, und die Zählung wäre wertlos. Der Fehler
// wäre dabei vollkommen leise: Die Weiterleitung funktionierte weiterhin.
export const dynamic = "force-dynamic";

const rateLimited = ratenBegrenzer(30);

export async function GET(request: Request) {
  const partner = partnerAusUmgebung();
  if (!partner) {
    // Kein Partner eingerichtet — dann gibt es diesen Weg auch nicht. In der
    // App erscheint der Knopf dann ohnehin nicht.
    return new Response("Nicht eingerichtet", { status: 404 });
  }

  // Der Verweis steht auf unserer eigenen Ergebnisseite. Kommt der Aufruf von
  // woanders, ist es nicht unser Nutzer — und niemand soll unsere Zählung mit
  // fremden Klicks füllen können.
  if (fremdeHerkunft(request)) {
    return new Response("Fremde Herkunft", { status: 403 });
  }
  if (rateLimited(ratenSchluessel(ipAusRequest(request)))) {
    return new Response("Zu viele Anfragen", { status: 429 });
  }

  const angaben = klickAngabenLesen(new URL(request.url).searchParams);
  const klickId = crypto.randomUUID();

  await klickSpeichern(klickId, partner.name, angaben);

  const ziel = wechselUrl(partner, {
    klickId,
    anbieter: angaben.anbieter,
    mbps: angaben.downloadMbps,
  });

  // 302 statt 307/308: Ein dauerhafter Code wäre hier grob falsch — die
  // Adresse enthält eine Kennung, die für genau diesen einen Klick gilt.
  //
  // Der Referrer wird bewusst NICHT unterdrückt. Die Voreinstellung der
  // Browser (strict-origin-when-cross-origin) schickt dem Partner nur
  // unsere Domain, ohne Pfad und Parameter — genau richtig: Partnerprogramme
  // prüfen die verweisende Domain gegen Betrug, unsere Messwerte gehen sie
  // nichts an.
  return new Response(null, {
    status: 302,
    headers: {
      Location: ziel,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

/**
 * Vorabrufe zählen nicht als Klick.
 *
 * Next leitet HEAD sonst still auf GET um — und damit hätte jeder
 * Link-Vorabruf eines Browsers, Sicherheits-Scanners oder Mailprogramms eine
 * Klick-Zeile erzeugt. Die Provision berührt das nicht, aber die Quote:
 * Phantom-Klicks im Nenner ließen den bezahlten Weg schlechter aussehen, als
 * er ist. Ein Mensch, der auf den Knopf tippt, löst immer ein GET aus.
 */
export async function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "GET" } });
}

/**
 * Schreibt die Klick-Zeile — und schweigt, wenn es nicht klappt.
 *
 * Absicht: Die Klick-Kennung steht bereits in der Partner-Adresse, die
 * Provision hängt also nicht an dieser Zeile. Verloren geht nur unsere eigene
 * Gegenrechnung. Ein Nutzer darf daran nicht hängenbleiben — deshalb wird der
 * Fehler weder durchgereicht noch die Weiterleitung abgebrochen.
 */
async function klickSpeichern(
  id: string,
  partner: string,
  angaben: ReturnType<typeof klickAngabenLesen>
): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const ingestToken = process.env.MEASUREMENT_INGEST_TOKEN;
  if (!supabaseUrl || !publishableKey || !ingestToken) return;

  const payload = {
    id,
    partner,
    anbieter: angaben.anbieter,
    tarif_slug: angaben.tarifSlug,
    urteil: angaben.urteil,
    download_mbps: angaben.downloadMbps,
    messung_id: angaben.messungId,
  };

  try {
    await fetch(`${supabaseUrl}/rest/v1/rpc/insert_wechsel_klick`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
      },
      body: JSON.stringify({ p: payload, p_token: ingestToken }),
    });
  } catch {
    // Absichtlich still: siehe oben.
  }
}
