# Lokaler Entwicklungs-Messserver (ias-server)

Baut und startet den **offiziellen C++-Messserver** der Breitbandmessung
(zafaco GmbH / Bundesnetzagentur, AGPLv3) lokal in Docker — damit die
Messung in der Entwicklung ohne gemieteten Server funktioniert.

## Nutzung

```bash
docker compose up -d --build
```

Danach lauscht der Peer auf **ws://dev.localhost:8081** (Browser lösen
`*.localhost` immer auf die eigene Maschine auf). Die App-Standardwerte
(`src/lib/ias/use-ias-measurement.ts`) zeigen ohne weitere Konfiguration
auf genau diesen Peer.

Schnelltest:

```bash
curl http://dev.localhost:8081/ip
```

→ antwortet mit `{"client": "…", "cmd": "ip_report"}`.

Stoppen: `docker compose down`.

## Hinweise

- Quellen sind auf feste Commits gepinnt (siehe `Dockerfile`), Build ist
  reproduzierbar; läuft nativ auf Apple Silicon (arm64).
- Lokal wird unverschlüsselt (`ws://`) gemessen — im Produktivbetrieb ist
  TLS (`wss://` mit echtem Zertifikat) Pflicht; das übernimmt das
  Produktions-Setup in Phase 1/PR 3.
- Wichtig für ehrliche Zahlen: Eine Messung gegen die eigene Maschine
  misst NICHT deine Internetleitung — sie dient nur der Funktionsprüfung
  der Messtechnik. Echte Zahlen liefert erst der Frankfurt-Peer.
