import { setMeta } from '../db/index.js';
import { nowIso } from '../ids.js';
import { app, refreshAll } from '../state.svelte.js';
import { request, discover, SYNC_PORT } from '../net.js';
import { vector, ownEntriesAfter, countOwnAfter, ingest } from './io.js';
import { syncMeta } from './identity.js';

// Cassa secondaria: si sincronizza con la principale ogni pochi secondi.

export const link = $state({
  state: 'idle', // 'ok' | 'offline' | 'revoked' | 'syncing' | 'idle'
  lastSync: '',
  pending: 0,
  error: '',
  url: '',
  principalName: '',
  firstSync: false // true durante la prima ricezione dei dati dopo l'abbinamento
});

const INTERVAL = 4000;
let timer = null;
let busy = false;
let failures = 0;
let lastDiscovery = 0;

export const urlFor = (host, port = SYNC_PORT) => `http://${host}:${port}`;

/** Verifica che all'indirizzo ci sia una cassa principale Bip. */
export async function hello(url) {
  const r = await request(url + '/bip/v1/hello', null, {}, 5000);
  if (r.status !== 200 || r.body?.app !== 'bip') throw new Error('A questo indirizzo non risponde una cassa principale di Bip.');
  return r.body;
}

/** Abbinamento con il codice mostrato dalla principale. */
export async function pair(url, code) {
  const r = await request(url + '/bip/v1/pair', { code: String(code).trim() }, {}, 10000);
  if (r.status !== 200) throw new Error(r.body?.message || 'Abbinamento non riuscito.');
  return r.body;
}

export async function syncNow() {
  if (busy) return;
  busy = true;
  const m = await syncMeta();
  link.url = m.principalUrl;
  link.principalName = m.principalName;
  if (m.role !== 'secondary' || !m.principalUrl) { busy = false; return; }
  const headers = { 'x-bip-till': m.tillId, 'x-bip-key': m.key };
  let ack = m.ack;
  let received = 0;
  try {
    link.state = link.state === 'ok' ? 'ok' : 'syncing';
    for (let round = 0; round < 50; round++) {
      const mine = await ownEntriesAfter(m.tillId, ack);
      const r = await request(m.principalUrl + '/bip/v1/sync', { have: await vector(), entries: mine.entries }, headers, 30000);
      if (r.status === 401) { link.state = 'revoked'; link.error = r.body?.message || ''; stopLink(); break; }
      if (r.status !== 200) throw new Error(r.body?.message || r.body?.error || 'Errore ' + r.status);
      received += await ingest(r.body.entries);
      const confirmed = r.body.have?.[m.tillId] ?? ack;
      if (confirmed > ack) { ack = confirmed; await setMeta('sync_ack', String(ack)); }
      if (!r.body.more && !mine.more) break;
    }
    if (link.state !== 'revoked') {
      link.state = 'ok';
      link.error = '';
      link.lastSync = nowIso();
      await setMeta('last_sync', link.lastSync);
      failures = 0;
    }
    if (received) await refreshAll();
  } catch (e) {
    failures++;
    link.state = 'offline';
    link.error = String(e?.message || e);
    // La principale potrebbe aver cambiato indirizzo (nuova rete, nuovo evento): si prova a ritrovarla
    if (failures >= 2 && Date.now() - lastDiscovery > 30000) {
      lastDiscovery = Date.now();
      rediscover(m.shopId).catch(() => {});
    }
  } finally {
    link.pending = await countOwnAfter(m.tillId, ack);
    link.firstSync = false;
    busy = false;
  }
}

async function rediscover(shopId) {
  const found = await discover(3000);
  const p = found.find((f) => f.properties?.shop === shopId && f.addresses?.length);
  if (!p) return;
  const url = urlFor(p.addresses[0], p.port);
  if (url !== link.url) {
    await setMeta('principal_url', url);
    link.url = url;
    syncNow();
  }
}

export async function changeAddress(url) {
  await setMeta('principal_url', url);
  link.url = url;
  failures = 0;
  await syncNow();
}

export async function startLink() {
  stopLink();
  const m = await syncMeta();
  link.lastSync = m.lastSync;
  link.url = m.principalUrl;
  link.principalName = m.principalName;
  link.pending = await countOwnAfter(m.tillId, m.ack);
  await syncNow();
  timer = setInterval(syncNow, INTERVAL);
}

export function stopLink() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Registrazioni di questa cassa non ancora confermate dalla principale. */
export async function unsentCount() {
  const m = await syncMeta();
  return countOwnAfter(m.tillId, m.ack);
}

export { app };
