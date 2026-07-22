// Zugangs-Gate für die private Testphase.
//
// Solange die Umgebungsvariable ACCESS_CODE gesetzt ist (Vercel: Production
// + Preview), ist die App nur mit Einladungscode nutzbar — es gibt noch
// keine Rechtstexte (Impressum/Datenschutz), also bleibt die Tür zu.
// Lokal ist ACCESS_CODE nicht gesetzt → alles offen.
//
// (In Next.js 16 heißt die frühere "Middleware" jetzt "Proxy".)

import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, gateCookieValue } from "@/lib/gate";

// Diese Pfade bleiben immer erreichbar: die Code-Eingabe selbst und
// harmlose statische PWA-Dateien.
const ALWAYS_PUBLIC = new Set([
  "/zugang",
  "/api/zugang",
  "/icon.svg",
  "/manifest.webmanifest",
  "/sw.js",
  "/favicon.ico",
]);

export async function proxy(request: NextRequest) {
  const code = process.env.ACCESS_CODE;
  if (!code) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (ALWAYS_PUBLIC.has(pathname)) return NextResponse.next();

  const cookie = request.cookies.get(GATE_COOKIE)?.value;
  if (cookie && cookie === (await gateCookieValue(code))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Kein Zugang" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/zugang";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("weiter", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Alles außer Next-internen Assets läuft durchs Gate (inkl. /ias und /api).
  matcher: ["/((?!_next/).*)"],
};
