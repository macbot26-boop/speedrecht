// POST /api/zugang — prüft den Einladungscode und setzt das Gate-Cookie.

import { GATE_COOKIE, gateCookieValue } from "@/lib/gate";

export async function POST(request: Request) {
  const accessCode = process.env.ACCESS_CODE;
  if (!accessCode) {
    // Gate ist aus (lokale Entwicklung) — nichts zu tun.
    return new Response(null, { status: 204 });
  }

  let submitted = "";
  try {
    const body: unknown = await request.json();
    if (typeof body === "object" && body !== null && "code" in body) {
      submitted = String((body as { code: unknown }).code).trim();
    }
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  if (!submitted || submitted !== accessCode) {
    // Kleine Bremse gegen Durchprobieren.
    await new Promise((r) => setTimeout(r, 500));
    return Response.json({ error: "Code stimmt nicht" }, { status: 401 });
  }

  const cookieValue = await gateCookieValue(accessCode);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": `${GATE_COOKIE}=${cookieValue}; Path=/; Max-Age=${60 * 60 * 24 * 180}; HttpOnly; SameSite=Lax${secure}`,
    },
  });
}
