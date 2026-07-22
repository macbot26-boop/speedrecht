# Speedrecht

**Bekommst du das Internet, für das du bezahlst?** Speedrecht misst deine echte
Internet-Geschwindigkeit mit der offiziellen Messmethodik, vergleicht sie mit deinem Vertrag
und hilft dir, Konsequenzen zu ziehen — mit fast keiner Tipparbeit.

> **Status: in Entwicklung (Phase 0 von 8) — noch nicht öffentlich nutzbar.**

## Was Speedrecht können wird

- **Messung nach offizieller Methodik** — dieselbe Open-Source-Mess-Engine, die auch die
  Breitbandmessung der Bundesnetzagentur verwendet. Ehrlich gekennzeichnet:
  *„Anhaltspunkt, kein rechtsgültiger Nachweis."*
- **Automatischer Vertragsabgleich** — Anbieter wird aus der Verbindung erkannt, Tarif
  vorgeschlagen, Vertragswerte vorausgefüllt. Du tippst (fast) nichts.
- **Zwei Wege:** zu einem Anbieter wechseln, der liefert — oder deinen Anbieter mit einer
  vorbereiteten Kulanz-Anfrage um Entgegenkommen bitten.
- **Eskalationsleiter** bis ganz nach oben: Nur die offizielle Desktop-App der
  Bundesnetzagentur erzeugt rechtsgültige Nachweise. Wir führen Schritt für Schritt dorthin —
  wir ersetzen sie nie.

## Warum Open Source?

Die offizielle Mess-Engine steht unter der AGPLv3-Lizenz — deshalb ist auch dieser Code
öffentlich. Wir machen daraus ein Feature: **Unsere Messung ist überprüfbar.** Jeder kann hier
nachlesen, dass wir Ergebnisse weder schönen noch schlechtrechnen.

Speedrecht ist ein unabhängiges Projekt und steht in keiner Verbindung zur Bundesnetzagentur.

## Struktur

| Ordner | Inhalt |
|---|---|
| `/` | Die App (Next.js, PWA) |
| `prototype/` | Die „Messwerkstatt": unser Validierungs-Labor — wie nah kommt eine Browser-Messung an eine LAN-Referenzmessung? |

## Entwicklung

```bash
npm install
npm run dev
```

## Lizenz

[AGPLv3](LICENSE)
