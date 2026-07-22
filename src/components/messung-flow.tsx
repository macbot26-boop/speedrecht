"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PEER_HOST,
  useIasMeasurement,
} from "@/lib/ias/use-ias-measurement";
import type { ConnectionType, IasCompletedKpis } from "@/lib/ias/types";

const CONNECTION_OPTIONS: {
  value: ConnectionType;
  title: string;
  hint: string;
}[] = [
  {
    value: "wifi",
    title: "WLAN",
    hint: "Ich bin über Funk mit meinem Router verbunden",
  },
  {
    value: "lan",
    title: "LAN-Kabel",
    hint: "Mein Gerät hängt per Kabel am Router",
  },
  {
    value: "unknown",
    title: "Weiß ich nicht",
    hint: "Einfach messen — Hinweis kommt mit dem Ergebnis",
  },
];

const PHASE_LABELS: Record<string, string> = {
  loading: "Messtechnik wird geladen …",
  ip: "Verbindung zum Messserver …",
  rtt: "Laufzeit wird gemessen (Ping) …",
  download: "Download läuft — 4 parallele Datenströme",
  upload: "Upload läuft — 4 parallele Datenströme",
};

type SaveState = "idle" | "saving" | "saved" | "failed";

function formatMbps(value: number | null): string {
  if (value === null) return "–";
  return value >= 100 ? Math.round(value).toString() : value.toFixed(1);
}

export function MessungFlow() {
  const { phase, rttMs, downloadMbps, uploadMbps, result, error, start } =
    useIasMeasurement();
  const [connection, setConnection] = useState<ConnectionType | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const savedForResult = useRef<IasCompletedKpis | null>(null);

  const begin = useCallback(
    (c: ConnectionType) => {
      setConnection(c);
      setSaveState("idle");
      void start();
    },
    [start]
  );

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
      .then((res) => setSaveState(res.ok ? "saved" : "failed"))
      .catch(() => setSaveState("failed"));
  }, [phase, result, connection]);

  // ---- Schritt 1: Selbstauskunft (der eine Tap, der die Messung startet) ----
  if (phase === "idle") {
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Wie ist dieses Gerät gerade mit dem Router verbunden?
          </h1>
          <p className="text-base leading-7 text-zinc-600 dark:text-zinc-400">
            Ein Browser kann das nicht selbst erkennen — deine ehrliche Antwort
            macht dein Ergebnis aussagekräftig. Die Messung startet direkt nach
            dem Tippen und dauert etwa eine halbe Minute.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3">
          {CONNECTION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => begin(opt.value)}
              className="group flex flex-col items-start gap-1 rounded-2xl border border-zinc-200 bg-white px-6 py-4 text-left transition hover:border-[#0b57d0] hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-blue-400"
            >
              <span className="text-lg font-semibold text-zinc-900 group-hover:text-[#0b57d0] dark:text-zinc-50 dark:group-hover:text-blue-400">
                {opt.title}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {opt.hint}
              </span>
            </button>
          ))}
        </div>
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
          onClick={() => connection && begin(connection)}
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
          {connection === "unknown" && (
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
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => connection && begin(connection)}
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

      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Bitte lass diese Seite offen — die Messung dauert etwa 30 Sekunden.
      </p>
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
