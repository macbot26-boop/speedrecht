// Lädt die offizielle Messbibliothek (public/ias/*) als klassische Skripte.
//
// Wichtig: Die Upstream-Dateien sind bewusst UNVERÄNDERT übernommen (siehe
// public/ias/PROVENANCE.md). Sie sind kein ES-Modul und nutzen Sloppy-Mode-
// Konstrukte (`delete` auf Variablen), dürfen also nicht gebündelt/importiert
// werden — nur als <script> in fester Reihenfolge geladen. Die Reihenfolge
// entspricht der offiziellen Demo (index.html des Upstreams).

/**
 * Erst das Werkzeug: `ua-parser` und `tool.js`.
 *
 * `tool.js` bringt `JSTool` mit — und legt dabei die drei Protokoll-Schalter
 * an (`var logEnabled = true;`, Zeile 17 ff.).
 */
const IAS_WERKZEUG = ["/ias/libs/ua-parser.min.js", "/ias/libs/tool.js"] as const;

/**
 * Dann das Messwerk. Diese drei lesen die Schalter SCHON BEIM PARSEN
 * (`jsTool.enableLoggger(logEnabled)` — ip.js:18, control.js:18). Genau
 * deshalb sind sie von der Werkzeug-Gruppe getrennt: Dazwischen liegt der
 * einzige Moment, in dem sich die Schalter wirksam umlegen lassen.
 */
const IAS_MESSWERK = ["/ias/ip.js", "/ias/control.js", "/ias/ias_client.js"] as const;

/**
 * Der Merker hängt am `window`, nicht an einer Modul-Variablen.
 *
 * Nachgemessen: Bearbeitet man im Entwicklungs-Modus eine Datei, wertet
 * Next-Fast-Refresh dieses Modul neu aus. Eine Modul-Variable stünde danach
 * wieder auf `null` — und die nächste Messung hängt alle fünf Skripte ein
 * ZWEITES Mal ins Dokument (gezählt: 10 statt 5). Damit lägen zwei Fassungen
 * derselben Messbibliothek nebeneinander, jede mit eigenem Zustand, und
 * `tool.js` würde `console.log` ein zweites Mal umhängen — die doppelten
 * Protokollzeilen. Das `window` überlebt Fast Refresh; ein echtes Neuladen der
 * Seite räumt es ohnehin ab, und dann soll ja auch neu geladen werden.
 */
const LADE_MERKER = "__speedrechtIasLadevorgang";

function merkerAblage(): Record<string, Promise<void> | undefined> {
  return window as unknown as Record<string, Promise<void> | undefined>;
}

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

/** Lädt eine Gruppe Skripte nacheinander — die Reihenfolge ist Pflicht. */
function nacheinander(quellen: readonly string[]): Promise<void> {
  return quellen.reduce(
    (kette, src) => kette.then(() => loadScript(src)),
    Promise.resolve()
  );
}

/**
 * Schaltet das Protokoll der Messbibliothek stumm.
 *
 * MUSS zwischen `tool.js` und `ip.js`/`control.js` laufen. Davor ist es
 * wirkungslos — `tool.js:17` schreibt mit `var logEnabled = true;` MIT
 * ZUWEISUNG darüber; danach ist es zu spät, weil die beiden anderen den
 * Schalter beim Parsen schon gelesen haben.
 *
 * Was dabei passiert, ist mehr als ein leiser Schalter: `enableLoggger(false)`
 * (tool.js:196) ersetzt `console.log` der ganzen Seite durch eine leere
 * Funktion. Damit verstummen auch die zwei Zeilen in control.js (592, 636),
 * die keinen Schalter abfragen. `console.error` und `console.warn` bleiben
 * unberührt, und eigenes `console.log` benutzen wir nirgends.
 */
function protokollStummschalten(): void {
  const global = window as unknown as Record<string, unknown>;
  global.logEnabled = false;
  // Die beiden anderen sparen zusätzlich die Arbeit: Sie umschliessen
  // Protokollzeilen, die während der Messung mehrmals pro Sekunde ihre Texte
  // zusammenbauen würden — nur um sie dann an eine leere Funktion zu geben.
  global.logReports = false;
  global.logDebug = false;
}

/** Lädt die Engine genau einmal (idempotent), in garantierter Reihenfolge. */
export function loadIasEngine(): Promise<void> {
  const ablage = merkerAblage();
  let laufend = ablage[LADE_MERKER];
  if (!laufend) {
    laufend = nacheinander(IAS_WERKZEUG)
      .then(protokollStummschalten)
      .then(() => nacheinander(IAS_MESSWERK));
    ablage[LADE_MERKER] = laufend;
    laufend.catch(() => {
      // Bei Fehlschlag darf ein erneuter Versuch frisch starten.
      delete ablage[LADE_MERKER];
    });
  }
  return laufend;
}
