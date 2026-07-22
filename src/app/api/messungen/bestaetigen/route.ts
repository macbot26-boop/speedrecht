// POST /api/messungen/bestaetigen — der Nutzer bestätigt per Tap seinen
// Anbieter ("Ja, mein Anbieter" bzw. Auswahl aus der Liste).
//
// Sicherheitsmodell wie beim Speichern: Client ist nicht vertrauenswürdig.
// Nur bekannte Anbieternamen werden akzeptiert, der Schreibweg ist eine
// RPC mit Server-Token, write-once und nur für frische Messungen (die
// Regeln erzwingt die Datenbank-Funktion confirm_provider).

import { BESTAETIGBARE_ANBIETER } from "@/lib/netz/anbieter";
import { jsonPostAblehnung } from "@/lib/herkunft";
import { ipAusRequest } from "@/lib/netz/server";
import { ratenBegrenzer, ratenSchluessel } from "@/lib/rate-limit";

const MAX_BODY_BYTES = 512;
const UUID_MUSTER =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rateLimited = ratenBegrenzer(12);

export async function POST(request: Request) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const ingestToken = process.env.MEASUREMENT_INGEST_TOKEN;
  if (!supabaseUrl || !publishableKey || !ingestToken) {
    return Response.json({ error: "Speicherung nicht konfiguriert" }, { status: 503 });
  }

  const ablehnung = jsonPostAblehnung(request, MAX_BODY_BYTES);
  if (ablehnung) return ablehnung;

  // Nur zur Ratenbegrenzung — wird nicht gespeichert oder geloggt.
  if (rateLimited(ratenSchluessel(ipAusRequest(request)))) {
    return Response.json({ error: "Zu viele Anfragen" }, { status: 429 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: "Anfrage zu groß" }, { status: 413 });
  }

  let id: string | null = null;
  let anbieter: string | null = null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const body = parsed as Record<string, unknown>;
      if (typeof body.id === "string" && UUID_MUSTER.test(body.id)) {
        id = body.id;
      }
      if (
        typeof body.anbieter === "string" &&
        BESTAETIGBARE_ANBIETER.has(body.anbieter)
      ) {
        anbieter = body.anbieter;
      }
    }
  } catch {
    // fällt unten in die 400
  }
  if (!id || !anbieter) {
    return Response.json({ error: "Ungültige Angaben" }, { status: 400 });
  }

  const rpc = await fetch(`${supabaseUrl}/rest/v1/rpc/confirm_provider`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
    },
    body: JSON.stringify({ p_id: id, p_anbieter: anbieter, p_token: ingestToken }),
  });

  if (!rpc.ok) {
    return Response.json({ error: "Bestätigung fehlgeschlagen" }, { status: 502 });
  }

  const uebernommen: unknown = await rpc.json();
  return Response.json({ ok: uebernommen === true });
}
