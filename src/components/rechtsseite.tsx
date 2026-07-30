// Gemeinsames Gerüst für Impressum und Datenschutzerklärung.
//
// Warum ein eigenes Gerüst: Rechtstexte sind lang, und lange Texte werden nur
// gelesen, wenn Lesebreite, Zwischenüberschriften und Abstände stimmen. Beide
// Seiten teilen sich hier dieselben Maße — sonst driftet die zweite Seite
// unweigerlich von der ersten weg.
//
// Der Warnbalken oben ist kein Schmuck: Solange Beispieldaten im Impressum
// stehen, MUSS jeder, der die Seite sieht, das sofort erkennen. Er hängt an
// derselben Prüfung, die auch über die Erreichbarkeit ohne Zugangscode
// entscheidet (`angabenSindEcht` in lib/rechtliches/anbieter.ts) — eine
// Wahrheit, zwei Wirkungen, kein Auseinanderlaufen möglich.

import Link from "next/link";
import { angabenSindEcht } from "@/lib/rechtliches/anbieter";

/** Fließtext — überall gleich, damit die Seiten ruhig wirken. */
export const PROSA = "text-sm leading-7 text-zinc-700 dark:text-zinc-300";

/** Kleingedrucktes: Stand-Datum, Hinweise am Rand. */
export const LEISE = "text-xs leading-6 text-zinc-500 dark:text-zinc-500";

export function Rechtsseite({
  titel,
  einleitung,
  stand,
  children,
}: {
  titel: string;
  /** Ein Satz, der die Seite einordnet — vor der ersten Überschrift. */
  einleitung: string;
  /** Wann der Text zuletzt geändert wurde, z. B. „30. Juli 2026". */
  stand: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col bg-white px-6 py-12 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        {!angabenSindEcht() && <Beispielwarnung />}

        <header className="flex flex-col gap-3">
          <Link
            href="/"
            className="self-start text-sm font-medium text-[#0b57d0] hover:underline dark:text-blue-400"
          >
            ← Zurück
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {titel}
          </h1>
          <p className={PROSA}>{einleitung}</p>
        </header>

        {children}

        <p className={LEISE}>Stand: {stand}</p>
      </main>
    </div>
  );
}

/**
 * Der Warnbalken für den Zustand vor dem Eintragen der echten Firmendaten.
 *
 * Bewusst laut und bewusst ohne Beschönigung: Wer diese Seite in der Testphase
 * sieht, soll sie nicht für eine gültige Rechtsauskunft halten.
 */
function Beispielwarnung() {
  return (
    <div
      role="status"
      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40"
    >
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
        Beispieldaten — noch nicht gültig
      </p>
      <p className="mt-1 text-sm leading-6 text-amber-900/80 dark:text-amber-200/80">
        Diese Seite zeigt Platzhalter statt echter Angaben. Sie ist noch nicht
        öffentlich erreichbar und ersetzt kein Impressum. Sobald die echten
        Firmendaten eingetragen sind, verschwindet dieser Hinweis.
      </p>
    </div>
  );
}

/** Ein Abschnitt mit Zwischenüberschrift. */
export function Abschnitt({
  titel,
  children,
}: {
  titel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{titel}</h2>
      {children}
    </section>
  );
}

/**
 * Eine Angabe mit Bezeichnung — für Blöcke wie „Registergericht: …".
 *
 * Als Definitionsliste, nicht als Tabelle: Bildschirmleser lesen sie damit als
 * Paare vor, und auf dem Handy bricht sie natürlich um.
 */
export function Angabenliste({ eintraege }: { eintraege: [string, string][] }) {
  return (
    <dl className="flex flex-col gap-2">
      {eintraege.map(([bezeichnung, wert]) => (
        <div key={bezeichnung} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
          <dt className="text-sm font-medium text-zinc-500 sm:w-44 sm:shrink-0 dark:text-zinc-500">
            {bezeichnung}
          </dt>
          <dd className="text-sm text-zinc-900 dark:text-zinc-100">{wert}</dd>
        </div>
      ))}
    </dl>
  );
}
