import Link from "next/link";
import { Messschrieb } from "@/components/messschrieb";
import tarifDaten from "@/lib/tarife/tarife.generated.json";

// Die Zahlen der Seite kommen aus den Daten selbst, nie aus dem Fließtext:
// Ein von Hand gepflegtes „über 1.000 Tarife" wäre nach dem nächsten
// Daten-Auffrischen still falsch. Auch die Anbieterzahl kommt aus der
// Tarif-Tabelle — die Erkennungsliste führt mehr Anbieter, als Tarife
// hinterlegt sind, und die Behauptung hier muss zur Tabelle passen.
// Server-Komponente — das JSON bleibt auf dem Server, in den Browser gehen
// nur die fertigen Ziffern.
//
// Tausenderpunkt von Hand statt über Intl.NumberFormat: Fehlen einer Umgebung
// die deutschen Sprachdaten, fällt Intl STILL auf Englisch zurück und schriebe
// „1,020" — dieselbe Falle, die anzeige.ts ausführlich begründet.
const TARIF_ANZAHL = String(tarifDaten.tarife.length).replace(/\B(?=(\d{3})+$)/g, ".");
const ANBIETER_ANZAHL = new Set(tarifDaten.tarife.map((t) => t.anbieter)).size;

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* ---- Hero: die Frage, die Antwortmaschine daneben ---- */}
      <section className="relative overflow-hidden px-5 pb-16 pt-12 sm:px-6 sm:pt-16 lg:pb-24">
        {/* Ein leiser Lichtschein hinter dem Messschrieb — Papier bleibt Papier. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-[-10%] h-[480px] w-[640px] rounded-full opacity-70 blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, var(--signal-hauch), transparent 70%)",
          }}
        />

        <div className="mx-auto grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
          <div className="flex flex-col items-start gap-6">
            <h1 className="font-display text-[2.6rem] font-semibold leading-[1.08] tracking-tight text-tinte sm:text-[3.4rem]">
              Bekommst du das Internet, für das du bezahlst?
            </h1>
            <p className="max-w-xl text-lg leading-8 text-tinte-mittel">
              Speedrecht misst deine echte Geschwindigkeit mit der offiziellen
              Messmethodik, vergleicht sie mit deinem Vertrag und hilft dir,
              Konsequenzen zu ziehen — mit fast keiner Tipparbeit.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/messung?start=1"
                className="rounded-full bg-signal px-8 py-3.5 text-lg font-semibold text-white shadow-[0_10px_24px_-10px_var(--signal)] transition hover:bg-signal-aktiv"
              >
                Jetzt messen
              </Link>
              <a
                href="#so-funktionierts"
                className="text-sm font-medium text-signal-schrift underline decoration-linie-stark underline-offset-4 transition hover:decoration-current"
              >
                So funktioniert’s
              </a>
            </div>

            <span className="inline-flex items-center gap-2 rounded-full border border-linie bg-flaeche px-4 py-1.5 font-mono text-xs font-medium text-tinte-mittel">
              <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
              Frühe Testversion
            </span>
          </div>

          <Messschrieb />
        </div>
      </section>

      {/* ---- So funktioniert’s: drei Schritte, nüchtern nummeriert ---- */}
      <section
        id="so-funktionierts"
        className="scroll-mt-20 border-t border-linie bg-flaeche/60 px-5 py-16 sm:px-6 lg:py-20"
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-tinte">
            So funktioniert’s
          </h2>
          <ol className="grid gap-6 md:grid-cols-3">
            <Schritt nummer="01" titel="Messen">
              Ein Tap, etwa eine halbe Minute. Gemessen wird mit der offiziellen
              Open-Source-Messmethodik der Breitbandmessung — vier parallele
              Datenströme gegen unseren eigenen Messserver.
            </Schritt>
            <Schritt nummer="02" titel="Vergleichen">
              Dein Vertrag, beim Namen genannt: {TARIF_ANZAHL} Tarife von{" "}
              {ANBIETER_ANZAHL} Anbietern sind hinterlegt — mit den zugesicherten
              Werten aus den offiziellen Produktinformationsblättern. Das Urteil
              ist Klartext: passt oder passt nicht.
            </Schritt>
            <Schritt nummer="03" titel="Handeln">
              Bei schlechtem Urteil führt dich eine Leiter Schritt für Schritt:
              erst per Kabel gegenprüfen, dann der fertig geschriebene Brief an
              deinen Anbieter, dann die offizielle Messung — in genau dieser
              Reihenfolge.
            </Schritt>
          </ol>
        </div>
      </section>

      {/* ---- Warum Speedrecht: vier ruhige Karten ---- */}
      <section className="border-t border-linie px-5 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-tinte">
            Ein Messgerät, kein Marktplatz
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <Merkmal titel="Offizielle Messmethodik" symbol={<SymbolTacho />}>
              Kein hauseigener Speedtest: Speedrecht misst mit der offiziellen
              Open-Source-Messmethodik der Breitbandmessung — derselben Technik,
              mit der in Deutschland Anschlüsse amtlich geprüft werden.
            </Merkmal>
            <Merkmal titel="Messreihe statt Schnappschuss" symbol={<SymbolSchrieb />}>
              Das Gesetz schaut auf mehrere Messtage, nicht auf einen Moment.
              Deine Messreihe wächst mit jeder Messung — und bleibt dabei auf
              deinem Gerät.
            </Merkmal>
            <Merkmal titel="Fast keine Tipparbeit" symbol={<SymbolTipp />}>
              Anbieter erkannt, Tarif per Tap gewählt — oder per Foto der
              Rechnung. Kein Konto, keine Adresse, keine Formulare.
            </Merkmal>
            <Merkmal titel="Offen und überprüfbar" symbol={<SymbolCode />}>
              Der komplette Quellcode ist öffentlich (AGPLv3). Jeder kann
              nachlesen, wie gemessen und geurteilt wird — Vertrauen durch
              Nachprüfbarkeit, nicht durch Behauptung.
            </Merkmal>
          </div>
        </div>
      </section>

      {/* ---- Die Rechtslage: ein Paragraf, der ruhig dastehen kann ---- */}
      <section className="border-t border-linie bg-flaeche/60 px-5 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-12">
          <div className="flex flex-col gap-3">
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-tinte-leise">
              Die Rechtslage
            </span>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-tinte">
              Zu langsam ist nicht Pech — es ist geregelt.
            </h2>
          </div>
          <div className="flex flex-col gap-4">
            <blockquote className="border-l-2 border-signal pl-5">
              <p className="font-display text-xl leading-relaxed text-tinte sm:text-2xl">
                Liefert dein Anschluss erheblich weniger, als der Vertrag
                zusichert, darfst du die Rechnung kürzen — oder außerordentlich
                kündigen.
              </p>
              <cite className="mt-2 block font-mono text-xs not-italic text-tinte-leise">
                § 57 Abs. 4 TKG, sinngemäß
              </cite>
            </blockquote>
            <p className="text-sm leading-7 text-tinte-mittel">
              Den rechtsgültigen Nachweis erbringt allein die offizielle{" "}
              <a
                href="https://breitbandmessung.de"
                target="_blank"
                rel="noreferrer"
                className="text-signal-schrift underline underline-offset-2"
              >
                Breitbandmessung
              </a>{" "}
              der Bundesnetzagentur — ein Desktop-Programm, drei Messtage, je
              zehn Messungen. Speedrecht zeigt dir vorher, ob sich dieser
              Aufwand lohnt.
            </p>
          </div>
        </div>
      </section>

      {/* ---- Schluss: Ehrlichkeit + der eine Tap ---- */}
      <section className="border-t border-linie px-5 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-tinte">
            Bereit? Ein Tap genügt.
          </h2>
          <Link
            href="/messung?start=1"
            className="rounded-full bg-signal px-8 py-3.5 text-lg font-semibold text-white shadow-[0_10px_24px_-10px_var(--signal)] transition hover:bg-signal-aktiv"
          >
            Jetzt messen
          </Link>
          <p className="max-w-md text-sm leading-6 text-tinte-leise">
            Ehrlichkeit vorab: Nur die offizielle{" "}
            <a
              href="https://breitbandmessung.de"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-linie-stark underline-offset-2 transition hover:text-tinte-mittel"
            >
              Breitbandmessung
            </a>{" "}
            der Bundesnetzagentur erzeugt rechtsgültige Nachweise. Speedrecht ist
            unabhängig, ersetzt sie nicht — und ist{" "}
            <a
              href="https://github.com/macbot26-boop/speedrecht"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-linie-stark underline-offset-2 transition hover:text-tinte-mittel"
            >
              Open Source
            </a>
            , damit jeder unsere Messung überprüfen kann.
          </p>
        </div>
      </section>
    </div>
  );
}

