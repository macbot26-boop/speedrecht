"use client";

// Der Schreiber: zeichnet die laufende Messung, während sie läuft.
//
// WARUM DAS SO UND NICHT ANDERS GEBAUT IST — die beiden harten Grenzen:
//
// 1. KEIN BYTE ÜBER DAS NETZ, solange gemessen wird. Alles, was in den
//    ~10 Sekunden des Downloads nebenher geladen würde (ein Video, ein Bild,
//    eine Schrift), konkurriert mit den vier Datenströmen der Messung — und
//    das Ergebnis fiele zu niedrig aus. Das wäre kein Schönheitsfehler,
//    sondern ein Beleg gegen den Anbieter, den unsere eigene Seite erzeugt
//    hat. Dieselbe Überlegung wie bei der Hintergrund-Drosselung.
//    Deshalb: keine Mediendatei, kein Nachladen, nichts. Gezeichnet wird
//    ausschließlich aus Zahlen, die ohnehin schon da sind.
//
// 2. SO WENIG RECHENZEIT WIE MÖGLICH. Bei schnellen Anschlüssen ist die
//    Messung selbst rechenlastig; eine Animation, die den Hauptthread
//    beschäftigt, drückt den gemessenen Wert. Deshalb hängt hier nichts an
//    einem eigenen Zeitgeber: Neu gezeichnet wird genau dann, wenn die
//    Messbibliothek ohnehin einen Wert meldet (alle ~500 ms, control.js:69–82)
//    — die Seite rendert in diesem Moment sowieso neu. Die einzige laufende
//    Animation ist ein CSS-Suchlauf, und der endet, sobald die erste echte
//    Zahl da ist, also BEVOR die Durchsatzmessung beginnt.
//
// Was der Nutzer davon hat: Er sieht seine eigene Leitung entstehen. Das ist
// der einzige Inhalt, der 30 Sekunden trägt, ohne etwas zu kosten — und es
// ist dieselbe Bildsprache wie der Messschrieb auf der Startseite.

import { useEffect, useRef, useState } from "react";
import type { MeasurementPhase } from "@/lib/ias/types";
import { formatMbps } from "@/lib/tarife/anzeige.ts";

/** Eine gemeldete Durchsatz-Zahl. Nur Download und Upload — siehe Y-Achse. */
interface Probe {
  phase: "download" | "upload";
  wert: number;
}

/** Eine Zeile im Protokoll. */
interface Zeile {
  zeit: string;
  text: string;
}

interface Lage {
  proben: Probe[];
  zeilen: Zeile[];
}

// Zeichenfläche in SVG-Einheiten. Oben bleibt Platz für den Maßstab, unten
// für die Beschriftung der beiden Abschnitte — beides INNERHALB der Fläche,
// damit nichts am Rand abgeschnitten wird.
const BREITE = 600;
const HOEHE = 150;
const PLOT = { links: 10, rechts: 590, oben: 32, unten: 118 };

/**
 * Wie viele Meldungen die Breite füllen.
 *
 * Download und Upload laufen je 10 Sekunden bei einer Meldung alle 500 ms
 * (control.js) — also rund 20 + 20. Die Kurve wächst damit über den Lauf
 * genau bis zum rechten Rand: Sie ist die Fortschrittsanzeige, ohne dass es
 * eine zweite geben müsste. Kommen mehr Meldungen, wird gestaucht statt
 * überzulaufen.
 */
const PROBEN_BREITE = 40;

/** Nur jede vierte Meldung kommt ins Protokoll — sonst wären es 40 Zeilen. */
const PROTOKOLL_TAKT = 4;

/** So viele Zeilen stehen gleichzeitig da. Feste Höhe, damit nichts springt. */
const PROTOKOLL_ZEILEN = 3;

const PHASEN_TEXT: Partial<Record<MeasurementPhase, string>> = {
  loading: "Messtechnik geladen",
  ip: "Verbindung zum Messserver steht",
  rtt: "Laufzeit wird gemessen",
  download: "4 Datenströme geöffnet — Download",
  upload: "Richtung gedreht — Upload",
};

