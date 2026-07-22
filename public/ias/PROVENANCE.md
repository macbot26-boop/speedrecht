# Herkunft dieser Dateien / Provenance

Dieses Verzeichnis enthält die **offizielle Open-Source-Messbibliothek** der
deutschen Breitbandmessung ("IAS-Client"), entwickelt von der zafaco GmbH im
Auftrag der Bundesnetzagentur. Es ist derselbe Messkern, den auch die offizielle
Desktop-App verwendet.

- Upstream: https://github.com/breitbandmessung/ias-client-js
- Commit: `8af9733551d1094d280bb9c990fa5618f2fa6696` (2025-02-06, IAS-Client 2.4)
- Lizenz: AGPLv3 (siehe [LICENSE](./LICENSE)) — Copyright (C) 2016–2025 zafaco GmbH

## Übernommene Dateien — unverändert (Byte-für-Byte, aus `src/` des Upstreams)

| Datei | SHA-256 |
|---|---|
| `ias_client.js` | `2e58cdadd3257345087289cc3b881c4babc067a3d9cdf3bff7521077af2e74b3` |
| `control.js` | `f860c7bb7d89379b893caa97a4b1b70b8e453c2c0a0dcf3526780793f90667f2` |
| `ip.js` | `a6360c187940083f114de5bdcb34d0a2de26665d394b2128f512bc17b143ec9c` |
| `post.js` | `1422571ad99afabb9dc1fc66b54d99f6afe971f831e2cf5a835e3bad0693306a` |
| `worker.js` | `97fae764e8d23107799fc2598600bbb29f47afabed1b0fdd10523234b692d339` |
| `libs/tool.js` | `536d89a5d1422fd22451d10bb02e98add052f693ebe287ba783c520058870dfe` |
| `libs/ua-parser.min.js` | `abe52f66a592550040c0d4d1544f79b0d7841637341ab1fc11a9ad30f16c83c9` |

Nicht übernommen: `config.js` (Platzhalter-Konfiguration; Speedrecht übergibt die
Parameter zur Laufzeit selbst) und `index.html` (Demo-Seite des Upstreams).

## Wichtig — Einordnung

Diese Bibliothek misst mit der **offiziellen Methodik** (4 parallele Streams,
10-Sekunden-Fenster), aber gegen **unsere eigenen Messserver**, nicht gegen die
Server der Bundesnetzagentur. Ergebnisse von Speedrecht sind deshalb ein
**Indiz, kein Rechtsbeweis**. Rechtsgültige Nachweise erzeugt ausschließlich die
offizielle Desktop-App unter https://breitbandmessung.de.

## AGPLv3-Konformität

Speedrecht steht vollständig unter AGPLv3; der komplette Quellcode ist unter
https://github.com/macbot26-boop/speedrecht öffentlich. Die Dateien hier bleiben
unverändert; jede zukünftige Änderung würde in diesem Dokument ausgewiesen.