/** Ein nummerierter Schritt der „So funktioniert’s"-Reihe. */
function Schritt({
  nummer,
  titel,
  children,
}: {
  nummer: string;
  titel: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-linie bg-flaeche p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <span className="font-mono text-xs font-medium tracking-[0.14em] text-signal-schrift">
        {nummer}
      </span>
      <h3 className="font-display text-xl font-semibold text-tinte">{titel}</h3>
      <p className="text-sm leading-7 text-tinte-mittel">{children}</p>
    </li>
  );
}

/** Eine „Warum Speedrecht"-Karte mit kleinem Instrumenten-Symbol. */
function Merkmal({
  titel,
  symbol,
  children,
}: {
  titel: string;
  symbol: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-linie bg-flaeche p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <span className="text-signal-schrift" aria-hidden>
        {symbol}
      </span>
      <h3 className="text-base font-semibold text-tinte">{titel}</h3>
      <p className="text-sm leading-7 text-tinte-mittel">{children}</p>
    </div>
  );
}

/* Vier kleine Strichzeichnungen im Stil des Instruments — bewusst von Hand
   statt aus einem Icon-Paket: kein neues Paket, ein Strichgewicht überall. */

function SymbolTacho() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4.5 19a10 10 0 1 1 19 0" />
      <path d="M14 16.5 19 11" />
      <circle cx="14" cy="17" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SymbolSchrieb() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4.5" width="21" height="19" rx="2.5" />
      <path d="M7 17.5l3.5-4 3 2.5 4-5.5 3.5 3" />
    </svg>
  );
}

function SymbolTipp() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="14" cy="14" r="3.2" />
      <path d="M14 4.5v3M14 20.5v3M4.5 14h3M20.5 14h3" />
    </svg>
  );
}

function SymbolCode() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m10 8-6 6 6 6M18 8l6 6-6 6" />
    </svg>
  );
}
