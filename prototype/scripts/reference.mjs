// Referenzmessung am Mac per Kommandozeile:
//  - networkQuality (in macOS eingebaut, von Apple)
//  - Ookla speedtest (falls installiert)
// Die Ergebnisse landen im selben Speicher wie die Browser-Messungen (source: "referenz-cli").
// Erkennt selbst, ob die Messung über LAN-Kabel oder WLAN läuft, und speichert das ehrlich mit.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { appendResult } from '../lib/store.mjs';

const run = promisify(execFile);
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

// Über welche Verbindung läuft der Internet-Verkehr gerade — Kabel oder WLAN?
async function netzArt() {
  try {
    const { stdout: routeOut } = await run('route', ['-n', 'get', 'default']);
    const iface = routeOut.match(/interface:\s*(\S+)/)?.[1];
    if (!iface) return { art: 'unbekannt', port: null };
    const { stdout: ports } = await run('networksetup', ['-listallhardwareports']);
    const paare = [...ports.matchAll(/Hardware Port:\s*(.+)\s*\nDevice:\s*(\S+)/g)];
    const port = paare.find((p) => p[2] === iface)?.[1]?.trim() || iface;
    const wlan = /wi-?fi|airport/i.test(port);
    return { art: wlan ? 'wlan' : 'lan', port };
  } catch {
    return { art: 'unbekannt', port: null };
  }
}

async function messeNetworkQuality() {
  // -s: Download und Upload nacheinander messen (vergleichbar mit klassischen Speedtests)
  // -c: Ergebnis als JSON ausgeben
  const { stdout } = await run('/usr/bin/networkQuality', ['-s', '-c'], {
    timeout: 180000, maxBuffer: 10 * 1024 * 1024,
  });
  const j = JSON.parse(stdout);
  return {
    engine: 'networkquality',
    down_mbps: r2(j.dl_throughput / 1e6),
    up_mbps: r2(j.ul_throughput / 1e6),
    latency_ms: r2(Number(j.base_rtt)),
    jitter_ms: null,
    meta: { responsiveness_rpm: j.responsiveness ?? null, modus: 'sequenziell' },
  };
}

async function messeOokla() {
  console.log('Ookla speedtest läuft…');
  try {
    const { stdout } = await run('speedtest', ['--accept-license', '--accept-gdpr', '-f', 'json'], {
      timeout: 240000, maxBuffer: 10 * 1024 * 1024,
    });
    const j = JSON.parse(stdout);
    return {
      engine: 'ookla',
      down_mbps: r2(((j.download?.bandwidth ?? NaN) * 8) / 1e6),
      up_mbps: r2(((j.upload?.bandwidth ?? NaN) * 8) / 1e6),
      latency_ms: r2(j.ping?.latency),
      jitter_ms: r2(j.ping?.jitter),
      meta: { server: j.server?.name ?? null, isp: j.isp ?? null },
    };
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.log('ℹ️  Ookla-CLI nicht installiert — übersprungen.');
      console.log('   (Optional installieren: brew tap teamookla/speedtest && brew install speedtest)');
    } else {
      console.log(`⚠️  Ookla-Messung fehlgeschlagen: ${String(e.message || e).split('\n')[0]}`);
    }
    return null;
  }
}

const { art, port } = await netzArt();
const device = os.hostname().split('.')[0];

console.log(`Referenzmessung auf „${device}" — Verbindung: ${art}${port ? ` (${port})` : ''}`);
if (art !== 'lan') {
  console.log('⚠️  Kein LAN-Kabel erkannt. Für die echte Referenz bitte verkabelt messen.');
  console.log(`   Die Messung läuft trotzdem und wird ehrlich als „${art}" gespeichert.`);
}
console.log('');

console.log('networkQuality (Apple) läuft…');
try {
  const nq = await messeNetworkQuality();
  appendResult({ source: 'referenz-cli', device, network: art, ...nq });
  console.log(`  ↓ ${nq.down_mbps} Mbit/s   ↑ ${nq.up_mbps} Mbit/s   Ping ${nq.latency_ms ?? '–'} ms   → gespeichert`);
} catch (e) {
  console.log(`⚠️  networkQuality fehlgeschlagen: ${String(e.message || e).split('\n')[0]}`);
}

const ookla = await messeOokla();
if (ookla) {
  appendResult({ source: 'referenz-cli', device, network: art, ...ookla });
  console.log(`  ↓ ${ookla.down_mbps} Mbit/s   ↑ ${ookla.up_mbps} Mbit/s   Ping ${ookla.latency_ms ?? '–'} ms   → gespeichert`);
}

console.log('\nTipp: Für eine belastbare Referenz mehrmals messen (z. B. 3× „npm run reference").');
