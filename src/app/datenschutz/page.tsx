// Datenschutzerklärung — Auskunft nach Art. 13 DSGVO.
//
// GRUNDSATZ DIESER SEITE: Sie beschreibt, was der Code TATSÄCHLICH tut. Nicht,
// was üblich ist, und nicht, was eine Vorlage vorschlägt.
//
// Deshalb kommen die Empfängerliste und die Liste dessen, was auf dem Gerät
// liegt, nicht aus diesem Text, sondern aus src/lib/rechtliches/verarbeiter.ts —
// und dort hängt jeder Eintrag an einem Beleg im Code, den
// verarbeiter.test.mjs nachprüft. Schließt eine spätere Phase einen neuen
// Dienst an, wird der Test rot, statt dass diese Seite still falsch wird.
//
// Was hier als Fließtext steht, ist nur das, was ein Verzeichnis nicht sagen
// kann: der Zusammenhang.

import type { Metadata } from "next";
import { ANBIETER, angabenSindEcht } from "@/lib/rechtliches/anbieter";
import { EMPFAENGER, GERAETEABLAGE } from "@/lib/rechtliches/verarbeiter";
import { Abschnitt, LEISE, PROSA, Rechtsseite } from "@/components/rechtsseite";

export const metadata: Metadata = {
  title: "Datenschutzerklärung — Speedrecht",
  description:
    "Welche Daten Speedrecht verarbeitet, wer sie sieht und wie lange sie bleiben.",
  robots: angabenSindEcht() ? undefined : { index: false, follow: false },
};

const HERVOR = "font-medium text-tinte";

