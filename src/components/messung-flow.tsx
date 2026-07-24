"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  PEER_HOST,
  useIasMeasurement,
} from "@/lib/ias/use-ias-measurement";
import type { ConnectionType, IasCompletedKpis } from "@/lib/ias/types";
import { ANBIETER_SONSTIGE, FESTNETZ_ANBIETER } from "@/lib/netz/anbieter";
import tarifDaten from "@/lib/tarife/tarife.generated.json";
import { formatMbps } from "@/lib/tarife/anzeige.ts";
import {
  tarifKlassen,
  tarifVorschlaege,
  type Tarif,
  type TarifDaten,
} from "@/lib/tarife/vorschlag";
import { tarifUrteil, type UrteilTon } from "@/lib/tarife/urteil";

// Statische Tarif-Tabelle (aus den Produktinformationsblättern erzeugt).
// Der JSON-Import ist strukturell die TarifDaten-Form.
const TARIFE = tarifDaten as TarifDaten;

// Die Verbindungsart wird NICHT vorab abgefragt (Founder-Feedback: kein
// Quiz vor der Messung). Stattdessen: zwei optionale Chips während der
// ~30 Sekunden Messzeit; ohne Antwort gilt ehrlich "unknown".
const VERBINDUNGS_CHIPS: { value: ConnectionType; title: string }[] = [
  { value: "wifi", title: "WLAN" },
  { value: "lan", title: "LAN-Kabel" },
];

// Ohne konfigurierten öffentlichen Messserver (Produktion vor dem
// Server-Anschluss) wäre jede Messung zum Scheitern verurteilt — dann
// lieber ehrlich sagen, was Phase ist, statt einen Fehler zu zeigen.
const OHNE_PEER =
  process.env.NODE_ENV === "production" &&
  (PEER_HOST === "localhost" || PEER_HOST.endsWith(".localhost"));

const PHASE_LABELS: Record<string, string> = {
  loading: "Messtechnik wird geladen …",
  ip: "Verbindung zum Messserver …",
  rtt: "Laufzeit wird gemessen (Ping) …",
  download: "Download läuft — 4 parallele Datenströme",
  upload: "Upload läuft — 4 parallele Datenströme",
};

type SaveState = "idle" | "saving" | "saved" | "failed";

/** Antwort von GET /api/netz — in welchem Netz sind wir gerade? */
interface NetzInfo {
  anbieter: string | null;
  kategorie: "festnetz" | "mobilfunk" | "hosting_vpn" | "unbekannt";
}

// Zusatzsignal mancher Browser (v. a. Android): sind wir im Mobilfunknetz?
// Über useSyncExternalStore eingebunden: hydrationssicher (Server sagt
// immer "nein") und reagiert live auf Netzwechsel.
interface BrowserVerbindung {
  type?: string;
  addEventListener?: (typ: "change", cb: () => void) => void;
  removeEventListener?: (typ: "change", cb: () => void) => void;
}

function browserVerbindung(): BrowserVerbindung | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as { connection?: BrowserVerbindung }).connection;
}

function zellularAbo(callback: () => void): () => void {
  const verbindung = browserVerbindung();
  verbindung?.addEventListener?.("change", callback);
  return () => verbindung?.removeEventListener?.("change", callback);
}

function zellularErkannt(): boolean {
  return browserVerbindung()?.type === "cellular";
}

// Anzeige-Genauigkeit kommt aus @/lib/tarife/anzeige — dieselbe Quelle, auf
// der Urteil und Tarif-Bündelung rechnen.

