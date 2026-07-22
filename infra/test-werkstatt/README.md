# Test-Werkstatt — Speedrecht auf einem Mac im Heimnetz anfassen

Startet die komplette App samt lokalem Messserver auf einem Mac, sodass man
**vom Handy im selben WLAN** den ganzen Ablauf durchspielen kann: Ein-Tap-
Messung, Chips, Ergebnis, Anbieter-Karte, anonyme Speicherung.

> **Ehrlichkeit:** Die gemessenen Zahlen zeigen das **Heim-WLAN** zwischen
> Handy und Mac — nicht die Internet-Leitung. Die Test-Werkstatt ist zum
> Produkt-Testen da; belastbare Leitungs-Messungen kommen erst mit dem
> echten Messserver (und Rechtsbeweise nur von der offiziellen App).

## Einmalige Einrichtung (anderes MacBook)

1. **Docker Desktop** installieren und starten: <https://www.docker.com/products/docker-desktop/>
2. **Node.js 22** installieren: <https://nodejs.org>
3. Projekt holen:

   ```bash
   git clone https://github.com/macbot26-boop/speedrecht.git
   cd speedrecht
   npm ci
   ```

4. Die Datei **`.env.local`** vom Haupt-MacBook in den Projektordner kopieren
   (z. B. per AirDrop). Sie enthält die Datenbank-Zugänge, ist absichtlich
   nicht im Repo und wird fürs Speichern + die Anbieter-Karte gebraucht.

## Starten (jedes Mal)

```bash
sh infra/test-werkstatt/start.sh
```

Das Skript startet den Docker-Messserver und die App, zeigt die Handy-Adresse
als QR-Code im Terminal und läuft, bis man `Ctrl+C` drückt.

Mehr Einrichtung braucht es nicht: Die App erlaubt Heimnetz-Zugriffe im
Entwicklungs-Modus automatisch (`allowedDevOrigins`) und zielt mit der
Messung automatisch auf die Adresse, unter der die Seite geöffnet wurde —
vom Handy aus also auf den Mac, nicht auf „localhost".
