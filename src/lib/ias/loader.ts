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

/**
 * So lange darf das Laden der Messbibliothek dauern, bevor wir aufgeben.
 *
 * WARUM ES DIESE FRIST GIBT: Ein `<script>`-Element meldet sich nur bei Erfolg
 * (`onload`) oder bei einem klaren Fehlschlag (`onerror`). Bleibt die Anfrage
 * einfach stehen — hängender Proxy, eingeschlafenes Mobilfunknetz, ein Netz,
 * das Pakete verschluckt statt sie abzulehnen —, kommt keins von beidem. Ohne
 * Frist wartet die Kette dann für immer, und die Seite steht ohne
 * Fehlermeldung auf "Messtechnik wird geladen …". Der Wächter in
 * `use-ias-measurement.ts` greift hier noch nicht: Er bewacht die laufende
 * Messung, und die hat zu diesem Zeitpunkt nicht einmal begonnen.
 *
 * 20 Sekunden für die fünf Dateien (zusammen rund 100 KB) sind reichlich —
 * das entspricht 5 KB/s und liegt unter allem, worüber sich überhaupt messen
 * ließe. Wer das reißt, lädt nicht langsam, sondern gar nicht.
 */
export const LADE_FRIST_MS = 20_000;

/**
 * Der Fehler, mit dem ein zu langer Ladevorgang endet.
 *
 * Der Text nennt die Frist, rechnet sie aber aus der Konstanten aus: Sonst
 * stünde nach der ersten Änderung der Frist eine falsche Zahl auf dem Schirm.
 */
export function ladeFristFehler(): Error {
  return new Error(
    `Die Messtechnik ließ sich nicht laden — nach ${Math.round(LADE_FRIST_MS / 1000)} Sekunden war sie immer noch nicht da. Bitte prüfe deine Internetverbindung und starte die Messung noch einmal.`
  );
}

/**
 * Legt eine Frist um ein Versprechen.
 *
 * Kommt es rechtzeitig, wird die Uhr abgeräumt und alles bleibt, wie es war —
 * auch ein Fehlschlag wird unverändert durchgereicht und NICHT als
 * Fristablauf verkleidet. Erst wenn gar nichts kommt, greift `fehler()`.
 */
export function mitFrist<T>(
  versprechen: Promise<T>,
  frist: number,
  fehler: () => Error
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const uhr = setTimeout(() => reject(fehler()), frist);
    versprechen.then(
      (wert) => {
        clearTimeout(uhr);
        resolve(wert);
      },
      (grund) => {
        clearTimeout(uhr);
        reject(grund);
      }
    );
  });
}

/** Lädt die Engine genau einmal (idempotent), in garantierter Reihenfolge. */
export function loadIasEngine(): Promise<void> {
  const ablage = merkerAblage();
  let laufend = ablage[LADE_MERKER];
  if (!laufend) {
    const dieser = mitFrist(
      nacheinander(IAS_WERKZEUG)
        .then(protokollStummschalten)
        .then(() => nacheinander(IAS_MESSWERK)),
      LADE_FRIST_MS,
      ladeFristFehler
    );
    laufend = dieser;
    ablage[LADE_MERKER] = dieser;
    dieser.catch(() => {
      // Bei Fehlschlag darf ein erneuter Versuch frisch starten — aber nur,
      // wenn der Merker noch zu DIESEM Versuch gehört. Seit es die Frist gibt,
      // kann ein alter Versuch lange nach seinem Ende noch hier ankommen; ohne
      // die Prüfung räumte er einem gesunden neuen Versuch den Merker weg.
      if (ablage[LADE_MERKER] === dieser) delete ablage[LADE_MERKER];
    });
  }
  return laufend;
}
