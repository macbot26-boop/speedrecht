// Schutz der Schreib-Endpunkte vor Fremdseiten-Anfragen (CSRF /
// Daten-Vergiftung über die Browser fremder Besucher): Browser senden bei
// POST die Herkunft mit — passt sie nicht zu unserem Host, lehnen wir ab.
//
// Wichtig, BEVOR das Zugangs-Gate zum Launch fällt: ohne diese Prüfung
// könnte jede fremde Webseite ihre Besucher heimlich Fake-Messungen
// schicken lassen — verteilt über Tausende echte Anschlüsse.

export function fremdeHerkunft(request: Request): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "none") {
    return true;
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    const host = request.headers.get("host");
    try {
      if (new URL(origin).host !== host) return true;
    } catch {
      return true;
    }
  } else if (origin === "null") {
    return true; // Sandbox/Datei-Kontext — nicht unsere Seite
  }

  return false;
}

/**
 * Gemeinsame Vorprüfung für JSON-POSTs: Herkunft, Inhaltstyp und Größe
 * (per Header, VOR dem Einlesen des Bodys). Gibt eine Fehler-Response
 * zurück oder null, wenn alles passt.
 */
export function jsonPostAblehnung(
  request: Request,
  maxBytes: number
): Response | null {
  if (fremdeHerkunft(request)) {
    return Response.json({ error: "Fremde Herkunft" }, { status: 403 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Erwarte JSON" }, { status: 415 });
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (!Number.isFinite(contentLength) || contentLength > maxBytes) {
    return Response.json({ error: "Anfrage zu groß" }, { status: 413 });
  }
  return null;
}
