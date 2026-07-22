// Lädt die offizielle Messbibliothek (public/ias/*) als klassische Skripte.
//
// Wichtig: Die Upstream-Dateien sind bewusst UNVERÄNDERT übernommen (siehe
// public/ias/PROVENANCE.md). Sie sind kein ES-Modul und nutzen Sloppy-Mode-
// Konstrukte (`delete` auf Variablen), dürfen also nicht gebündelt/importiert
// werden — nur als <script> in fester Reihenfolge geladen. Die Reihenfolge
// entspricht der offiziellen Demo (index.html des Upstreams).

const IAS_SCRIPTS = [
  "/ias/libs/ua-parser.min.js",
  "/ias/libs/tool.js", // definiert JSTool; muss vor ip.js/control.js stehen
  "/ias/ip.js",
  "/ias/control.js",
  "/ias/ias_client.js",
] as const;

let loadPromise: Promise<void> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = false;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Messbibliothek nicht ladbar: ${src}`));
    document.head.appendChild(el);
  });
}

/** Lädt die Engine genau einmal (idempotent), in garantierter Reihenfolge. */
export function loadIasEngine(): Promise<void> {
  if (!loadPromise) {
    // tool.js liest beim Parsen die globale Variable `logEnabled` — vorher setzen.
    (window as unknown as Record<string, unknown>).logEnabled = false;
    loadPromise = IAS_SCRIPTS.reduce(
      (chain, src) => chain.then(() => loadScript(src)),
      Promise.resolve()
    );
    loadPromise.catch(() => {
      // Bei Fehlschlag darf ein erneuter Versuch frisch starten.
      loadPromise = null;
    });
  }
  return loadPromise;
}