export default function DatenschutzPage() {
  return (
    <Rechtsseite
      titel="Datenschutzerklärung"
      einleitung="Was wir mit deinen Daten machen — und vor allem, was nicht. Diese Seite beschreibt den tatsächlichen Stand der Software, nicht eine Vorlage."
      stand="30. Juli 2026"
    >
      <Abschnitt titel="Das Wichtigste in vier Sätzen">
        <ul className="flex flex-col gap-2">
          {[
            "Deine Messergebnisse speichern wir anonym: ohne IP-Adresse, ohne Kennung, ohne Konto. Sie lassen sich dir nicht zuordnen.",
            "Dein Messverlauf bleibt auf deinem Gerät und erreicht uns nie.",
            "Ein Rechnungsfoto verlässt uns nur, wenn du ausdrücklich zustimmst — gespeichert wird es bei uns nicht.",
            "Es gibt keine Werbe-Cookies und keine Wiedererkennung über Websites hinweg. Deshalb siehst du hier auch keinen Cookie-Banner.",
          ].map((satz) => (
            <li key={satz} className={`${PROSA} flex gap-2`}>
              <span aria-hidden className="text-signal-schrift">
                •
              </span>
              <span>{satz}</span>
            </li>
          ))}
        </ul>
      </Abschnitt>

      <Abschnitt titel="Wer verantwortlich ist">
        <p className={PROSA}>
          <span className={HERVOR}>{ANBIETER.firma}</span>, {ANBIETER.strasse},{" "}
          {ANBIETER.ort}, {ANBIETER.land}. Fragen zu deinen Daten:{" "}
          <span className={HERVOR}>{ANBIETER.email}</span>. Vollständige Angaben im{" "}
          <a
            href="/impressum"
            className="text-signal-schrift underline underline-offset-2"
          >
            Impressum
          </a>
          .
        </p>
      </Abschnitt>

      <Abschnitt titel="Wenn du nur die Seite ansiehst">
        <p className={PROSA}>
          Beim Aufruf jeder Website überträgt dein Gerät technisch notwendige
          Angaben an den Server, darunter deine IP-Adresse, Datum und Uhrzeit,
          die aufgerufene Adresse und die Kennung deines Browsers. Ohne diese
          Angaben könnte dir niemand eine Seite ausliefern. Unser Hoster hält sie
          kurzzeitig in Betriebsprotokollen; wir nutzen sie nicht, um dich zu
          erkennen. Rechtsgrundlage ist unser berechtigtes Interesse am Betrieb
          und an der Sicherheit der Website (Art. 6 Abs. 1 lit. f DSGVO).
        </p>
        <p className={PROSA}>
          Die Schriftarten dieser Seite liefern wir{" "}
          <span className={HERVOR}>von unserem eigenen Server</span> aus. Beim
          Aufruf entsteht{" "}
          <span className={HERVOR}>keine Verbindung zu Google</span> — anders als
          bei vielen Websites, die Schriften direkt dort laden.
        </p>
      </Abschnitt>

      <Abschnitt titel="Die Messung selbst">
        <p className={PROSA}>
          Für die Messung baut dein Gerät eine direkte Verbindung zu unserem
          Messserver in Frankfurt auf und tauscht mit ihm Testdaten aus. Anders
          geht eine Geschwindigkeitsmessung nicht. Dieser Server kennt dabei
          technisch bedingt deine IP-Adresse; sie erscheint kurzzeitig in seinen
          Betriebsprotokollen und wird ausschließlich zur Fehlersuche genutzt.
          Rechtsgrundlage ist die Durchführung der Messung, die du angefordert
          hast (Art. 6 Abs. 1 lit. b DSGVO).
        </p>
        <p className={PROSA}>
          Das <span className={HERVOR}>Ergebnis</span> speichern wir anonym:
          Geschwindigkeit, Laufzeit, übertragene Datenmengen, ob du LAN oder WLAN
          angegeben hast, dein Betriebssystem und dein Browser in grober Form
          sowie der erkannte Anbieter. Ausdrücklich{" "}
          <span className={HERVOR}>nicht</span> gespeichert werden deine
          IP-Adresse und irgendeine Kennung, die zu dir zurückführt. Aus diesen
          Datensätzen lässt sich nicht rekonstruieren, wer gemessen hat.
        </p>
      </Abschnitt>

      <Abschnitt titel="Wofür wir deine IP-Adresse kurz brauchen">
        <p className={PROSA}>
          An zwei Stellen schauen wir sie uns an, ohne sie zu speichern:
        </p>
        <p className={PROSA}>
          <span className={HERVOR}>Anbietererkennung.</span> Aus dem Netzbereich
          deiner IP-Adresse lesen wir ab, bei welchem Anbieter du wahrscheinlich
          bist, damit du ihn nicht selbst suchen musst. Der Abgleich läuft gegen
          eine Tabelle in unserer eigenen Software; die Adresse verlässt uns
          dabei nicht und wird nach dem Nachschlagen verworfen. In der Antwort an
          deinen Browser steht sie nicht.
        </p>
        <p className={PROSA}>
          <span className={HERVOR}>Bremse gegen Missbrauch.</span> Damit niemand
          unsere Messung oder den Rechnungs-Scan im Dauerlauf missbraucht, zählen
          wir Anfragen je Anschluss. Der Zähler lebt nur im Arbeitsspeicher und
          wird weder gespeichert noch protokolliert.
        </p>
        <p className={LEISE}>
          Rechtsgrundlage für beides: berechtigtes Interesse an einem
          funktionierenden, missbrauchsfreien Angebot (Art. 6 Abs. 1 lit. f
          DSGVO).
        </p>
      </Abschnitt>

      <Abschnitt titel="Wenn du deine Rechnung fotografierst">
        <p className={PROSA}>
          Das ist der einzige Schritt, bei dem Daten in ein Land außerhalb der EU
          gehen — deshalb fragen wir dich vorher ausdrücklich, und du kannst
          jederzeit stattdessen deinen Tarif aus einer Liste wählen.
        </p>
        <p className={PROSA}>
          Dein Foto geht einmal an den KI-Dienst Anthropic in den USA, der daraus
          Anbieter, Vertragsname, Kundennummer und Monatsbetrag liest. Bei uns
          wird es <span className={HERVOR}>nicht gespeichert</span>: Es lebt für
          die Dauer dieser einen Anfrage im Arbeitsspeicher und wird danach
          verworfen. Dort wird es nach höchstens 30 Tagen gelöscht (Ausnahme:
          Verdacht auf Missbrauch) und nicht zum Training von KI-Modellen
          verwendet. Ein Verarbeitungsort in Europa steht für diesen Dienst nicht
          zur Verfügung — das ist der Grund, warum wir deine Einwilligung
          brauchen und nicht bloß informieren.
        </p>
        <p className={PROSA}>
          Rechtsgrundlage ist deine Einwilligung, auch für die Übermittlung in
          ein Drittland (Art. 6 Abs. 1 lit. a und Art. 49 Abs. 1 lit. a DSGVO).
          Du kannst sie jederzeit widerrufen; dann nutzt du den Scan einfach
          nicht weiter. Bereits verworfene Fotos können wir nicht mehr löschen —
          sie sind schon weg.
        </p>
      </Abschnitt>

      <Abschnitt titel="Dein Name, wenn du einen Brief schreiben willst">
        <p className={PROSA}>
          Für einen Brief an deinen Anbieter braucht es eine Unterschrift.
          Deshalb fragen wir erst an dieser Stelle — und noch einmal ausdrücklich
          — nach deinem Namen. Er wird entweder von dir eingegeben oder auf
          demselben Weg wie oben aus der Rechnung gelesen. Deine{" "}
          <span className={HERVOR}>Anschrift lesen wir nie</span> aus einer
          Rechnung.
        </p>
        <p className={PROSA}>
          Den Namen speichern wir <span className={HERVOR}>nicht</span>. Der
          fertige Brief entsteht auf deinem Gerät, und er verlässt es nur auf dem
          Weg, den du selbst wählst: Text kopieren, ausdrucken beziehungsweise
          als PDF sichern oder einen E-Mail-Entwurf in deinem eigenen
          Mailprogramm öffnen. Über unsere Server wird kein Brief verschickt.
        </p>
      </Abschnitt>

      <Abschnitt titel="Dein Messverlauf bleibt bei dir">
        <p className={PROSA}>
          Damit über mehrere Tage ein Muster erkennbar wird, merkt sich die App
          deine Messungen — aber im Speicher deines Geräts, nicht bei uns. Diese
          Daten werden nicht übertragen, es gibt kein Konto und keine Kennung,
          die uns erreicht. Du löschst sie, indem du in deinem Browser die Daten
          dieser Website löschst.
        </p>
      </Abschnitt>

      <Abschnitt titel="Wenn du den Wechsel-Vorschlag antippst">
        <p className={PROSA}>
          Dann leiten wir dich zu einem Vergleichsportal weiter und hängen eine
          Zufallskennung an die Adresse, damit uns eine Vermittlung zugerechnet
          werden kann. Diese Kennung sagt nichts über dich; sie steht bei uns
          neben Anbieter, Tarif und Urteil, aber ohne jeden Personenbezug. Deine
          Messwerte übermitteln wir dem Portal nicht — es erfährt nur, dass der
          Klick von unserer Website kam. Ab der Weiterleitung gilt die
          Datenschutzerklärung des Portals.
        </p>
      </Abschnitt>

      <Abschnitt titel="Besucherzahlen">
        <p className={PROSA}>
          Wir zählen Seitenaufrufe, um zu sehen, welche Teile der App genutzt
          werden und wo Menschen abbrechen. Dafür wird{" "}
          <span className={HERVOR}>nichts auf deinem Gerät gespeichert</span> —
          kein Cookie, keine Kennung. Unser Dienstleister bildet serverseitig
          eine täglich wechselnde Kennung, die sich nicht auf dich zurückrechnen
          lässt und die wir nicht mit anderen Daten zusammenführen. Ein Profil
          über dich entsteht nicht, und über Websites hinweg erkennt dich niemand
          wieder. Rechtsgrundlage ist unser berechtigtes Interesse an einer
          Reichweitenmessung ohne Profilbildung (Art. 6 Abs. 1 lit. f DSGVO).
        </p>
      </Abschnitt>

      <Abschnitt titel="Wer außer uns etwas sieht">
        <p className={PROSA}>
          Diese Liste ist vollständig. Sie wird bei jeder Änderung der Software
          maschinell gegen den Programmcode geprüft — käme ein Dienst hinzu, der
          hier fehlt, schlägt die Prüfung fehl.
        </p>
        <div className="flex flex-col gap-3">
          {EMPFAENGER.map((e) => (
            <div
              key={e.name}
              className="rounded-xl border border-linie bg-flaeche-tief px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-tinte">{e.name}</p>
                {e.nurMitEinwilligung && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    nur mit deiner Einwilligung
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm leading-6 text-tinte-mittel">
                {e.zweck}
              </p>
              <dl className="mt-2 flex flex-col gap-1">
                {[
                  ["Ort", e.ort],
                  ["Grundlage", e.grundlage],
                  ["Aufbewahrung", e.aufbewahrung],
                ].map(([bezeichnung, wert]) => (
                  <div key={bezeichnung} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                    <dt className={`${LEISE} sm:w-28 sm:shrink-0`}>{bezeichnung}</dt>
                    <dd className="text-xs leading-6 text-tinte-mittel">{wert}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </Abschnitt>

      <Abschnitt titel="Was auf deinem Gerät liegt">
        <p className={PROSA}>
          Auch diese Liste ist vollständig. Alles darin ist technisch notwendig
          für eine Funktion, die du angefordert hast (§ 25 Abs. 2 Nr. 2 TDDDG) —
          deshalb braucht diese Seite keinen Einwilligungsbanner. Zu Werbezwecken
          wird nichts abgelegt.
        </p>
        <div className="flex flex-col gap-3">
          {GERAETEABLAGE.map((a) => (
            <div
              key={a.schluessel}
              className="rounded-xl border border-linie bg-flaeche-tief px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <code className="rounded bg-linie px-1.5 py-0.5 font-mono text-xs text-tinte">
                  {a.schluessel}
                </code>
                <span className={LEISE}>{a.art}</span>
              </div>
              <p className="mt-1.5 text-sm leading-6 text-tinte-mittel">{a.zweck}</p>
              <p className={`${LEISE} mt-1`}>
                Dauer: {a.dauer} · {a.grundlage}
              </p>
            </div>
          ))}
        </div>
      </Abschnitt>

      <Abschnitt titel="Deine Rechte">
        <p className={PROSA}>
          Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16),
          Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
          Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Eine
          erteilte Einwilligung kannst du jederzeit widerrufen (Art. 7 Abs. 3).
          Schreib uns dazu einfach an {ANBIETER.email}.
        </p>
        <p className={PROSA}>
          <span className={HERVOR}>Ehrlich zur Auskunft:</span> Weil wir deine
          Messungen ohne jede Kennung speichern, können wir sie dir nicht
          zuordnen — es gibt kein Konto, an dem sie hängen. Das ist der Preis der
          Anonymität, und wir halten ihn für den richtigen. Deinen Verlauf hast
          du selbst auf dem Gerät und kannst ihn dort jederzeit löschen.
        </p>
        <p className={PROSA}>
          Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde
          beschweren (Art. 77 DSGVO) — zuständig ist die Behörde deines
          Bundeslandes, deines Arbeitsplatzes oder die für unseren Sitz.
        </p>
      </Abschnitt>

      <Abschnitt titel="Änderungen">
        <p className={PROSA}>
          Wächst die App, wächst diese Erklärung mit. Weil sie maschinell gegen
          den Programmcode geprüft wird, kann sie nicht unbemerkt veralten. Den
          jeweils gültigen Stand findest du unten auf dieser Seite; die
          vollständige Änderungsgeschichte steht öffentlich{" "}
          <a
            href="https://github.com/macbot26-boop/speedrecht"
            className="text-signal-schrift underline underline-offset-2"
          >
            im Quellcode
          </a>
          .
        </p>
      </Abschnitt>
    </Rechtsseite>
  );
}
