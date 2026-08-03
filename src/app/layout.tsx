import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Fusszeile } from "@/components/fusszeile";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Speedrecht — Bekommst du das Internet, für das du bezahlst?",
  description:
    "Misst deine echte Internet-Geschwindigkeit mit der offiziellen Messmethodik, vergleicht sie mit deinem Vertrag und hilft dir, Konsequenzen zu ziehen.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0b57d0",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
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
