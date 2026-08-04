import type { Metadata } from "next";
import { MessungFlow } from "@/components/messung-flow";
import { partnerAusUmgebung } from "@/lib/wechsel/partner";

export const metadata: Metadata = {
  title: "Messung — Speedrecht",
  description:
    "Miss deine echte Internet-Geschwindigkeit mit der offiziellen Messmethodik der Breitbandmessung.",
};

export default function MessungPage() {
  // Serverseitig gelesen und bewusst nur der NAME: Die Partner-Adresse trägt
  // unsere Partnerkennung und hat im Browser-Bundle nichts zu suchen. Ist
  // kein Partner eingerichtet, steht hier null — und der Wechsel-Vorschlag
  // erscheint gar nicht erst.
  //
  // Diese Seite wird beim Bauen vorgerendert. Wer die Umgebungsvariablen in
  // Vercel neu setzt, muss deshalb einmal neu bereitstellen, damit der
  // Vorschlag erscheint.
  const wechselPartner = partnerAusUmgebung()?.name ?? null;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-14 sm:px-6">
      <main className="flex w-full flex-col items-center">
        <MessungFlow wechselPartner={wechselPartner} />
      </main>
    </div>
  );
}