/** Sekunden seit dem Start als "MM:SS" — die Zeitachse des Protokolls. */
function zeitstempel(msSeitStart: number): string {
  const s = Math.max(0, Math.floor(msSeitStart / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Die nächste runde Zahl über dem Höchstwert — der Maßstab der Y-Achse.
 *
 * Er kann nur wachsen, weil der Höchstwert nur wachsen kann (Proben werden
 * angehängt, nie entfernt). Dadurch springt die Kurve nicht hin und her.
 */
function massstab(maximum: number): number {
  if (!(maximum > 0)) return 10;
  const stufe = Math.pow(10, Math.floor(Math.log10(maximum)));
  for (const faktor of [1, 1.5, 2, 3, 5, 7.5, 10]) {
    if (maximum <= stufe * faktor) return stufe * faktor;
  }
  return stufe * 10;
}

export function MessSchreiber({
  phase,
  rttMs,
  downloadMbps,
  uploadMbps,
}: {
  phase: MeasurementPhase;
  rttMs: number | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
}) {
  const [lage, setLage] = useState<Lage>({ proben: [], zeilen: [] });
  // Erst im Browser gesetzt: Der Lauf beginnt, wenn diese Komponente
  // erscheint — auf dem Server gäbe es dafür keinen passenden Wert.
  const [startzeit] = useState(() => Date.now());
  const letzteMarke = useRef<string | null>(null);
  const letztePhase = useRef<MeasurementPhase | null>(null);
  const seitLetzterZeile = useRef(0);

  useEffect(() => {
    const wert =
      phase === "download" ? downloadMbps : phase === "upload" ? uploadMbps : phase === "rtt" ? rttMs : null;

    // Ein Merkzettel gegen zwei Dinge auf einmal: den Doppellauf des Strict
    // Mode (dieselbe Meldung darf nicht zweimal ins Protokoll) und Meldungen,
    // die sich gar nicht geändert haben.
    const marke = `${phase}|${wert ?? ""}`;
    if (letzteMarke.current === marke) return;
    letzteMarke.current = marke;

    const phasenWechsel = letztePhase.current !== phase;
    letztePhase.current = phase;
    if (phasenWechsel) seitLetzterZeile.current = 0;

    const zeit = zeitstempel(Date.now() - startzeit);
    const neueZeilen: Zeile[] = [];
    const phasenText = PHASEN_TEXT[phase];
    if (phasenWechsel && phasenText) neueZeilen.push({ zeit, text: phasenText });

    const messbar = typeof wert === "number" && wert > 0;
    if (messbar) {
      seitLetzterZeile.current += 1;
      if (seitLetzterZeile.current >= PROTOKOLL_TAKT) {
        seitLetzterZeile.current = 0;
        neueZeilen.push({
          zeit,
          text:
            phase === "rtt"
              ? `Laufzeit ${wert.toFixed(0)} ms`
              : `${formatMbps(wert)} Mbit/s`,
        });
      }
    }

    const neueProbe =
      messbar && (phase === "download" || phase === "upload")
        ? ({ phase, wert } satisfies Probe)
        : null;

    if (!neueProbe && neueZeilen.length === 0) return;

    // Zustand aus einem äußeren Ereignisstrom nachführen: Die Messbibliothek
    // meldet, wir schreiben mit. Der Merkzettel oben macht das idempotent —
    // ein zweiter Lauf desselben Effekts ändert nichts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLage((alt) => ({
      proben: neueProbe ? [...alt.proben, neueProbe] : alt.proben,
      zeilen:
        neueZeilen.length === 0
          ? alt.zeilen
          : [...alt.zeilen, ...neueZeilen].slice(-PROTOKOLL_ZEILEN),
    }));
  }, [phase, rttMs, downloadMbps, uploadMbps, startzeit]);

  const { proben, zeilen } = lage;

  return (
    <div className="flex w-full flex-col gap-3">
      <Schrieb proben={proben} />
      <Protokoll zeilen={zeilen} />
    </div>
  );
}

