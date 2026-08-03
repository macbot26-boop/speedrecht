// Zugangs-Gate für die private Testphase.
//
// Solange die Umgebungsvariable ACCESS_CODE gesetzt ist (Vercel: Production
// + Preview), ist die App nur mit Einladungscode nutzbar.
// Lokal ist ACCESS_CODE nicht gesetzt → alles offen.
//
// Welche Pfade das Gate durchlassen, entscheidet `istOeffentlich` in
// src/lib/gate.ts — dort steht auch, warum Impressum und
// Datenschutzerklärung an die Echtheit der Anbieterangaben gekoppelt sind.
// Die Regel liegt in der Bibliothek und nicht hier, weil sie sich dort ohne
// Browser prüfen lässt.
//
// (In Next.js 16 heißt die frühere "Middleware" jetzt "Proxy".)

import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, gateCookieValue, istOeffentlich } from "@/lib/gate";

export async function proxy(request: NextRequest) {
  const code = process.env.ACCESS_CODE;
  if (!code) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (istOeffentlich(pathname)) return NextResponse.next();

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
