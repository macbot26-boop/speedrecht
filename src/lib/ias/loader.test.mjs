import test from "node:test";
import assert from "node:assert/strict";

import { LADE_FRIST_MS, ladeFristFehler, mitFrist } from "./loader.ts";

/**
 * Kurze Fristen, damit die Prüfung nicht selbst zur Geduldsprobe wird. Die
 * Rechnung kennt nur Abstände — ob 30 Millisekunden oder 20 Sekunden, ist ihr
 * gleich.
 */
const KURZ_MS = 30;

/** Ein Versprechen, das nie ankommt — der Fall, um den es hier geht. */
function niemals() {
  return new Promise(() => {});
}

/** Ein Versprechen, das nach `ms` mit `wert` ankommt. */
function nach(ms, wert) {
  return new Promise((resolve) => setTimeout(() => resolve(wert), ms));
}

// ---------------------------------------------------------------------------
// Der gute Fall: rechtzeitig da
// ---------------------------------------------------------------------------

test("ein rechtzeitiges Versprechen kommt unverändert durch", async () => {
  const wert = await mitFrist(nach(1, "Messtechnik"), KURZ_MS, () => new Error("zu spät"));
  assert.equal(wert, "Messtechnik");
});

test("die Uhr wird abgeräumt, wenn das Versprechen rechtzeitig ankommt", async () => {
  // Sonst liefe nach jedem Start noch 20 Sekunden lang ein Wecker mit, der
  // niemanden mehr interessiert.
  const echtesClearTimeout = globalThis.clearTimeout;
  let abgeraeumt = 0;
  globalThis.clearTimeout = (handle) => {
    abgeraeumt += 1;
    return echtesClearTimeout(handle);
  };
  try {
    await mitFrist(Promise.resolve("da"), KURZ_MS, () => new Error("zu spät"));
    assert.equal(abgeraeumt, 1);
  } finally {
    globalThis.clearTimeout = echtesClearTimeout;
  }
});

// ---------------------------------------------------------------------------
// Der Fall, für den es die Frist gibt: es kommt gar nichts
// ---------------------------------------------------------------------------

test("ein Versprechen, das nie ankommt, endet mit dem angegebenen Fehler", async () => {
  await assert.rejects(
    () => mitFrist(niemals(), KURZ_MS, () => new Error("Frist abgelaufen")),
    { message: "Frist abgelaufen" }
  );
});

test("die Frist wartet wirklich ab und bricht nicht sofort ab", async () => {
  const vorher = Date.now();
  await assert.rejects(() => mitFrist(niemals(), KURZ_MS, () => new Error("Frist abgelaufen")));
  // Etwas Luft nach unten: Uhren im Testlauf sind nicht auf die Millisekunde
  // genau, zu FRÜH darf die Frist aber nie greifen.
  assert.ok(Date.now() - vorher >= KURZ_MS - 5, "die Frist wurde zu früh gerissen");
});

// ---------------------------------------------------------------------------
// Der Fall, der leicht schiefgeht: ein echter Fehlschlag darf nicht als
// Fristablauf verkleidet werden — sonst schickt die Meldung jemanden auf die
// Suche nach einer langsamen Leitung, obwohl eine Datei schlicht fehlt.
// ---------------------------------------------------------------------------

test("ein echter Fehlschlag wird unverändert durchgereicht", async () => {
  await assert.rejects(
    () =>
      mitFrist(
        Promise.reject(new Error("Messbibliothek nicht ladbar: /ias/ip.js")),
        KURZ_MS,
        () => new Error("Frist abgelaufen")
      ),
    { message: "Messbibliothek nicht ladbar: /ias/ip.js" }
  );
});

test("ein später Fehlschlag innerhalb der Frist wird ebenfalls durchgereicht", async () => {
  const spaeterFehler = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Netz weg")), 1)
  );
  await assert.rejects(() => mitFrist(spaeterFehler, KURZ_MS, () => new Error("Frist abgelaufen")), {
    message: "Netz weg",
  });
});

// ---------------------------------------------------------------------------
// Die Meldung an den Nutzer
// ---------------------------------------------------------------------------

test("die Frist ist großzügig genug für die rund 100 KB Messbibliothek", () => {
  // 100 KB in 20 s sind 5 KB/s. Wer darunter liegt, lädt nicht langsam,
  // sondern gar nicht — und misst ohnehin nichts Sinnvolles mehr.
  assert.ok(LADE_FRIST_MS >= 10_000, "unter 10 Sekunden wäre die Frist zu scharf");
  assert.ok(LADE_FRIST_MS <= 60_000, "über einer Minute wartet niemand mehr");
});

test("die Fehlermeldung nennt dieselbe Zahl, die als Frist gilt", () => {
  // Sonst stünde nach der ersten Änderung der Frist eine falsche Zahl auf dem
  // Schirm — und die Meldung wäre genau da unehrlich, wo sie es nicht sein darf.
  const sekunden = Math.round(LADE_FRIST_MS / 1000);
  assert.match(ladeFristFehler().message, new RegExp(`${sekunden} Sekunden`));
});

test("die Fehlermeldung sagt, was zu tun ist", () => {
  const text = ladeFristFehler().message;
  assert.match(text, /Messtechnik/);
  assert.match(text, /noch einmal/);
});