/** Die Kurve selbst. */
function Schrieb({ proben }: { proben: Probe[] }) {
  const hoechst = proben.reduce((a, p) => (p.wert > a ? p.wert : a), 0);
  const skala = massstab(hoechst);
  const spanne = Math.max(PROBEN_BREITE, proben.length);

  const x = (i: number) =>
    PLOT.links + (spanne <= 1 ? 0 : (i / (spanne - 1)) * (PLOT.rechts - PLOT.links));
  const y = (wert: number) =>
    PLOT.unten - Math.min(1, wert / skala) * (PLOT.unten - PLOT.oben);

  const punkte = proben.map((p, i) => ({ x: x(i), y: y(p.wert), ...p }));
  const linie = punkte
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const flaeche =
    punkte.length > 1
      ? `${linie} L${punkte[punkte.length - 1].x.toFixed(1)} ${PLOT.unten} L${punkte[0].x.toFixed(1)} ${PLOT.unten} Z`
      : "";
  const spitze = punkte[punkte.length - 1];

  // Wo der Download endet und der Upload beginnt.
  //
  // Solange der Upload nicht angefangen hat, steht die Grenze GESTRICHELT an
  // der erwarteten Stelle: Beide Abschnitte dauern je 10 Sekunden bei einer
  // Meldung alle 500 ms, die Mitte ist also vorhersehbar. Das ist keine
  // Behauptung über Messwerte, sondern der Rahmen — ohne ihn stünde die
  // Kurve 20 Sekunden lang in einer leeren Fläche ohne erkennbares Ziel.
  // Sobald der Upload wirklich läuft, tritt die ECHTE Grenze an ihre Stelle.
  const ersterUpload = proben.findIndex((p) => p.phase === "upload");
  const echteGrenze =
    ersterUpload > 0 ? (x(ersterUpload - 1) + x(ersterUpload)) / 2 : null;
  const grenze = echteGrenze ?? x(PROBEN_BREITE / 2 - 0.5);

  const beschriftung = (von: number, bis: number, text: string) => (
    <text
      x={(von + bis) / 2}
      y={PLOT.unten + 20}
      textAnchor="middle"
      className="fill-tinte-leise font-mono text-[11px]"
    >
      {text}
    </text>
  );

  return (
    <svg
      viewBox={`0 0 ${BREITE} ${HOEHE}`}
      role="img"
      aria-label={
        proben.length === 0
          ? "Messschrieb — es liegen noch keine Durchsatzwerte vor."
          : `Messschrieb der laufenden Messung: ${proben.length} Werte, höchster Wert ${formatMbps(hoechst)} Mbit/s.`
      }
      className="w-full"
    >
      {/* Ruhiges Raster — vier Höhenlinien, die den Maßstab lesbar machen. */}
      {[0, 0.25, 0.5, 0.75, 1].map((anteil) => (
        <line
          key={anteil}
          x1={PLOT.links}
          x2={PLOT.rechts}
          y1={PLOT.unten - anteil * (PLOT.unten - PLOT.oben)}
          y2={PLOT.unten - anteil * (PLOT.unten - PLOT.oben)}
          stroke={anteil === 0 ? "var(--linie-stark)" : "var(--linie)"}
          strokeWidth="1"
        />
      ))}

      {/* Der Maßstab der Y-Achse, damit die Kurve eine Größe hat — links oben
          INNERHALB der Fläche. Rechts daneben stünde er halb außerhalb des
          viewBox und würde abgeschnitten. */}
      <text
        x={PLOT.links}
        y={PLOT.oben - 10}
        className="fill-tinte-leise font-mono text-[11px]"
      >
        {proben.length > 0 ? `Maßstab ${formatMbps(skala)} Mbit/s` : "warte auf Daten …"}
      </text>

      {/* Solange keine Zahl da ist: ein Suchlauf, wie ihn ein Gerät zeigt,
          das noch nichts empfängt. Reines CSS, und er endet, sobald die
          erste Probe eintrifft — also bevor der Durchsatz gemessen wird. */}
      {proben.length === 0 && (
        <g className="schreiber-suchlauf">
          <line
            x1={PLOT.links}
            x2={PLOT.links}
            y1={PLOT.oben - 4}
            y2={PLOT.unten}
            stroke="var(--signal-kurve)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      )}

      {flaeche && <path d={flaeche} fill="var(--signal-kurve)" fillOpacity="0.08" />}
      {punkte.length > 1 && (
        <path
          d={linie}
          fill="none"
          stroke="var(--signal-kurve)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* Die Schreibspitze — der einzige Punkt, der sich bewegt. */}
      {spitze && (
        <>
          <circle cx={spitze.x} cy={spitze.y} r="3.5" fill="var(--signal-kurve)" />
          <circle
            cx={spitze.x}
            cy={spitze.y}
            r="5"
            fill="none"
            stroke="var(--signal-kurve)"
            strokeWidth="1.5"
            className="schreiber-spitze"
          />
        </>
      )}

      {/* Grenze und Beschriftung der beiden Abschnitte — von Anfang an da,
          damit der Rahmen vollständig ist und die wachsende Kurve ein
          sichtbares Ziel hat. */}
      <line
        x1={grenze}
        x2={grenze}
        y1={PLOT.oben}
        y2={PLOT.unten}
        stroke="var(--linie-stark)"
        strokeWidth="1"
        strokeDasharray={echteGrenze === null ? "3 4" : undefined}
      />
      {beschriftung(PLOT.links, grenze, "Download")}
      {beschriftung(grenze, PLOT.rechts, "Upload")}
    </svg>
  );
}

/**
 * Das Protokoll — was das Gerät gerade tut, in der Sprache eines Geräts.
 *
 * Feste Höhe für drei Zeilen: Ein Kasten, der mit jeder Meldung wächst,
 * schöbe den halben Schirm nach unten. Bewusst KEIN aria-live: Die Phase
 * darüber ist bereits eine Live-Region, zwei davon lesen sich gegenseitig
 * tot.
 */
function Protokoll({ zeilen }: { zeilen: Zeile[] }) {
  return (
    <div
      className="flex flex-col justify-end gap-0.5 overflow-hidden rounded-lg border border-linie bg-flaeche/70 px-3 py-2 text-left font-mono text-[11px] leading-5 text-tinte-leise"
      style={{ minHeight: `${PROTOKOLL_ZEILEN * 20 + 16}px` }}
    >
      {zeilen.map((z, i) => (
        <p
          key={`${z.zeit}-${z.text}-${i}`}
          className={i === zeilen.length - 1 ? "text-tinte-mittel" : undefined}
        >
          <span className="text-tinte-leise/70">{z.zeit}</span>{" "}
          <span aria-hidden>›</span> {z.text}
        </p>
      ))}
    </div>
  );
}
