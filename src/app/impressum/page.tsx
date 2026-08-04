// Impressum — Pflichtangaben nach § 5 DDG (dem Gesetz, das 2024 das TMG
// ersetzt hat).
//
// Alle Angaben kommen aus src/lib/rechtliches/anbieter.ts. Hier steht kein
// einziger Wert doppelt: Ein Impressum, dessen Anschrift von der in der
// Datenschutzerklärung abweicht, ist ein Mangel — und niemand merkt ihn beim
// Ansehen.

import type { Metadata } from "next";
import { ANBIETER, angabenSindEcht } from "@/lib/rechtliches/anbieter";
import { Abschnitt, Angabenliste, PROSA, Rechtsseite } from "@/components/rechtsseite";

// Solange Beispieldaten drinstehen, darf die Seite nicht in Suchmaschinen
// landen — auch dann nicht, wenn sie versehentlich erreichbar wird.
export const metadata: Metadata = {
  title: "Impressum — Speedrecht",
  description: "Anbieterkennzeichnung nach § 5 DDG.",
  robots: angabenSindEcht() ? undefined : { index: false, follow: false },
};

export default function ImpressumPage() {
  const angaben: [string, string][] = [
    ["Anbieter", ANBIETER.firma],
    ["Vertreten durch", ANBIETER.vertreten],
    ["Anschrift", `${ANBIETER.strasse}, ${ANBIETER.ort}, ${ANBIETER.land}`],
    ["E-Mail", ANBIETER.email],
    ["Registergericht", ANBIETER.registergericht],
    ["Registernummer", ANBIETER.hrb],
    // Die USt-IdNr. ist nur anzugeben, wenn es eine gibt (§ 27a UStG) —
    // deshalb fällt die Zeile weg statt leer zu bleiben.
    ...(ANBIETER.ustIdNr
      ? ([["Umsatzsteuer-ID", ANBIETER.ustIdNr]] as [string, string][])
      : []),
  ];

  return (
    <Rechtsseite
      titel="Impressum"
      einleitung="Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)."
      stand="30. Juli 2026"
    >
      <Abschnitt titel="Anbieter">
        <Angabenliste eintraege={angaben} />
      </Abschnitt>

      <Abschnitt titel="Verantwortlich für den Datenschutz">
        <p className={PROSA}>
          Fragen zu deinen Daten beantworten wir unter{" "}
          <span className="font-medium text-tinte">{ANBIETER.email}</span>.
          Was wir verarbeiten und was nicht, steht in der{" "}
          <a
            href="/datenschutz"
            className="text-signal-schrift underline underline-offset-2"
          >
            Datenschutzerklärung
          </a>
          .
        </p>
      </Abschnitt>

      <Abschnitt titel="Was Speedrecht ist — und was nicht">
        <p className={PROSA}>
          Speedrecht misst deine Internet-Geschwindigkeit nach der offiziellen
          Messmethodik und vergleicht sie mit deinem Vertrag. Wir sind{" "}
          <span className="font-medium text-tinte">unabhängig</span> und
          gehören zu keinem Anbieter und keiner Behörde.
        </p>
        <p className={PROSA}>
          Rechtsgültige Nachweise erzeugt ausschließlich die Desktop-App der
          Bundesnetzagentur unter{" "}
          <a
            href="https://breitbandmessung.de"
            className="text-signal-schrift underline underline-offset-2"
          >
            breitbandmessung.de
          </a>
          . Unsere Messung ist ein Anhaltspunkt, kein Beweismittel. Wir leisten
          keine Rechtsberatung und versprechen kein Ergebnis gegenüber deinem
          Anbieter.
        </p>
      </Abschnitt>

      <Abschnitt titel="Haftung für Inhalte und Verweise">
        <p className={PROSA}>
          Wir erstellen die Inhalte dieser Seiten mit Sorgfalt, können für ihre
          Richtigkeit und Aktualität aber keine Gewähr übernehmen. Tarifdaten
          stammen aus den Produktinformationsblättern der Anbieter; maßgeblich
          ist immer dein eigener Vertrag.
        </p>
        <p className={PROSA}>
          Für Inhalte fremder Websites, auf die wir verweisen, sind deren
          Betreiber verantwortlich. Zum Zeitpunkt der Verlinkung waren dort keine
          Rechtsverstöße erkennbar. Werden uns Rechtsverstöße bekannt, entfernen
          wir den Verweis.
        </p>
      </Abschnitt>

      <Abschnitt titel="Verweise mit Vergütung">
        <p className={PROSA}>
          Wenn wir dir einen Anbieterwechsel vorschlagen und du den Vorschlag
          nutzt, erhalten wir unter Umständen eine Vermittlungsprovision. Für
          dich entstehen dadurch keine Mehrkosten. Solche Verweise kennzeichnen
          wir an der Stelle, an der sie erscheinen — die Vergütung beeinflusst
          weder unsere Messung noch das Urteil über deinen Anschluss.
        </p>
      </Abschnitt>

      <Abschnitt titel="Urheberrecht und Quellcode">
        <p className={PROSA}>
          Der Quellcode von Speedrecht ist unter der AGPLv3 veröffentlicht und
          liegt offen{" "}
          <a
            href="https://github.com/macbot26-boop/speedrecht"
            className="text-signal-schrift underline underline-offset-2"
          >
            auf GitHub
          </a>
          . Jeder kann dort nachlesen, wie wir messen und rechnen. Texte und
          Grafiken dieser Website bleiben urheberrechtlich geschützt.
        </p>
      </Abschnitt>

      <Abschnitt titel="Verbraucherstreitbeilegung">
        <p className={PROSA}>
          Wir sind nicht verpflichtet und nicht bereit, an
          Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
          teilzunehmen (§ 36 Verbraucherstreitbeilegungsgesetz). Deine
          gesetzlichen Rechte bleiben davon unberührt — melde dich einfach direkt
          bei uns, wir kümmern uns.
        </p>
      </Abschnitt>
    </Rechtsseite>
  );
}
