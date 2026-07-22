// GET /api/netz — "In welchem Netz bin ich gerade?"
//
// Antwortet mit dem erkannten Anbieter (z. B. "Vodafone") und der Kategorie
// (festnetz / mobilfunk / hosting_vpn / unbekannt), ermittelt aus der
// Request-IP gegen unsere im Repo versionierte Netz-Tabelle.
//
// Datenschutz: Die IP wird ausschließlich flüchtig für dieses eine
// Nachschlagen benutzt — nicht gespeichert, nicht geloggt. Die Antwort
// enthält die IP nicht.

import { ipAusRequest, netzErkennen, NETZDATEN_STAND } from "@/lib/netz/server";

export async function GET(request: Request) {
  // Nur für lokale Entwicklung: ?test_ip=… erlaubt das Durchspielen aller
  // Anbieter ohne echte Anschlüsse. In Produktion wirkungslos.
  const testIp =
    process.env.NODE_ENV === "development"
      ? new URL(request.url).searchParams.get("test_ip")
      : null;

  const ip = testIp ?? ipAusRequest(request);
  const erkennung = ip
    ? netzErkennen(ip)
    : { anbieter: null, kategorie: "unbekannt" as const, asn: null };

  return Response.json(
    { ...erkennung, stand: NETZDATEN_STAND },
    { headers: { "Cache-Control": "no-store" } }
  );
}
