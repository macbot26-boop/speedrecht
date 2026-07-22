import { useCallback, useEffect, useRef, useState } from "react";
import { loadIasEngine } from "./loader";
import type {
  IasCallbackData,
  IasCompletedKpis,
  MeasurementError,
  MeasurementPhase,
} from "./types";

// Peer-Konfiguration aus der Umgebung; Standardwerte = lokaler Docker-Peer
// (infra/dev-peer). Die Engine baut den Zielhost als `wsTarget + '.' + wsTLD`
// zusammen; *.localhost löst in Browsern immer auf die eigene Maschine auf.
//
// Test-Werkstatt (nur Entwicklungs-Modus): Zeigt die Konfiguration auf den
// lokalen Docker-Peer (*.localhost), ist die Seite aber von einem ANDEREN
// Gerät aus geöffnet (Handy → Mac im Heimnetz), dann wäre "localhost" das
// falsche Gerät — es meint auf dem Handy das Handy. In dem Fall übernehmen
// wir den Hostnamen aus der Adresszeile: Der zeigt sicher auf die Maschine,
// auf der Dev-Server UND Peer laufen. Produktion bleibt unberührt.
function peerKonfiguration(): { targets: string[]; tld: string } {
  const targets = (process.env.NEXT_PUBLIC_IAS_WS_TARGETS ?? "dev").split(",");
  const tld = process.env.NEXT_PUBLIC_IAS_WS_TLD ?? "localhost";

  if (
    process.env.NODE_ENV === "development" &&
    typeof window !== "undefined" &&
    (tld === "localhost" || tld.endsWith(".localhost"))
  ) {
    const seitenHost = window.location.hostname;
    const istLokal = seitenHost === "localhost" || seitenHost.endsWith(".localhost");
    const punkt = seitenHost.indexOf(".");
    if (!istLokal && punkt > 0) {
      // Am ersten Punkt teilen, weil die Engine Target + "." + TLD verklebt.
      return {
        targets: [seitenHost.slice(0, punkt)],
        tld: seitenHost.slice(punkt + 1),
      };
    }
  }
  return { targets, tld };
}

const konfiguration = peerKonfiguration();
const WS_TARGETS = konfiguration.targets;
const WS_TLD = konfiguration.tld;
const WS_PORT = process.env.NEXT_PUBLIC_IAS_WS_PORT ?? "8081";
const WS_TLS = process.env.NEXT_PUBLIC_IAS_WS_TLS === "1" ? 1 : 0;

/** Der Host, gegen den gemessen wird (für Anzeige + Speicherung). */
export const PEER_HOST = `${WS_TARGETS[0]}.${WS_TLD}`;

function buildParams(cmd: "start" | "stop") {
  return JSON.stringify({
    cmd,
    platform: "web",
    wsTargets: WS_TARGETS,
    wsTLD: WS_TLD,
    wsTargetPort: WS_PORT,
    wsWss: WS_TLS,
    wsWorkerPath: "/ias/worker.js",
    performRttMeasurement: true,
    performDownloadMeasurement: true,
    performUploadMeasurement: true,
    performRouteToClientLookup: false,
  });
}

const ERROR_MESSAGES: Record<number, string> = {
  1: "Interner Fehler: Messparameter unvollständig.",
  2: "Zeitüberschreitung — der Messserver hat nicht rechtzeitig geantwortet.",
  3: "Dein Browser unterstützt die nötige Technik (WebSockets) nicht.",
  5: "Dein Browser unterstützt die nötige Technik nur unvollständig.",
  8: "Sichere Verbindung zum Messserver fehlgeschlagen (TLS).",
  11: "Keine Verbindung zum Messserver. Bitte später erneut versuchen.",
};

export interface IasMeasurementState {
  phase: MeasurementPhase;
  /** Live-Wert während der Messung (Mbit/s bzw. ms) */
  rttMs: number | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  result: IasCompletedKpis | null;
  error: MeasurementError | null;
}

const INITIAL: IasMeasurementState = {
  phase: "idle",
  rttMs: null,
  downloadMbps: null,
  uploadMbps: null,
  result: null,
  error: null,
};

/**
 * React-Brücke zur offiziellen Messbibliothek. Ein Aufruf von `start()`
 * führt genau eine vollständige Messung aus (ip → rtt → download → upload).
 */
export function useIasMeasurement() {
  const [state, setState] = useState<IasMeasurementState>(INITIAL);
  const runIdRef = useRef(0);
  const runningRef = useRef(false);

  const stop = useCallback(() => {
    if (runningRef.current && window.iasMeasurement) {
      try {
        window.iasMeasurement.measurementControl(buildParams("stop"));
      } catch {
        // Engine war noch nicht initialisiert — nichts zu stoppen.
      }
      runningRef.current = false;
    }
  }, []);

  // Beim Verlassen der Seite laufende Messung abbrechen.
  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      stop();
    };
  }, [stop]);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    const runId = ++runIdRef.current;
    setState({ ...INITIAL, phase: "loading" });

    try {
      await loadIasEngine();
    } catch (e) {
      runningRef.current = false;
      setState({
        ...INITIAL,
        phase: "error",
        error: { message: e instanceof Error ? e.message : "Messbibliothek nicht ladbar." },
      });
      return;
    }
    if (runId !== runIdRef.current) return; // Seite verlassen o. Ä.

    window.measurementCallback = (raw: string) => {
      if (runId !== runIdRef.current) return; // Ereignis aus altem Lauf
      let data: IasCallbackData;
      try {
        data = JSON.parse(raw) as IasCallbackData;
      } catch {
        return;
      }

      if (data.cmd === "error") {
        runningRef.current = false;
        setState((s) => ({
          ...s,
          phase: "error",
          error: {
            code: data.error_code,
            message:
              (data.error_code !== undefined && ERROR_MESSAGES[data.error_code]) ||
              data.error_description ||
              "Unbekannter Fehler bei der Messung.",
          },
        }));
        return;
      }

      if (data.cmd === "completed") {
        runningRef.current = false;
        setState((s) => ({ ...s, phase: "done", result: data }));
        return;
      }

      // info/report/finish: Phase + Live-Werte nachführen
      setState((s) => {
        const next = { ...s };
        if (
          data.test_case === "ip" ||
          data.test_case === "rtt" ||
          data.test_case === "download" ||
          data.test_case === "upload"
        ) {
          next.phase = data.test_case;
        }
        if (typeof data.rtt_avg === "number") next.rttMs = data.rtt_avg;
        if (typeof data.download_rate_avg_mbps === "number")
          next.downloadMbps = Number(data.download_rate_avg_mbps);
        if (typeof data.upload_rate_avg_mbps === "number")
          next.uploadMbps = Number(data.upload_rate_avg_mbps);
        return next;
      });
    };

    // Frische Instanz pro Lauf — exakt das Muster der offiziellen Demo.
    // Der globale Name `iasMeasurement` ist Pflicht (siehe types.ts).
    window.iasMeasurement = null;
    window.iasMeasurement = new window.IASMeasurement();
    window.iasMeasurement.measurementControl(buildParams("start"));
  }, []);

  return { ...state, start, stop };
}
