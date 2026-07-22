#!/bin/sh
# Test-Werkstatt: Speedrecht komplett auf DIESEM Mac starten (App + lokaler
# Messserver), damit man vom Handy im selben WLAN das Produkt anfassen kann.
#
# Ehrlichkeit: Gemessen wird hier das HEIM-WLAN zwischen Handy und diesem
# Mac — nicht die Internet-Leitung. Zum Produkt-Testen gedacht, nicht als
# Ersatz für den echten Messserver.
#
# Voraussetzungen (einmalig): Docker Desktop läuft, Node 22+, npm ci gemacht,
# .env.local vom Haupt-Rechner in den Projektordner kopiert (siehe README).

set -e
cd "$(dirname "$0")/../.."

command -v docker >/dev/null 2>&1 || {
  echo "❌ Docker fehlt oder läuft nicht — bitte Docker Desktop starten."
  exit 1
}
command -v node >/dev/null 2>&1 || {
  echo "❌ Node.js fehlt — bitte von https://nodejs.org installieren (Version 22)."
  exit 1
}
[ -f .env.local ] || {
  echo "⚠️  Keine .env.local gefunden — Messen geht, Speichern & Anbieter-Karte nicht."
  echo "   (Datei vom Haupt-MacBook in diesen Projektordner kopieren.)"
}

echo "→ Messserver (Docker) starten …"
docker compose -f infra/dev-peer/compose.yaml up -d

[ -d node_modules ] || {
  echo "→ Abhängigkeiten installieren (einmalig) …"
  npm ci
}

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
if [ -n "$IP" ]; then
  URL="http://$IP:3000/messung"
  echo ""
  echo "📱 Handy (gleiches WLAN): $URL"
  npx --yes qrcode "$URL" 2>/dev/null || true
  echo ""
else
  echo "⚠️  Keine WLAN-IP gefunden — ist dieser Mac im WLAN?"
fi

echo "→ App starten (beenden mit Ctrl+C) …"
npm run dev
