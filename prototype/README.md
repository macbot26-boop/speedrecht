# Breitband-Messwerkstatt

A small local web app to answer one question: **how close can a browser/PWA speed test get
to a proper wired (LAN) reference measurement?** It also gives a rough early read on whether
your internet provider under-delivers ("Minderungs-Check").

Everything runs locally on the Mac. Results are stored in `data/results.jsonl` — one line per
measurement. Nothing leaves the machine except the speed-test traffic itself
(Cloudflare test servers / Apple's networkQuality servers / Ookla if installed).

## Start

```bash
npm start
```

Then open http://localhost:4280 — or scan the QR code on the iPhone (same Wi-Fi):

```bash
npm run qr
```

## The pages

| Page | What it does |
| --- | --- |
| `/` | Run a speed measurement in the browser (two engines: Cloudflare's open-source library and a transparent home-made one) |
| `/ergebnisse` | All stored results + medians per device/network/engine, each compared to the wired reference (%) |
| `/check` | "Minderungs-Check": enter the three contract speeds from your provider's Produktinformationsblatt and see whether the collected data shows signs of under-delivery according to the three official BNetzA criteria |

## Wired reference measurement (Mac, LAN cable plugged in)

```bash
npm run reference
```

Uses Apple's built-in `networkQuality` (and Ookla's `speedtest` CLI if installed). The script
detects whether the Mac is on LAN or Wi-Fi and stores that honestly with each result — it warns
if you run it without a cable. Repeat ~3× for a stable median.

## After changing `src/engine-entry.js`

```bash
npm run build:engine
```

Rebuilds `public/vendor/cf-speedtest.js` (the bundled Cloudflare measurement library).

## Legal note

Only the official [Breitbandmessung Desktop-App](https://breitbandmessung.de) of the
Bundesnetzagentur produces legally usable evidence (30 measurements via LAN on 3 calendar days).
This project is for quick pre-assessment and for validating how trustworthy browser
measurements are.
