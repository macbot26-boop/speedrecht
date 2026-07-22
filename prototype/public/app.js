// Speed-Check: zwei Mess-Engines im Browser.
// 1) "cloudflare-lib": Cloudflares Open-Source-Messbibliothek (@cloudflare/speedtest)
// 2) "eigen": eigene, transparente Messung gegen speed.cloudflare.com (__down/__up)
(() => {
  const $ = (s) => document.querySelector(s);
  const BASE = 'https://speed.cloudflare.com';

  // ---------- Gerätevorschlag ----------
  const ua = navigator.userAgent;
  const isIPhone = /iPhone/.test(ua);
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isMac = /Macintosh/.test(ua) && !isIPad;
  $('#device').value = isIPhone ? 'iPhone' : isIPad ? 'iPad' : isMac ? 'Mac (Browser)' : 'Gerät';
  $('#network').value = isMac ? 'lan' : 'wlan';

  // ---------- Helfer ----------
  const median = (arr) => {
    const v = arr.filter(Number.isFinite).sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };
  const mad = (arr) => {
    const med = median(arr);
    if (med == null) return null;
    return median(arr.map((x) => Math.abs(x - med)));
  };
  const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
  const fmt = (x) => (x == null ? '–' : x >= 100 ? x.toFixed(0) : x.toFixed(1));

  const setStatus = (msg) => {
    const el = $('#status');
    el.hidden = !msg;
    el.textContent = msg || '';
  };

  // ---------- Engine 1: Cloudflare-Bibliothek ----------
  function runCloudflare(onStatus) {
    return new Promise((resolve, reject) => {
      if (!window.CFSpeedTest) return reject(new Error('Cloudflare-Engine nicht geladen'));
      const errors = [];
      const st = new window.CFSpeedTest({
        autoStart: false,
        measurements: [
          { type: 'latency', numPackets: 20 },
          { type: 'download', bytes: 1e5, count: 8 },
          { type: 'download', bytes: 1e6, count: 6 },
          { type: 'download', bytes: 1e7, count: 4 },
          { type: 'download', bytes: 2.5e7, count: 2 },
          { type: 'upload', bytes: 1e5, count: 8 },
          { type: 'upload', bytes: 1e6, count: 6 },
          { type: 'upload', bytes: 1e7, count: 2 },
        ],
      });
      const timeout = setTimeout(() => reject(new Error('Cloudflare-Engine: Zeitüberschreitung')), 150000);
      st.onResultsChange = ({ type }) => onStatus(`Cloudflare-Engine läuft… (${type || 'Messung'})`);
      st.onError = (e) => { errors.push(String(e)); };
      st.onFinish = (results) => {
        clearTimeout(timeout);
        let s = {};
        try { s = results.getSummary() || {}; } catch { /* leer lassen */ }
        resolve({
          engine: 'cloudflare-lib',
          down_mbps: r2(s.download != null ? s.download / 1e6 : null),
          up_mbps: r2(s.upload != null ? s.upload / 1e6 : null),
          latency_ms: r2(s.latency),
          jitter_ms: r2(s.jitter),
          meta: { raw: s, errors: errors.slice(0, 5) },
        });
      };
      st.play();
    });
  }

  // ---------- Engine 2: eigene Messung ----------
  async function measureLatency(n = 12) {
    const lats = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      try {
        await fetch(`${BASE}/__down?bytes=0&r=${Math.random()}`, { cache: 'no-store' });
        lats.push(performance.now() - t0);
      } catch { /* einzelne Ausreißer ignorieren */ }
    }
    lats.shift(); // erste Messung enthält Verbindungsaufbau
    return { latency: median(lats), jitter: mad(lats) };
  }

  async function throughputDown(streams, ms, onTick) {
    const samples = [];
    let total = 0;
    const t0 = performance.now();
    const deadline = t0 + ms;
    const ac = new AbortController();
    const note = () => samples.push({ t: performance.now(), total });

    const rateNow = () => {
      const cutoff = performance.now() - 2000;
      const win = samples.filter((s) => s.t >= cutoff);
      if (win.length < 2) return null;
      const a = win[0], b = win[win.length - 1];
      const sec = (b.t - a.t) / 1000;
      return sec > 0 ? ((b.total - a.total) * 8) / sec / 1e6 : null;
    };
    const ticker = setInterval(() => onTick && onTick(rateNow()), 600);

    const worker = async () => {
      while (performance.now() < deadline) {
        try {
          const res = await fetch(`${BASE}/__down?bytes=50000000&r=${Math.random()}`, {
            cache: 'no-store', signal: ac.signal,
          });
          const reader = res.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            note();
            if (performance.now() >= deadline) { ac.abort(); break; }
          }
        } catch {
          if (performance.now() >= deadline) break;
        }
      }
    };
    await Promise.all(Array.from({ length: streams }, worker));
    clearInterval(ticker);

    // Rampe (TCP-Anlauf) verwerfen: erst ab Sekunde 3 zählen
    const after = samples.filter((s) => s.t >= t0 + 3000);
    if (after.length >= 2) {
      const a = after[0], b = after[after.length - 1];
      const sec = (b.t - a.t) / 1000;
      if (sec > 0) return ((b.total - a.total) * 8) / sec / 1e6;
    }
    const last = samples[samples.length - 1];
    return last ? (last.total * 8) / ((last.t - t0) / 1000) / 1e6 : null;
  }

  function throughputUp(streams, ms) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const deadline = t0 + ms;
      const samples = [];
      let doneBytes = 0;
      const inflight = new Map();
      const xhrs = new Set();
      let finished = false;

      const note = () => {
        let cur = doneBytes;
        for (const v of inflight.values()) cur += v;
        samples.push({ t: performance.now(), total: cur });
      };
      const payload = new Blob([new ArrayBuffer(30 * 1024 * 1024)]);

      const maybeFinish = () => {
        if (finished || xhrs.size > 0) return;
        finished = true;
        const after = samples.filter((s) => s.t >= t0 + 2500);
        let mbps = null;
        if (after.length >= 2) {
          const a = after[0], b = after[after.length - 1];
          const sec = (b.t - a.t) / 1000;
          if (sec > 0) mbps = ((b.total - a.total) * 8) / sec / 1e6;
        } else if (samples.length) {
          const b = samples[samples.length - 1];
          const sec = (b.t - t0) / 1000;
          if (sec > 0) mbps = (b.total * 8) / sec / 1e6;
        }
        resolve(mbps);
      };

      const spawn = () => {
        if (performance.now() >= deadline) return maybeFinish();
        const xhr = new XMLHttpRequest();
        xhrs.add(xhr);
        inflight.set(xhr, 0);
        xhr.open('POST', `${BASE}/__up?r=${Math.random()}`);
        xhr.upload.onprogress = (e) => {
          inflight.set(xhr, e.loaded);
          note();
          if (performance.now() >= deadline) xhr.abort();
        };
        const finish = () => {
          doneBytes += inflight.get(xhr) || 0;
          inflight.delete(xhr);
          xhrs.delete(xhr);
          note();
          spawn();
        };
        xhr.onload = finish;
        xhr.onerror = finish;
        xhr.onabort = finish;
        xhr.send(payload);
      };

      for (let i = 0; i < streams; i++) spawn();
      setTimeout(() => { for (const x of xhrs) x.abort(); setTimeout(maybeFinish, 400); }, ms + 2000);
    });
  }

  async function runEigen(onStatus) {
    onStatus('Eigene Engine: Latenz…');
    const { latency, jitter } = await measureLatency();
    onStatus('Eigene Engine: Download…');
    const down = await throughputDown(4, 12000, (rate) => {
      if (rate) onStatus(`Eigene Engine: Download… ${fmt(r2(rate))} Mbit/s`);
    });
    onStatus('Eigene Engine: Upload…');
    const up = await throughputUp(3, 10000);
    return {
      engine: 'eigen',
      down_mbps: r2(down),
      up_mbps: r2(up),
      latency_ms: r2(latency),
      jitter_ms: r2(jitter),
      meta: { streams_down: 4, streams_up: 3, dauer_down_s: 12, dauer_up_s: 10 },
    };
  }

  // ---------- Speichern + Anzeige ----------
  async function save(result, ctx) {
    const body = { source: 'pwa', device: ctx.device, network: ctx.network, ...result };
    try {
      const res = await fetch('/api/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return (await res.json()).ok === true;
    } catch {
      return false;
    }
  }

  function renderCard(result, saved) {
    const el = document.createElement('div');
    el.className = 'card result';
    el.innerHTML = `
      <div class="result-head">
        <span class="engine">${result.engine === 'cloudflare-lib' ? 'Cloudflare-Engine' : 'Eigene Engine'}</span>
        <span class="saved">${saved ? 'gespeichert ✓' : 'nicht gespeichert ✗'}</span>
      </div>
      <div class="metrics">
        <div class="metric"><span class="num">${fmt(result.down_mbps)}</span><span class="unit">Mbit/s ↓</span></div>
        <div class="metric"><span class="num">${fmt(result.up_mbps)}</span><span class="unit">Mbit/s ↑</span></div>
        <div class="metric"><span class="num">${fmt(result.latency_ms)}</span><span class="unit">ms Ping</span></div>
        <div class="metric"><span class="num">${fmt(result.jitter_ms)}</span><span class="unit">ms Jitter</span></div>
      </div>`;
    $('#results').prepend(el);
  }

  // ---------- Ablauf ----------
  $('#start').addEventListener('click', async () => {
    const btn = $('#start');
    btn.disabled = true;
    const ctx = { device: $('#device').value.trim() || 'Gerät', network: $('#network').value };
    const engines = [];
    if ($('#eng-cf').checked) engines.push(runCloudflare);
    if ($('#eng-eigen').checked) engines.push(runEigen);
    if (!engines.length) { setStatus('Bitte mindestens eine Engine auswählen.'); btn.disabled = false; return; }

    for (const engine of engines) {
      try {
        const result = await engine(setStatus);
        setStatus('Speichere…');
        const saved = await save(result, ctx);
        renderCard(result, saved);
      } catch (e) {
        setStatus(`Fehler: ${e.message}`);
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    setStatus('');
    btn.disabled = false;
  });

  // ---------- PWA (nur über HTTPS/localhost möglich) ----------
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
})();
