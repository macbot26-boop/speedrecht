// Typen für die Kommunikation mit der offiziellen Messbibliothek.
// Feldnamen entsprechen exakt den KPI-Schlüsseln des IAS-Clients 2.4
// (siehe public/ias/control.js, getKPIs*).

/** Selbstauskunft der Nutzerin/des Nutzers vor der Messung. */
export type ConnectionType = "wifi" | "lan" | "unknown";

export type MeasurementPhase =
  | "idle" // noch nicht gestartet
  | "loading" // Messbibliothek wird geladen
  | "ip" // Vortest: IP/TLS-Parameter
  | "rtt" // Laufzeit (Ping)
  | "download"
  | "upload"
  | "done"
  | "error";

/** Ein einzelnes Callback-Ereignis der Engine (JSON-geparst). */
export interface IasCallbackData {
  cmd: "info" | "report" | "finish" | "completed" | "error";
  test_case?: "ip" | "rtt" | "download" | "upload" | "routeToClient";
  msg?: string;
  error_code?: number;
  error_description?: string;
  // Live- und Endwerte (Auszug; vollständige Liste im Upstream)
  rtt_avg?: number; // ms
  rtt_med?: number; // ms
  rtt_min?: number;
  rtt_max?: number;
  rtt_std_dev_pop?: number;
  rtt_requests?: number;
  rtt_replies?: number;
  download_rate_avg_mbps?: number;
  download_rate_avg?: number; // bit/s
  download_data?: number; // Bytes (inkl. Overhead)
  download_duration?: number; // ms
  upload_rate_avg_mbps?: number;
  upload_rate_avg?: number;
  upload_data?: number;
  upload_duration?: number;
  ip_version?: "v4" | "v6";
  client?: string; // öffentliche IP — wird NIE gespeichert
  client_browser?: string;
  client_browser_version?: string;
  client_os?: string;
  client_os_version?: string;
  client_ias_version?: string;
  [key: string]: unknown;
}

/** Endergebnis: das flache KPI-Objekt aus cmd:'completed'. */
export type IasCompletedKpis = IasCallbackData;

export interface MeasurementError {
  code?: number;
  message: string;
}

// Globale Namen, die die Engine erwartet bzw. bereitstellt.
// `iasMeasurement` MUSS exakt so heißen: control.js/ip.js erreichen die
// Instanz über diese globale Variable (Callback-Kette des Upstreams).
declare global {
  interface Window {
    IASMeasurement: new () => {
      measurementControl: (params: string) => void;
    };
    iasMeasurement: { measurementControl: (params: string) => void } | null;
    measurementCallback: (data: string) => void;
    // Die drei Protokoll-Schalter der Messbibliothek. Sie werden von
    // `tool.js` angelegt und von `ip.js`/`control.js` beim Parsen gelesen —
    // umgelegt werden sie deshalb genau dazwischen (siehe `loader.ts`).
    logEnabled: boolean;
    logReports: boolean;
    logDebug: boolean;
  }
}
