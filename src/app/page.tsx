import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <Image src="/icon.svg" alt="Speedrecht" width={72} height={72} priority />

        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#0b57d0] dark:text-blue-400">
            Speedrecht
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
            Bekommst du das Internet, für das du bezahlst?
          </h1>
          <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Speedrecht misst deine echte Geschwindigkeit mit der offiziellen
            Messmethodik, vergleicht sie mit deinem Vertrag und hilft dir,
            Konsequenzen zu ziehen — mit fast keiner Tipparbeit.
          </p>
        </div>

        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-1.5 text-sm font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
          In Entwicklung — noch nicht nutzbar
        </span>

        <p className="max-w-md text-sm leading-6 text-zinc-500 dark:text-zinc-500">
          Ehrlichkeit vorab: Nur die offizielle{" "}
          <a
            href="https://breitbandmessung.de"
            className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Breitbandmessung
          </a>{" "}
          der Bundesnetzagentur erzeugt rechtsgültige Nachweise. Speedrecht ist
          unabhängig, ersetzt sie nicht — und ist{" "}
          <a
            href="https://github.com/macbot26-boop/speedrecht"
            className="underline decoration-zinc-300 underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Open Source
          </a>
          , damit jeder unsere Messung überprüfen kann.
        </p>
      </main>
    </div>
  );
}
