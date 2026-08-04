// Der Messschrieb der Startseite — eine Beispiel-Messreihe, die sich beim
// Laden selbst zeichnet, wie der Schreiber eines Messgeräts.
//
// Was hier ECHT ist und was nicht, steht sichtbar darunter: Die drei
// Schwellen (bis zu / normalerweise / mindestens) stammen wörtlich aus dem
// offiziellen Produktinformationsblatt des Tarifs „1&1 DSL 100". Die
// Messwerte sind zur Veranschaulichung erfunden — die Seite behauptet
// nirgends, das sei eine echte Messung. Ehrlichkeit ist Produktgesetz.
//
// Bewusst OHNE Fremdbibliothek: eine Handvoll Rechenzeilen und SVG. Ein
// Diagramm-Paket wäre eine neue Abhängigkeit im Browser-Bundle und ein
// neuer Eintrag im Datenschutz-Wächter — für eine einzige Grafik.
//
// Server-Komponente: Es gibt keinen Zustand, die Animation macht CSS
// (Klassen `messschrieb-*` in globals.css). Wer weniger Bewegung wünscht,
// bekommt über die globale reduced-motion-Regel sofort das fertige Bild.

import { formatMbps } from "@/lib/tarife/anzeige.ts";

// Die echten Schwellen aus dem Produktinformationsblatt „1&1 DSL 100" —
// dieselben Werte, gegen die auch die Messung selbst urteilen würde.
const BIS_ZU = 100;
const NORMAL = 83.8;
const MINIMUM = 54;

// Drei Messtage à sieben Messungen. Erfunden, aber plausibel: fast immer
// unter „normalerweise", an Tag 2 und 3 auch unter dem Minimum — genau das
// Muster, das eine Messreihe auffällig macht.
const TAGE: number[][] = [
  [68.4, 71.9, 66.2, 59.8, 63.5, 70.1, 65.7],
  [61.3, 55.2, 49.6, 46.1, 52.8, 50.3, 57.4],
  [64.8, 60.2, 51.9, 48.3, 55.6, 62.4, 58.9],
];

// Zeichenfläche (SVG-Einheiten). Rechts bleibt Platz für die Schwellen-
// Beschriftung, unten für die Tages-Beschriftung.
const BREITE = 640;
const HOEHE = 300;
const PLOT = { links: 14, rechts: 526, oben: 22, unten: 258 };
const Y_MAX = 112; // etwas Luft über der bis-zu-Linie

function x(index: number, gesamt: number): number {
  return PLOT.links + (index / (gesamt - 1)) * (PLOT.rechts - PLOT.links);
}

function y(mbps: number): number {
  return PLOT.unten - (mbps / Y_MAX) * (PLOT.unten - PLOT.oben);
}

interface Punkt {
  x: number;
  y: number;
  mbps: number;
  tag: number;
  unterMinimum: boolean;
}

function punkteBerechnen(): Punkt[] {
  const alle = TAGE.flat();
  return alle.map((mbps, i) => ({
    x: x(i, alle.length),
    y: y(mbps),
    mbps,
    tag: Math.floor(i / TAGE[0].length) + 1,
    unterMinimum: mbps < MINIMUM,
  }));
}

