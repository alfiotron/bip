import { isTauri } from './db/index.js';

// Trasporto di rete tra le casse. Nell'app usa la parte Rust (server HTTP, mDNS, richieste);
// nel browser di sviluppo simula una rete tra schede con BroadcastChannel, per provare
// la sincronizzazione senza due computer.

export const SYNC_PORT = 47800;

let handler = null;
/** Funzione che risponde alle richieste in arrivo sulla cassa principale: (req) => { status, body } */
export function onRequest(fn) {
  handler = fn;
}

async function dispatch(req) {
  try {
    const r = handler ? await handler(req) : { status: 503, body: { error: 'Cassa non pronta' } };
    return { status: r.status, body: JSON.stringify(r.body) };
  } catch (e) {
    console.error(e);
    return { status: 500, body: JSON.stringify({ error: String(e?.message || e) }) };
  }
}

// ---------- app (Tauri) ----------
let tauriListening = false;
async function tauri() {
  const { invoke } = await import('@tauri-apps/api/core');
  if (!tauriListening) {
    tauriListening = true;
    const { listen } = await import('@tauri-apps/api/event');
    await listen('bip-request', async (ev) => {
      const r = ev.payload;
      let body = null;
      try { body = r.body ? JSON.parse(r.body) : null; } catch { body = null; }
      const res = await dispatch({ method: r.method, path: r.path, body, headers: r.headers, remote: r.remote });
      await invoke('bip_respond', { id: r.id, status: res.status, body: res.body });
    });
  }
  return invoke;
}

// ---------- browser di sviluppo: rete simulata ----------
const tab = 'sim-' + Math.random().toString(36).slice(2, 7);
let bc = null;
let simServer = null;
const waiting = new Map();
function sim() {
  if (bc) return bc;
  bc = new BroadcastChannel('bip-sim-net');
  bc.onmessage = async (ev) => {
    const m = ev.data;
    if (m.type === 'discover' && simServer) bc.postMessage({ type: 'found', to: m.from, found: { name: simServer.name, addresses: [tab], port: simServer.port, properties: simServer.properties } });
    if (m.type === 'found' && m.to === tab) waiting.get('discover')?.push(m.found);
    if (m.type === 'req' && m.host === tab && simServer) {
      const res = await dispatch({ method: m.method, path: m.path, body: m.body, headers: m.headers, remote: m.from });
      bc.postMessage({ type: 'res', to: m.from, rid: m.rid, status: res.status, body: res.body });
    }
    if (m.type === 'res' && m.to === tab) waiting.get(m.rid)?.(m);
  };
  return bc;
}

// ---------- interfaccia comune ----------
export async function serverStart(name, properties) {
  if (isTauri()) return (await tauri())('bip_server_start', { port: SYNC_PORT, name, properties });
  sim();
  simServer = { name, properties, port: SYNC_PORT };
  return SYNC_PORT;
}

export async function serverStop() {
  if (isTauri()) return (await tauri())('bip_server_stop');
  simServer = null;
}

export async function localIps() {
  if (isTauri()) return (await tauri())('bip_local_ips');
  return [tab];
}

/** Casse principali trovate sulla rete: [{ name, addresses, port, properties }] */
export async function discover(ms = 3000) {
  if (isTauri()) return (await tauri())('bip_discover', { timeoutMs: ms });
  const ch = sim();
  const found = [];
  waiting.set('discover', found);
  ch.postMessage({ type: 'discover', from: tab });
  await new Promise((r) => setTimeout(r, Math.min(ms, 800)));
  waiting.delete('discover');
  return found;
}

/** Richiesta alla cassa principale. Restituisce { status, body } oppure lancia un errore di rete. */
export async function request(url, body = null, headers = {}, timeoutMs = 15000) {
  if (isTauri()) {
    const r = await (await tauri())('bip_request', { url, body: body === null ? null : JSON.stringify(body), headers, timeoutMs });
    let parsed = null;
    try { parsed = r.body ? JSON.parse(r.body) : null; } catch { parsed = null; }
    return { status: r.status, body: parsed };
  }
  const ch = sim();
  const u = new URL(url);
  const rid = Math.random().toString(36).slice(2);
  const res = await new Promise((resolve, reject) => {
    const t = setTimeout(() => { waiting.delete(rid); reject(new Error('Nessuna risposta dalla cassa principale')); }, Math.min(timeoutMs, 4000));
    waiting.set(rid, (m) => { clearTimeout(t); waiting.delete(rid); resolve(m); });
    ch.postMessage({ type: 'req', host: u.hostname, from: tab, rid, method: body === null ? 'GET' : 'POST', path: u.pathname, body, headers });
  });
  return { status: res.status, body: res.body ? JSON.parse(res.body) : null };
}
