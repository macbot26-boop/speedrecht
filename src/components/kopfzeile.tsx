"use client";

// Die Kopfzeile — bewusst federleicht: Wortmarke, ein Verweis, ein Knopf.
//
// Client-Komponente aus genau einem Grund: Auf /messung wäre ein „Jetzt
// messen"-Knopf im Kopf absurd (die Messung läuft darunter bzw. ist einen
// Tap entfernt) — er wird dort über den Pfad ausgeblendet. Alles andere ist
// statisch.
//
// Auf der Messseite verweist auch „So funktioniert’s" nicht: Während einer
// laufenden Messung soll nichts zum Wegnavigieren einladen. Die Wortmarke
// als Weg zurück genügt.

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Kopfzeile() {
  const pathname = usePathname();
  // Auf /messung lädt nichts zum Wegnavigieren ein; auf /zugang führte der
  // Knopf nur im Kreis durchs Gate. Ohne Inhalt entfällt das nav-Element
  // ganz — ein leeres Navigations-Landmark würde vorgelesen als Navigation
  // ohne Ziele.
  const ohneNavigation = pathname === "/messung" || pathname === "/zugang";

  return (
    <header className="sticky top-0 z-40 border-b border-linie bg-papier/85 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-5 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-tinte transition hover:opacity-80"
        >
          <Image src="/icon.svg" alt="" width={26} height={26} priority />
          <span className="font-display text-[1.15rem] font-semibold tracking-tight">
            Speedrecht
          </span>
        </Link>

        {!ohneNavigation && (
          <nav aria-label="Hauptnavigation" className="flex items-center gap-3 sm:gap-5">
            <Link
              href="/#so-funktionierts"
              className="hidden text-sm font-medium text-tinte-mittel transition hover:text-tinte sm:block"
            >
              So funktioniert’s
            </Link>
            <Link
              href="/messung?start=1"
              className="rounded-full bg-signal px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-signal-aktiv"
            >
              Jetzt messen
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
