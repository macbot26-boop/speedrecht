// Zeigt die Adresse der Mess-Seite im Heimnetz als QR-Code im Terminal an,
// damit man sie mit der iPhone-Kamera direkt öffnen kann.
import os from 'node:os';
import QRCode from 'qrcode';

const PORT = process.env.PORT || 4280;

let gefunden = null;
for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
  for (const a of addrs || []) {
    if (a.family === 'IPv4' && !a.internal) { gefunden = { name, address: a.address }; break; }
  }
  if (gefunden) break;
}

if (!gefunden) {
  console.log('Keine Netzwerk-Adresse gefunden — ist der Mac mit dem Heimnetz verbunden?');
  process.exit(1);
}

const url = `http://${gefunden.address}:${PORT}`;
console.log(`\nMess-Seite im Heimnetz (Interface ${gefunden.name}):\n  ${url}\n`);
console.log('Mit der iPhone-Kamera scannen (iPhone muss im selben WLAN sein):\n');
console.log(await QRCode.toString(url, { type: 'terminal', small: true }));
console.log('Hinweis: Der Server muss dafür laufen (npm start).');
