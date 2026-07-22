// Gemeinsame Helfer für das Zugangs-Gate (genutzt von proxy.ts und
// /api/zugang). Cookie enthält nur einen SHA-256-Hash, nie den Klartext-Code.

export const GATE_COOKIE = "sr_zugang";

export async function gateCookieValue(code: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`speedrecht-gate:${code}`)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
