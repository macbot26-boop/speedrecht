// Messwerkstatt-Server: liefert die Mess-Seite (PWA) aus und sammelt Ergebnisse ein.
import express from 'express';
import os from 'node:os';
import { appendResult, listResults, median } from './lib/store.mjs';

const PORT = process.env.PORT || 4280;
const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

app.get('/ergebnisse', (req, res) => res.sendFile('ergebnisse.html', { root: 'public' }));
app.get('/check', (req, res) => res.sendFile('check.html', { root: 'public' }));
app.get('/api/health', (req, res) => res.json({ ok: true }));

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

app.post('/api/results', (req, res) => {
  const b = req.body || {};
  const rec = appendResult({
    source: String(b.source || 'unbekannt').slice(0, 60),
    device: String(b.device || '').slice(0, 80),
    network: String(b.network || 'unbekannt').slice(0, 20),
    engine: String(b.engine || '').slice(0, 40),
    down_mbps: num(b.down_mbps),
    up_mbps: num(b.up_mbps),
    latency_ms: num(b.latency_ms),
    jitter_ms: num(b.jitter_ms),
    meta: b.meta ?? null,
    ua: String(req.headers['user-agent'] || '').slice(0, 200),
  });
  res.json({ ok: true, id: rec.id, ts: rec.ts });
});

app.get('/api/results', (req, res) => res.json(listResults()));

app.get('/api/results.csv', (req, res) => {
  const cols = ['ts', 'source', 'device', 'network', 'engine', 'down_mbps', 'up_mbps', 'latency_ms', 'jitter_ms'];
  const lines = [cols.join(';')];
  for (const r of listResults()) {
    lines.push(cols.map((c) => String(r[c] ?? '').replace(/;/g, ',')).join(';'));
  }
  res.type('text/csv').send(lines.join('\n'));
});

// Gruppierte Zusammenfassung: Median je (source, device, engine) + Abweichung zur LAN-Referenz.
app.get('/api/summary', (req, res) => {
  const all = listResults();
  const groups = new Map();
  for (const r of all) {
    const key = `${r.source}|${r.device}|${r.network || 'unbekannt'}|${r.engine}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const rows = [...groups.entries()].map(([key, rs]) => {
    const [source, device, network, engine] = key.split('|');
    return {
      source, device, network, engine,
      n: rs.length,
      down_median: num(median(rs.map((r) => r.down_mbps))),
      up_median: num(median(rs.map((r) => r.up_mbps))),
      latency_median: num(median(rs.map((r) => r.latency_ms))),
      down_min: num(Math.min(...rs.map((r) => r.down_mbps).filter(Number.isFinite))),
      down_max: num(Math.max(...rs.map((r) => r.down_mbps).filter(Number.isFinite))),
    };
  });
  // Referenz = beste verkabelte CLI-Messung (Ookla bevorzugt, sonst networkquality).
  // Solange keine LAN-Messung existiert, notfalls eine unverkabelte CLI-Messung nehmen.
  const cli = rows.filter((r) => r.source === 'referenz-cli');
  const ref =
    cli.find((r) => r.network === 'lan' && r.engine === 'ookla') ||
    cli.find((r) => r.network === 'lan' && r.engine === 'networkquality') ||
    cli.find((r) => r.engine === 'ookla') ||
    cli.find((r) => r.engine === 'networkquality') ||
    null;
  for (const r of rows) {
    r.down_vs_ref_pct = ref && ref.down_median ? num((r.down_median / ref.down_median) * 100) : null;
    r.up_vs_ref_pct = ref && ref.up_median ? num((r.up_median / ref.up_median) * 100) : null;
  }
  res.json({ reference: ref ? `${ref.source}/${ref.engine} (${ref.network})` : null, rows });
});

function lanIp() {
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) return { name, address: a.address };
    }
  }
  return null;
}

app.listen(PORT, '0.0.0.0', () => {
  const ip = lanIp();
  console.log(`Messwerkstatt läuft:`);
  console.log(`  Lokal:    http://localhost:${PORT}`);
  if (ip) console.log(`  Im LAN:   http://${ip.address}:${PORT}  (fürs iPhone, Interface ${ip.name})`);
});
