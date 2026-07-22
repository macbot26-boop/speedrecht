// Gemeinsamer Ergebnis-Speicher: eine JSONL-Datei (eine Zeile = eine Messung).
// Wird vom Server (API) und von den CLI-Skripten direkt benutzt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'results.jsonl');

export function appendResult(r) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const rec = {
    id: Math.random().toString(36).slice(2, 10),
    ts: new Date().toISOString(),
    ...r,
  };
  fs.appendFileSync(FILE, JSON.stringify(rec) + '\n');
  return rec;
}

export function listResults() {
  try {
    return fs
      .readFileSync(FILE, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
