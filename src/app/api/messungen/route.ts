// POST /api/messungen — nimmt EIN Messergebnis entgegen und speichert es
// anonym in Supabase (EU).
//
// Datenschutz: Die IP-Adresse wird NIE gespeichert. Sie wird hier nur
// flüchtig im Arbeitsspeicher für eine einfache Ratenbegrenzung verwendet
// und taucht weder in der Datenbank noch in Logs auf.
//
// Sicherheitsmodell: Der Client ist nicht vertrauenswürdig. Alles wird
// validiert, unbekannte Felder werden verworfen, Wertebereiche erzwungen.
// Der Schreibweg in die DB ist eine RPC-Funktion, die ein Server-Token
// verlangt (MEASUREMENT_INGEST_TOKEN) — direkter Tabellenzugriff ist aus.

const MAX_BODY_BYTES = 4096;
const RATE_LIMIT_PER_MINUTE = 12;

const CONNECTION_TYPES = new Set(["wifi", "lan", "unknown"]);
const IP_VERSIONS = new Set(["v4", "v6"]);

// Ratenbegrenzung pro Instanz (Fluid Compute hält Instanzen warm; für die
// Testphase ausreichend — kein externer Dienst nötig).
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    if (buckets.size > 10_000) buckets.clear(); // Speicher-Backstop
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_PER_MINUTE;
}

function asNumber(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 100) / 100;
}

function asInteger(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : NaN;
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function asShortText(v: unknown, maxLength: number): string | null {
  if (typeof v !== "string") return null;
  // Steuerzeichen raus, Länge begrenzen
  const cleaned = v.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const ingestToken = process.env.MEASUREMENT_INGEST_TOKEN;
  if (!supabaseUrl || !publishableKey || !ingestToken) {
    return Response.json({ error: "Speicherung nicht konfiguriert" }, { status: 503 });
  }

  // Nur zur Ratenbegrenzung — wird nicht gespeichert oder geloggt.
  const clientKey =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(clientKey)) {
    return Response.json({ error: "Zu viele Anfragen" }, { status: 429 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: "Anfrage zu groß" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("kein Objekt");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Ungültiges JSON" }, { status: 400 });
  }

  const connectionDeclared =
    typeof body.connection_declared === "string" &&
    CONNECTION_TYPES.has(body.connection_declared)
      ? body.connection_declared
      : null;
  const peer = asShortText(body.peer, 253);
  if (!connectionDeclared || !peer) {
    return Response.json({ error: "Pflichtfelder fehlen" }, { status: 400 });
  }

  const payload = {
    connection_declared: connectionDeclared,
    download_mbps: asNumber(body.download_mbps, 0, 100_000),
    upload_mbps: asNumber(body.upload_mbps, 0, 100_000),
    rtt_avg_ms: asNumber(body.rtt_avg_ms, 0, 60_000),
    rtt_med_ms: asNumber(body.rtt_med_ms, 0, 60_000),
    download_bytes: asInteger(body.download_bytes, 0, 1_000_000_000_000),
    upload_bytes: asInteger(body.upload_bytes, 0, 1_000_000_000_000),
    download_duration_ms: asInteger(body.download_duration_ms, 0, 600_000),
    upload_duration_ms: asInteger(body.upload_duration_ms, 0, 600_000),
    ip_version:
      typeof body.ip_version === "string" && IP_VERSIONS.has(body.ip_version)
        ? body.ip_version
        : null,
    client_os: asShortText(body.client_os, 64),
    client_os_version: asShortText(body.client_os_version, 64),
    client_browser: asShortText(body.client_browser, 64),
    client_browser_version: asShortText(body.client_browser_version, 64),
    ias_version: asShortText(body.ias_version, 32),
    peer,
  };

  // Ohne mindestens einen Messwert ist es kein Ergebnis.
  if (payload.download_mbps === null && payload.upload_mbps === null) {
    return Response.json({ error: "Keine Messwerte" }, { status: 400 });
  }

  const rpc = await fetch(`${supabaseUrl}/rest/v1/rpc/insert_measurement`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
    },
    body: JSON.stringify({ p: payload, p_token: ingestToken }),
  });

  if (!rpc.ok) {
    // Kein Durchreichen von DB-Details an den Client.
    return Response.json({ error: "Speicherung fehlgeschlagen" }, { status: 502 });
  }

  const id: unknown = await rpc.json();
  return Response.json({ id }, { status: 201 });
}
