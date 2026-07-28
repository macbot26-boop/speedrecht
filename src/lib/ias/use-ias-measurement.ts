import { useCallback, useEffect, useRef, useState } from "react";
import { loadIasEngine } from "./loader";
import {
  TAKT_MS,
  istEingeschraenkt,
  istHaenger,
  mitLebenszeichen,
  mitSichtbarkeit,
  mitTakt,
  neueBedingungen,
} from "./messbedingungen";
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

/**
 * Die zwei Texte, mit denen eine stehen gebliebene Messung endet.
 *
 * Zwei, weil der Wächter nicht nur bei Drosselung anschlägt: Er merkt, DASS
 * sich nichts mehr rührt, nicht warum. Nur wenn wir die Seite tatsächlich als
 * ausgebremst erkannt haben, dürfen wir das als Ursache nennen — sonst schickt
 * die Meldung jemanden auf die Suche nach einem Hintergrund-Tab, den es nie
 * gab.
 */
const STILLSTAND_GEDROSSELT =
  "Der Browser hat diesen Tab im Hintergrund ausgebremst — die Messung kam dadurch nicht zu Ende. Lass die Seite im Vordergrund und starte sie noch einmal.";
const STILLSTAND_UNBEKANNT =
  "Die Messung hat sich nicht mehr gemeldet und wurde abgebrochen. Bitte starte sie noch einmal.";

/** Liegt die Seite gerade im Hintergrund? */
function seiteVerborgen(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/**
 * Der Wächter über einen laufenden Messvorgang.
 *
 * Er beobachtet die zwei Lagen, gegen die die Messbibliothek selbst nichts
 * unternimmt (siehe `messbedingungen.ts`): eine ausgebremste Seite und eine
 * Messung, die steht. Die Regeln stehen dort, hier steht nur die Verkabelung
 * mit Uhr und Browser.
 *
 * Zurück kommen zwei Griffe: `lebenszeichen()` meldet jedes Ereignis der
 * Messbibliothek, `beenden()` stellt den Wächter wieder ab.
 */
function waechterStarten(meldungen: {
  gedrosselt: () => void;
  stillstand: (gedrosselt: boolean) => void;
}) {
  let stand = neueBedingungen(Date.now(), seiteVerborgen());

  const pruefen = () => {
    const gedrosselt = istEingeschraenkt(stand);
    if (gedrosselt) meldungen.gedrosselt();
    if (istHaenger(stand, Date.now())) meldungen.stillstand(gedrosselt);
  };

  const takt = setInterval(() => {
    stand = mitTakt(stand, Date.now());
    pruefen();
  }, TAKT_MS);

  // Zusätzlich zum Herzschlag, weil der Herzschlag in einem gedrosselten Tab
  // selbst gedrosselt ist: Kehrt der Nutzer zurück, läuft der Browser sofort
  // wieder normal — dann soll er die Meldung sehen und nicht bis zum nächsten
  // Schlag auf einen Fortschrittsbalken starren, hinter dem nichts mehr ist.
  const sichtbarkeit = () => {
    stand = mitSichtbarkeit(stand, seiteVerborgen());
    pruefen();
  };
  document.addEventListener("visibilitychange", sichtbarkeit);

  return {
    lebenszeichen: () => {
      stand = mitLebenszeichen(stand, Date.now());
    },
    beenden: () => {
      clearInterval(takt);
      document.removeEventListener("visibilitychange", sichtbarkeit);
    },
  };
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
  /**
   * Wurde die Seite während dieser Messung vom Browser ausgebremst?
   *
   * Dann sind die Zahlen zu niedrig — vor allem der Ping — und das Ergebnis
   * darf weder in die Messreihe noch in den Kulanz-Brief. Angezeigt wird es
   * trotzdem, aber gekennzeichnet.
   */
  eingeschraenkt: boolean;
}

const INITIAL: IasMeasurementState = {
  phase: "idle",
  rttMs: null,
  downloadMbps: null,
  uploadMbps: null,
  result: null,
  error: null,
  eingeschraenkt: false,
};

/**
 * React-Brücke zur offiziellen Messbibliothek. Ein Aufruf von `start()`
 * führt genau eine vollständige Messung aus (ip → rtt → download → upload).
 */
export function useIasMeasurement() {
  const [state, setState] = useState<IasMeasurementState>(INITIAL);
  const runIdRef = useRef(0);
  const runningRef = useRef(false);
  const waechterRef = useRef<ReturnType<typeof waechterStarten> | null>(null);

  /** Stellt den Wächter ab — jeder Weg aus einer Messung führt hier vorbei. */
  const waechterAbstellen = useCallback(() => {
    waechterRef.current?.beenden();
    waechterRef.current = null;
  }, []);

  const stop = useCallback(() => {
    waechterAbstellen();
    if (runningRef.current) {
      try {
        window.iasMeasurement?.measurementControl(buildParams("stop"));
      } catch {
        // Engine war noch nicht initialisiert — nichts zu stoppen.
      }
      runningRef.current = false;
    }
  }, [waechterAbstellen]);

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

    // Ab hier läuft der Wächter. Er tut die zwei Dinge, die die
    // Messbibliothek nicht tut: eine ausgebremste Seite kennzeichnen und eine
    // Messung beenden, die steht (siehe `messbedingungen.ts`).
    waechterRef.current = waechterStarten({
      gedrosselt: () => {
        if (runId !== runIdRef.current) return;
        // Denselben Zustand zurückgeben, wenn schon gekennzeichnet: Der
        // Herzschlag meldet im Sekundentakt, ein neues Objekt je Schlag wäre
        // ein Neu-Zeichnen pro Sekunde — mitten in der laufenden Messung.
        setState((s) => (s.eingeschraenkt ? s : { ...s, eingeschraenkt: true }));
      },
      stillstand: (gedrosselt) => {
        if (runId !== runIdRef.current) return;
        // Erst die Kennung hochzählen, dann anhalten: Was die Engine beim
        // Stoppen noch nachreicht, gehört zu einem Lauf, den es nicht mehr
        // gibt, und darf die Meldung unten nicht überschreiben.
        runIdRef.current += 1;
        stop();
        setState((s) => ({
          ...s,
          phase: "error",
          error: { message: gedrosselt ? STILLSTAND_GEDROSSELT : STILLSTAND_UNBEKANNT },
        }));
      },
    });

    window.measurementCallback = (raw: string) => {
      if (runId !== runIdRef.current) return; // Ereignis aus altem Lauf
      // Jedes Ereignis ist ein Lebenszeichen — egal welches. Der Wächter
      // fragt nicht nach Fortschritt, nur danach, ob überhaupt noch etwas
      // passiert.
      waechterRef.current?.lebenszeichen();
      let data: IasCallbackData;
      try {
        data = JSON.parse(raw) as IasCallbackData;
      } catch {
        return;
      }

      if (data.cmd === "error") {
        runningRef.current = false;
        waechterAbstellen();
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
        waechterAbstellen();
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
  }, [stop, waechterAbstellen]);

  return { ...state, start, stop };
}