export function Messschrieb() {
  const punkte = punkteBerechnen();
  const linie = punkte.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const flaeche = `${linie} L${PLOT.rechts} ${PLOT.unten} L${PLOT.links} ${PLOT.unten} Z`;
  const spitze = punkte[punkte.length - 1];
  const proTag = TAGE[0].length;
  // Aus den Daten abgeleitet, nicht abgeschrieben: Ändert jemand die
  // Beispielwerte, bleiben Vorlese-Text und Beschriftung von selbst wahr.
  const unterMinimum = punkte.filter((p) => p.unterMinimum);
  const tiefster = unterMinimum.reduce((a, b) => (b.mbps < a.mbps ? b : a), punkte[0]);
  const zahlwort =
    ["kein", "ein", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun"][
      unterMinimum.length
    ] ?? String(unterMinimum.length);

  const schwellen = [
    { wert: BIS_ZU, name: "bis zu", strich: undefined },
    { wert: NORMAL, name: "normal", strich: "6 5" },
    { wert: MINIMUM, name: "Minimum", strich: "2 5" },
  ];

  return (
    <figure className="flex w-full flex-col gap-3 rounded-2xl border border-linie bg-flaeche p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(25,26,31,0.18)] sm:p-5">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-tinte-leise">
          Messschrieb · 3 Messtage
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 font-mono text-[11px] font-medium text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/60 dark:text-amber-200">
          <span aria-hidden>▲</span> Beispiel: Reihe auffällig
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${BREITE} ${HOEHE}`}
        role="img"
        aria-labelledby="messschrieb-titel messschrieb-beschreibung"
        className="w-full"
      >
        <title id="messschrieb-titel">
          Beispiel-Messreihe über drei Messtage gegen die Schwellen des Tarifs 1&1 DSL 100
        </title>
        <desc id="messschrieb-beschreibung">
          {`Liniendiagramm: ${punkte.length} Messwerte zwischen ${formatMbps(
            Math.min(...punkte.map((p) => p.mbps))
          )} und ${formatMbps(Math.max(...punkte.map((p) => p.mbps)))} Mbit/s. Alle liegen unter der normalerweise zugesagten Rate von ${formatMbps(
            NORMAL
          )} Mbit/s, ${zahlwort} sogar unter dem Minimum von ${formatMbps(
            MINIMUM
          )} Mbit/s. Die bestellte bis-zu-Rate beträgt ${formatMbps(BIS_ZU)} Mbit/s.`}
        </desc>

        {/* Tagesgrenzen + Beschriftung. Die Trennlinie liegt in der Mitte
            zwischen letzter Messung des einen und erster des nächsten Tages. */}
        {TAGE.map((_, t) => {
          const von = x(t * proTag, punkte.length);
          const bis = x((t + 1) * proTag - 1, punkte.length);
          const abstand = (PLOT.rechts - PLOT.links) / (punkte.length - 1);
          const grenze = von - abstand / 2;
          return (
            <g key={t}>
              {t > 0 && (
                <line
                  x1={grenze}
                  x2={grenze}
                  y1={PLOT.oben - 6}
                  y2={PLOT.unten}
                  stroke="var(--linie)"
                  strokeWidth="1"
                />
              )}
              <text
                x={(von + bis) / 2}
                y={PLOT.unten + 22}
                textAnchor="middle"
                className="fill-tinte-leise font-mono text-[11px]"
              >
                Messtag {t + 1}
              </text>
            </g>
          );
        })}

        {/* Grundlinie */}
        <line
          x1={PLOT.links}
          x2={PLOT.rechts}
          y1={PLOT.unten}
          y2={PLOT.unten}
          stroke="var(--linie-stark)"
          strokeWidth="1"
        />

        {/* Die drei Schwellen aus dem Produktinformationsblatt — zurückhaltend
            in Tinte, denn sie sind Bezugsgrößen, keine Messwerte. */}
        {schwellen.map((s) => (
          <g key={s.name}>
            <line
              x1={PLOT.links}
              x2={PLOT.rechts}
              y1={y(s.wert)}
              y2={y(s.wert)}
              stroke="var(--tinte-leise)"
              strokeOpacity="0.55"
              strokeWidth="1"
              strokeDasharray={s.strich}
            />
            {/* Auf schmalen Schirmen skalieren SVG-Beschriftungen unter die
                Lesbarkeit — dort übernimmt die HTML-Legende unter dem Bild. */}
            <text
              x={PLOT.rechts + 8}
              y={y(s.wert) + 3.5}
              className="fill-tinte-leise font-mono text-[11px] max-sm:hidden"
            >
              {s.name} {formatMbps(s.wert)}
            </text>
          </g>
        ))}

        {/* Die Messkurve: Fläche zum Verankern, Linie als Schrieb. */}
        <path d={flaeche} fill="var(--signal)" fillOpacity="0.07" className="messschrieb-flaeche" />
        <path
          d={linie}
          fill="none"
          stroke="var(--signal)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          className="messschrieb-linie"
        />

        {/* Ein Punkt je Messung; unter dem Minimum wird er zum Status —
            rot UND beschriftet, Farbe allein trägt die Aussage nie. Punkt
            und Beschriftung nutzen dasselbe Rot-Paar für beide Modi. */}
        {punkte.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.unterMinimum ? 4 : 3}
            stroke="var(--flaeche)"
            strokeWidth="1.5"
            className={`messschrieb-punkt ${
              p.unterMinimum ? "fill-red-600 dark:fill-red-400" : "fill-signal"
            }`}
            style={{ animationDelay: `${(0.25 + (i / punkte.length) * 2.1).toFixed(2)}s` }}
          >
            <title>
              {`Messtag ${p.tag} · ${formatMbps(p.mbps)} Mbit/s${p.unterMinimum ? " — unter dem Minimum" : ""}`}
            </title>
          </circle>
        ))}

        {/* Beschriftung der Status-Punkte: einmal, am tiefsten Wert —
            aus den Daten gefunden, nicht an feste Zahlen geheftet. */}
        <text
          x={tiefster.x}
          y={tiefster.y + 18}
          textAnchor="middle"
          className="fill-red-600 font-mono text-[11px] font-medium dark:fill-red-400"
        >
          ▼ unter dem Minimum
        </text>

        {/* Die Spitze des Schreibers pulsiert leise weiter. */}
        <circle
          cx={spitze.x}
          cy={spitze.y}
          r="5"
          fill="none"
          stroke="var(--signal)"
          strokeWidth="1.5"
          className="messschrieb-puls"
        />
      </svg>

      <p className="font-mono text-[11px] leading-5 text-tinte-leise sm:hidden">
        ―― bis zu {formatMbps(BIS_ZU)} · – – normal {formatMbps(NORMAL)} · ···
        Minimum {formatMbps(MINIMUM)} Mbit/s
      </p>

      <p className="text-xs leading-5 text-tinte-leise">
        Beispielwerte zur Veranschaulichung — die drei Schwellen sind echt und stammen aus dem
        offiziellen Produktinformationsblatt des Tarifs „1&1 DSL 100&#8220;.
      </p>

      <details className="group">
        <summary className="cursor-pointer list-none font-mono text-[11px] text-tinte-leise underline decoration-linie-stark underline-offset-2 transition hover:text-tinte-mittel">
          Werte als Tabelle
        </summary>
        <table className="mt-2 w-full max-w-sm text-left font-mono text-[11px] text-tinte-mittel">
          <thead>
            <tr className="text-tinte-leise">
              <th scope="col" className="py-1 pr-3 font-medium">
                Messtag
              </th>
              <th scope="col" className="py-1 font-medium">
                Werte in Mbit/s
              </th>
            </tr>
          </thead>
          <tbody>
            {TAGE.map((werte, t) => (
              <tr key={t} className="border-t border-linie align-top">
                <th scope="row" className="py-1 pr-3 font-medium">
                  {t + 1}
                </th>
                <td className="py-1 tabular-nums">
                  {werte.map((w) => formatMbps(w)).join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
