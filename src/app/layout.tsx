import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Fusszeile } from "@/components/fusszeile";
import { Kopfzeile } from "@/components/kopfzeile";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import "./globals.css";

// Alle drei Schriften liefert next/font vom eigenen Server aus — beim Aufruf
// entsteht keine Verbindung zu Google. Die Datenschutzerklärung verspricht
// genau das; wer hier eine Schrift ergänzt, muss sie auf demselben Weg laden.
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

// Die „Stimme" für Überschriften und Urteilssätze. Die optische Achse (opsz)
// ist bewusst dabei: Erst sie gibt Fraunces in großen Graden den Charakter.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Speedrecht — Bekommst du das Internet, für das du bezahlst?",
  description:
    "Misst deine echte Internet-Geschwindigkeit mit der offiziellen Messmethodik, vergleicht sie mit deinem Vertrag und hilft dir, Konsequenzen zu ziehen.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  // Die Browserleiste folgt dem Papier, nicht dem Akzent — ruhiger Rahmen
  // statt blauer Banderole, in beiden Modi.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e13" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${instrumentSans.variable} ${fraunces.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Kopfzeile />
        {children}
        {/* Auf jeder Seite, nicht je Seite einzeln: Das Impressum muss von
            überall erreichbar sein. Siehe components/fusszeile.tsx. */}
        <Fusszeile />
        <ServiceWorkerRegistration />
        {/* Reichweitenmessung ohne Cookie — es wird nichts auf dem Gerät
            abgelegt, deshalb ohne Einwilligungsbanner. Beschrieben in
            lib/rechtliches/verarbeiter.ts und auf /datenschutz. */}
        <Analytics />
      </body>
    </html>
  );
}