export function MessungFlow() {
  const { phase, rttMs, downloadMbps, uploadMbps, result, error, start } =
    useIasMeasurement();
  const [connection, setConnection] = useState<ConnectionType | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [netz, setNetz] = useState<NetzInfo | null>(null);
  const zellular = useSyncExternalStore(zellularAbo, zellularErkannt, () => false);
  const savedForResult = useRef<IasCompletedKpis | null>(null);

  // Einmal beim Öffnen: In welchem Netz sind wir? (Für Warnhinweise vor der
  // Messung und den Anbieter-Vorschlag nach dem Ergebnis.)
  useEffect(() => {
    let aktiv = true;
    // ?test_ip=… wird nur in der lokalen Entwicklung vom Server beachtet —
    // damit lassen sich alle Anbieter-Fälle ohne echte Anschlüsse durchspielen.
    const testIp = new URLSearchParams(window.location.search).get("test_ip");
    fetch(`/api/netz${testIp ? `?test_ip=${encodeURIComponent(testIp)}` : ""}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((info: NetzInfo | null) => {
        if (aktiv && info) setNetz(info);
      })
      .catch(() => {});
    return () => {
      aktiv = false;
    };
  }, []);

  const mobilfunk = netz?.kategorie === "mobilfunk" || zellular;
  const vpnOderHosting = netz?.kategorie === "hosting_vpn";
  const erkanntFestnetz = netz?.kategorie === "festnetz" ? netz.anbieter : null;

  const begin = useCallback(() => {
    setSaveState("idle");
    setSavedId(null);
    // Verspätete Speicher-Antworten der VORHERIGEN Messung dürfen ab jetzt
    // nichts mehr setzen (sonst hinge die Anbieter-Bestätigung an der
    // falschen Messung).
    savedForResult.current = null;
    void start();
  }, [start]);

  // Ein-Tap-Start: Der „Jetzt messen“-Knopf der Startseite verlinkt auf
  // /messung?start=1 — dann geht es hier ohne weiteren Klick los. Der
  // Parameter wird sofort entfernt, damit ein Neuladen nicht ungefragt
  // erneut misst (eine Messung überträgt viele Megabyte).
  const autoGestartet = useRef(false);
  useEffect(() => {
    if (autoGestartet.current || OHNE_PEER) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("start") !== "1") return;
    autoGestartet.current = true;
    params.delete("start");
    const rest = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (rest ? `?${rest}` : "")
    );
    // Kein kaskadierendes Re-Rendern: Das hier ist die nachgeholte Reaktion
    // auf den einen Nutzer-Tap von der Startseite (?start=1) — einmalig per
    // Ref abgesichert, danach ist der Parameter entfernt.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    begin();
  }, [begin]);

  // Ergebnis anonym speichern, genau einmal pro abgeschlossener Messung.
  useEffect(() => {
    if (phase !== "done" || !result || savedForResult.current === result) return;
    savedForResult.current = result;
    setSaveState("saving");
    fetch("/api/messungen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connection_declared: connection ?? "unknown",
        download_mbps: result.download_rate_avg_mbps,
        upload_mbps: result.upload_rate_avg_mbps,
        rtt_avg_ms: result.rtt_avg,
        rtt_med_ms: result.rtt_med,
        download_bytes: result.download_data,
        upload_bytes: result.upload_data,
        download_duration_ms: result.download_duration,
        upload_duration_ms: result.upload_duration,
        ip_version: result.ip_version,
        client_os: result.client_os,
        client_os_version: result.client_os_version,
        client_browser: result.client_browser,
        client_browser_version: result.client_browser_version,
        ias_version: result.client_ias_version,
        peer: PEER_HOST,
      }),
    })
      .then(async (res) => {
        if (savedForResult.current !== result) return; // veraltete Antwort
        if (!res.ok) {
          setSaveState("failed");
          return;
        }
        // Die Antwort enthält die anonyme Messungs-Nummer — sie brauchen
        // wir gleich für die Ein-Tap-Anbieterbestätigung.
        const data: unknown = await res.json().catch(() => null);
        const id =
          data && typeof data === "object" && "id" in data && typeof data.id === "string"
            ? data.id
            : null;
        setSavedId(id);
        setSaveState("saved");
      })
      .catch(() => {
        if (savedForResult.current !== result) return; // veraltete Antwort
        setSaveState("failed");
      });
  }, [phase, result, connection]);

  // ---- Testphase ohne öffentlichen Messserver: ehrlich sagen, statt in
  // einen sicheren Fehler laufen zu lassen. ----
  if (OHNE_PEER) {
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Der Messserver ist noch nicht angeschlossen
        </h1>
        <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Du bist ganz früh dabei: In dieser privaten Testphase steht der
          öffentliche Messserver noch nicht bereit — Messungen sind deshalb
          hier noch nicht möglich. Sobald er angeschlossen ist, geht es an
          dieser Stelle mit einem Tap los.
        </p>
        <p className="max-w-md text-xs leading-5 text-zinc-500">
          Gemessen wird dann mit der offiziellen Open-Source-Messmethodik der
          Breitbandmessung gegen unseren eigenen Server — Ergebnisse sind ein
          Indiz, rechtsgültige Nachweise erzeugt nur die offizielle
          Desktop-App.
        </p>
      </div>
    );
  }

  // ---- Schritt 1: ein Tap, sonst nichts ----
  if (phase === "idle") {
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Bereit? Ein Tap genügt.
          </h1>
          <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
            Die Messung dauert etwa eine halbe Minute und überträgt dabei
            einige Megabyte — am besten nicht im Datentarif.
          </p>
        </div>
        {vpnOderHosting && (
          <Warnkarte titel="VPN oder Firmennetz erkannt.">
            Deine Verbindung läuft gerade über ein Rechenzentrum (z. B. VPN,
            iCloud Privat-Relay oder Firmennetz). So misst du das VPN — nicht
            deinen Anschluss. Am besten kurz ausschalten und neu laden; messen
            kannst du trotzdem.
          </Warnkarte>
        )}
        {mobilfunk && (
          <Warnkarte titel="Mobilfunk erkannt.">
            Du bist gerade über das Handynetz unterwegs (z. B. Hotspot). Über
            Mobilfunk sagt die Messung nichts über deinen Festnetzanschluss
            aus. Für den Anschluss-Check: zu Hause ins WLAN oder ans Kabel.
          </Warnkarte>
        )}
        <button
          onClick={begin}
          className="rounded-full bg-[#0b57d0] px-10 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          Messung starten
        </button>
        <p className="max-w-md text-xs leading-5 text-zinc-500">
          Gemessen wird mit der offiziellen Open-Source-Messmethodik der
          Breitbandmessung (4 parallele Datenströme, 10-Sekunden-Fenster) gegen
          unseren eigenen Messserver. Ergebnisse sind ein Indiz — rechtsgültige
          Nachweise erzeugt nur die offizielle Desktop-App.
        </p>
      </div>
    );
  }

  // ---- Fehler ----
  if (phase === "error") {
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Die Messung hat nicht geklappt
        </h1>
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error?.message}
        </p>
        <button
          onClick={begin}
          className="rounded-full bg-[#0b57d0] px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Nochmal versuchen
        </button>
      </div>
    );
  }

  // ---- Schritt 3: Ergebnis ----
  if (phase === "done" && result) {
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Dein Ergebnis
        </h1>

        <div className="grid w-full grid-cols-3 gap-3">
          <ResultCard
            label="Download"
            value={formatMbps(
              typeof result.download_rate_avg_mbps === "number"
                ? result.download_rate_avg_mbps
                : null
            )}
            unit="Mbit/s"
          />
          <ResultCard
            label="Upload"
            value={formatMbps(
              typeof result.upload_rate_avg_mbps === "number"
                ? result.upload_rate_avg_mbps
                : null
            )}
            unit="Mbit/s"
          />
          <ResultCard
            label="Ping"
            value={
              typeof result.rtt_med === "number"
                ? result.rtt_med.toFixed(0)
                : "–"
            }
            unit="ms"
          />
        </div>

        {/* Vertrag vs. Realität: benannter Tarif + Klartext-Urteil */}
        <TarifClaim
          anbieter={erkanntFestnetz}
          gemessenMbps={
            typeof result.download_rate_avg_mbps === "number"
              ? result.download_rate_avg_mbps
              : null
          }
        />

        {/* Ehrlichkeits-Labels — Produktgesetz, nicht verhandelbar */}
        <div className="flex w-full flex-col gap-2 text-left">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <span className="font-semibold">Indiz, kein Rechtsbeweis.</span>{" "}
            Gemessen mit der offiziellen Messmethodik, aber gegen unseren
            eigenen Server. Vor Gericht zählt nur die offizielle{" "}
            <a
              href="https://breitbandmessung.de"
              className="underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
            >
              Breitbandmessung
            </a>{" "}
            der Bundesnetzagentur.
          </div>
          {connection === "wifi" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <span className="font-semibold">Über WLAN gemessen.</span> Dieser
              Wert enthält dein Heim-WLAN — es kann dein Internet ausbremsen,
              ohne dass dein Anbieter etwas dafür kann. Für einen belastbaren
              Wert: einmal per LAN-Kabel messen.
            </div>
          )}
          {(connection === "unknown" || connection === null) && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              Verbindungsart unbekannt — falls du über WLAN gemessen hast, kann
              dein Heim-WLAN das Ergebnis beeinflussen.
            </div>
          )}
          {connection === "lan" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              <span className="font-semibold">Per Kabel gemessen</span> — die
              aussagekräftigste Art, im Browser zu messen.
            </div>
          )}
          {vpnOderHosting && (
            <Warnkarte titel="Über VPN/Firmennetz gemessen.">
              Das Ergebnis kann durch den Umweg verfälscht sein — für einen
              Anschluss-Check bitte ohne VPN messen.
            </Warnkarte>
          )}
          {mobilfunk && (
            <Warnkarte titel="Über Mobilfunk gemessen.">
              Dieses Ergebnis beschreibt das Handynetz, nicht deinen
              Festnetzanschluss.
            </Warnkarte>
          )}
        </div>

        <AnbieterBestaetigung erkannt={erkanntFestnetz} messungId={savedId} />

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={begin}
            className="rounded-full bg-[#0b57d0] px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Nochmal messen
          </button>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            {saveState === "saved" &&
              "Ergebnis anonym gespeichert (ohne IP-Adresse)."}
            {saveState === "saving" && "Ergebnis wird gespeichert …"}
            {saveState === "failed" &&
              "Ergebnis konnte nicht gespeichert werden — deine Messung oben bleibt davon unberührt."}
          </p>
        </div>
      </div>
    );
  }

  // ---- Schritt 2: Messung läuft ----
  const liveValue =
    phase === "upload"
      ? uploadMbps
      : phase === "download"
        ? downloadMbps
        : null;

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Messung läuft …
      </h1>

      <div className="flex flex-col items-center gap-1">
        <p className="font-mono text-6xl font-semibold tabular-nums text-[#0b57d0] dark:text-blue-400">
          {phase === "rtt"
            ? (rttMs !== null ? rttMs.toFixed(0) : "–")
            : formatMbps(liveValue)}
        </p>
        <p className="text-sm text-zinc-500">
          {phase === "rtt" ? "ms" : "Mbit/s"}
        </p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <p
          className="text-sm font-medium text-zinc-600 dark:text-zinc-300"
          aria-live="polite"
        >
          {PHASE_LABELS[phase] ?? "…"}
        </p>
        <div className="flex gap-2" aria-hidden>
          {(["ip", "rtt", "download", "upload"] as const).map((p) => (
            <span
              key={p}
              className={`h-1.5 w-10 rounded-full transition ${
                phase === p
                  ? "animate-pulse bg-[#0b57d0] dark:bg-blue-400"
                  : "bg-zinc-200 dark:bg-zinc-800"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Optionale Selbstauskunft — genau in der Wartezeit, wo sie nicht stört */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Nebenbei: Wie ist dieses Gerät mit dem Router verbunden?
        </p>
        <div className="flex gap-2">
          {VERBINDUNGS_CHIPS.map((chip) => (
            <button
              key={chip.value}
              onClick={() => setConnection(chip.value)}
              aria-pressed={connection === chip.value}
              className={
                connection === chip.value
                  ? "rounded-full bg-[#0b57d0] px-5 py-2 text-sm font-semibold text-white"
                  : "rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 transition hover:border-[#0b57d0] hover:text-[#0b57d0] dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-blue-400 dark:hover:text-blue-400"
              }
            >
              {chip.title}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Keine Angabe? Kein Problem — der Hinweis kommt mit dem Ergebnis.
        </p>
      </div>

      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Bitte lass diese Seite offen — die Messung dauert etwa 30 Sekunden.
      </p>
    </div>
  );
}

function Warnkarte({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm leading-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <span className="font-semibold">{titel}</span> {children}
    </div>
  );
}

// „Dein Netz: Vodafone — stimmt das?“ — Ein-Tap-Bestätigung des Anbieters.
// Erscheint nur, wenn das Ergebnis gespeichert wurde (sonst gibt es nichts,
// woran die Bestätigung hängen könnte).
function AnbieterBestaetigung({
  erkannt,
  messungId,
}: {
  erkannt: string | null;
  messungId: string | null;
}) {
  const [status, setStatus] = useState<
    "offen" | "liste" | "sendet" | "fertig" | "fehler"
  >("offen");
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);

  if (!messungId) return null;

  const bestaetigen = (anbieter: string) => {
    setGewaehlt(anbieter);
    setStatus("sendet");
    fetch("/api/messungen/bestaetigen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: messungId, anbieter }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { ok?: boolean } | null) =>
        setStatus(data?.ok ? "fertig" : "fehler")
      )
      .catch(() => setStatus("fehler"));
  };

  if (status === "fertig") {
    return (
      <p className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm leading-6 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        ✓ Danke — <span className="font-semibold">{gewaehlt}</span> als dein
        Anbieter vermerkt (weiterhin anonym).
      </p>
    );
  }
  if (status === "fehler") {
    return (
      <p className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        Dein Anbieter konnte gerade nicht vermerkt werden — für deine Messung
        oben ändert das nichts.
      </p>
    );
  }

  const listeZeigen = status === "liste" || !erkannt;

  return (
    <div className="w-full rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-left dark:border-zinc-800 dark:bg-zinc-950">
      {listeZeigen ? (
        <>
          <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
            <span className="font-semibold">Wer ist dein Internetanbieter?</span>{" "}
            Ein Tap genügt — das hilft, Messungen je Anbieter einzuordnen
            (weiterhin anonym).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[...FESTNETZ_ANBIETER, ANBIETER_SONSTIGE].map((anbieter) => (
              <button
                key={anbieter}
                disabled={status === "sendet"}
                onClick={() => bestaetigen(anbieter)}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-[#0b57d0] hover:text-[#0b57d0] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-blue-400 dark:hover:text-blue-400"
              >
                {anbieter}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
            <span className="font-semibold">Dein Netz: {erkannt}.</span> Ist das
            dein Internetanbieter?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={status === "sendet"}
              onClick={() => erkannt && bestaetigen(erkannt)}
              className="rounded-full bg-[#0b57d0] px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              Ja, mein Anbieter
            </button>
            <button
              disabled={status === "sendet"}
              onClick={() => setStatus("liste")}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-[#0b57d0] hover:text-[#0b57d0] disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-blue-400 dark:hover:text-blue-400"
            >
              Nein, anderer …
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function preisFormat(eur: number): string {
  return eur.toFixed(2).replace(".", ",");
}

// Balken: gemessene Rate als Füllung, Marken für Minimum + normalerweise,
// rechtes Ende = beworbene "bis-zu"-Rate. Farbe folgt dem Urteil.
function TarifDeltaBalken({
  tarif,
  gemessenMbps,
  ton,
}: {
  tarif: Tarif;
  gemessenMbps: number;
  ton: UrteilTon;
}) {
  const max = tarif.download_max_mbps;
  // Ohne sinnvolle Obergrenze kein Balken (schützt vor Division durch 0).
  if (!(max > 0)) return null;
  const anteil = (wert: number) => Math.max(0, Math.min(100, (wert / max) * 100));
  const breite = anteil(gemessenMbps);
  const fuellFarbe =
    ton === "gut"
      ? "bg-emerald-500"
      : ton === "unter_min"
        ? "bg-red-500"
        : "bg-amber-500";
  const marken = [
    tarif.download_min_mbps != null
      ? {
          pos: anteil(tarif.download_min_mbps),
          label: `Minimum ${formatMbps(tarif.download_min_mbps)}`,
        }
      : null,
    tarif.download_normal_mbps != null
      ? {
          pos: anteil(tarif.download_normal_mbps),
          label: `Normalerweise ${formatMbps(tarif.download_normal_mbps)}`,
        }
      : null,
  ].filter((m): m is { pos: number; label: string } => m !== null);

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex justify-between text-xs font-medium text-zinc-500">
        <span>Du bekommst</span>
        <span>Bestellt: bis zu {formatMbps(max)} Mbit/s</span>
      </div>
      <div className="relative h-10 rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
        <div
          className={`absolute inset-y-0 left-0 flex min-w-[46px] items-center justify-end rounded-lg pr-2.5 text-sm font-bold tabular-nums text-white ${fuellFarbe}`}
          style={{ width: `${breite}%` }}
        >
          {formatMbps(gemessenMbps)}
        </div>
        {marken.map((m) => (
          <div
            key={m.label}
            className="absolute -bottom-0.5 -top-0.5 w-0.5 rounded bg-zinc-500/60"
            style={{ left: `${m.pos}%` }}
            aria-hidden
          />
        ))}
      </div>
      {marken.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-medium text-zinc-400">
          {marken.map((m) => (
            <span key={m.label} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-0.5 rounded bg-zinc-400/70" aria-hidden />
              {m.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Vertrag vs. Realität: erkannter Anbieter → Ein-Tap-Tarifwahl →
// benannter Tarif mit Klartext-Urteil. Rein anzeigend (keine Speicherung).
function TarifClaim({
  anbieter,
  gemessenMbps,
}: {
  anbieter: string | null;
  gemessenMbps: number | null;
}) {
  const [gewaehlt, setGewaehlt] = useState<Tarif | null>(null);
  const [alleZeigen, setAlleZeigen] = useState(false);

  if (!anbieter || gemessenMbps == null || gemessenMbps <= 0) return null;

  const vorschlaege = tarifVorschlaege(TARIFE, anbieter, gemessenMbps);

  // Anbieter erkannt, aber (noch) keine Tarife hinterlegt (Anbieter, deren
  // Tabelle noch nicht eingepflegt ist) — ehrlich sagen statt leerer Auswahl.
  if (vorschlaege.length === 0) {
    return (
      <div className="w-full rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-left text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        Für{" "}
        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{anbieter}</span> haben wir
        die Tarife noch nicht hinterlegt — der direkte Vergleich mit deinem Vertrag kommt bald.
      </div>
    );
  }

  // --- Tarif noch nicht gewählt: Ein-Tap-Auswahl ---
  if (!gewaehlt) {
    const optionen = alleZeigen ? tarifKlassen(TARIFE, anbieter) : vorschlaege;
    return (
      <div className="w-full rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-left dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">
          <span className="font-semibold">Dein Netz: {anbieter}.</span> Welcher Tarif ist deiner? Ein
          Tap zeigt dir, ob du bekommst, wofür du zahlst.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {optionen.map((v) => (
            <button
              key={v.tarif.slug}
              onClick={() => setGewaehlt(v.tarif)}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-[#0b57d0] hover:text-[#0b57d0] dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-blue-400 dark:hover:text-blue-400"
            >
              {v.tarif.tarifname}
              <span className="ml-1 text-zinc-400">
                · bis zu {formatMbps(v.tarif.download_max_mbps)}
                {/* Nur wo zwei Knöpfe sonst gleich aussähen: die Werte, die
                    sie wirklich unterscheiden. */}
                {v.unterscheidung?.normalMbps != null &&
                  `, normal ${formatMbps(v.unterscheidung.normalMbps)}`}
                {v.unterscheidung?.minMbps != null &&
                  `, min ${formatMbps(v.unterscheidung.minMbps)}`}
              </span>
            </button>
          ))}
          {!alleZeigen && (
            <button
              onClick={() => setAlleZeigen(true)}
              className="rounded-full px-4 py-2 text-sm font-medium text-[#0b57d0] underline underline-offset-2 dark:text-blue-400"
            >
              Meiner ist nicht dabei …
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- Tarif gewählt: benannter Vertrag + Delta-Balken + Klartext-Urteil ---
  const ton = tarifUrteil(gewaehlt, gemessenMbps);
  const urteilStil =
    ton === "gut"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
      : ton === "unter_min"
        ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200";

  const claim =
    ton === "gut" ? (
      <>
        <span className="font-bold">Passt zu deinem Tarif.</span> {gewaehlt.tarifname} liefert, was es
        verspricht.
      </>
    ) : ton === "unter_min" ? (
      <>
        <span className="font-bold">Das passt nicht zu deinem Tarif.</span> Bei {gewaehlt.tarifname}{" "}
        sind mindestens {formatMbps(gewaehlt.download_min_mbps)} Mbit/s zugesichert — gemessen:{" "}
        {formatMbps(gemessenMbps)}.
      </>
    ) : (
      <>
        <span className="font-bold">Das passt nicht zu dem, was du bestellt hast.</span> Bei{" "}
        {gewaehlt.tarifname} sollten normalerweise {formatMbps(gewaehlt.download_normal_mbps)} Mbit/s
        anliegen — bei dir kommen {formatMbps(gemessenMbps)} an.
      </>
    );

  return (
    <div className="flex w-full flex-col gap-4 rounded-2xl border border-zinc-200 bg-white px-5 py-5 text-left dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-0.5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
          Dein bestellter Tarif
        </div>
        <div className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
          {gewaehlt.tarifname} <span className="font-normal text-zinc-400">· {anbieter}</span>
        </div>
        <div className="text-xs text-zinc-500">
          bis zu {formatMbps(gewaehlt.download_max_mbps)} Mbit/s
          {gewaehlt.monatspreis_eur != null &&
            ` · ${preisFormat(gewaehlt.monatspreis_eur)} €/Monat`}
          <button
            onClick={() => {
              setGewaehlt(null);
              setAlleZeigen(false);
            }}
            className="ml-2 text-[#0b57d0] underline underline-offset-2 dark:text-blue-400"
          >
            ändern
          </button>
        </div>
      </div>

      <TarifDeltaBalken tarif={gewaehlt} gemessenMbps={gemessenMbps} ton={ton} />

      <div className={`rounded-xl border px-4 py-3 text-sm leading-6 ${urteilStil}`}>{claim}</div>
    </div>
  );
}

function ResultCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-zinc-200 bg-white px-2 py-5 dark:border-zinc-800 dark:bg-zinc-950">
      <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className="font-mono text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value}
      </span>
      <span className="text-xs text-zinc-400">{unit}</span>
    </div>
  );
}
