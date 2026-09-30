import { q, x, getMeta } from '../db/index.js';
import { record } from '../journal.js';
import { uuid, nowIso } from '../ids.js';
import { app, refreshAll } from '../state.svelte.js';
import { onRequest, serverStart, serverStop, localIps } from '../net.js';
import { vector, entriesMissing, ingest } from './io.js';
import { nextTillId } from './identity.js';

// Cassa principale: riceve le registrazioni delle secondarie e manda loro quelle che mancano.

export const hub = $state({
  running: false,
  port: null,
  ips: [],
  error: '',
  code: null, // codice di abbinamento mostrato mentre si collega una nuova cassa
  codeExpires: 0,
  justPaired: null, // nome dell'ultima cassa collegata
  shareCode: null, // codice per passare il catalogo a una cassa indipendente
  shareExpires: 0,
  shared: null, // a chi è stato passato l'ultima volta
  seen: {} // till_id → { at, ip }
});

const CODE_MINUTES = 10;

export function newPairingCode() {
  hub.code = String(Math.floor(100000 + Math.random() * 900000));
  hub.codeExpires = Date.now() + CODE_MINUTES * 60000;
  hub.justPaired = null;
}
export function closePairing() {
  hub.code = null;
}

export function newShareCode() {
  hub.shareCode = String(Math.floor(100000 + Math.random() * 900000));
  hub.shareExpires = Date.now() + CODE_MINUTES * 60000;
  hub.shared = null;
}
export function closeShare() {
  hub.shareCode = null;
}

/** Catalogo (prodotti e marchi) per un'altra cassa principale, indipendente da questa. */
async function catalog(body, remote) {
  if (!hub.shareCode || Date.now() > hub.shareExpires) return { status: 403, body: { error: 'nocode', message: 'Sull\'altra cassa non è aperta la condivisione del catalogo. Tocca "Condividi il catalogo" nella sua scheda Casse.' } };
  if (String(body?.code || '').trim() !== hub.shareCode) return { status: 403, body: { error: 'badcode', message: 'Il codice non è corretto. Controlla quello mostrato sull\'altra cassa.' } };
  const brands = await q('SELECT id, name FROM brands');
  const bname = Object.fromEntries(brands.map((b) => [b.id, b.name]));
  const products = await q('SELECT * FROM products ORDER BY name COLLATE NOCASE');
  hub.shared = remote || 'un\'altra cassa';
  return {
    status: 200,
    body: {
      shop_name: app.shop.name,
      till_name: app.till.name,
      products: products.map((p) => ({
        code: p.code || '', name: p.name, description: p.description || '', price_cents: Number(p.price_cents), vat_rate: Number(p.vat_rate),
        active: !!p.active, brand_name: p.brand_id ? bname[p.brand_id] || '' : ''
      }))
    }
  };
}

async function authorize(headers) {
  const till = headers?.['x-bip-till'];
  const key = headers?.['x-bip-key'];
  if (!till || !key) return null;
  const r = await q(
    'SELECT t.id FROM till_keys k JOIN tills t ON t.id = k.till_id WHERE k.till_id = ? AND k.key = ? AND t.removed = 0',
    [till, key]
  );
  return r.length ? till : null;
}

async function markSeen(till, ip) {
  const at = nowIso();
  hub.seen = { ...hub.seen, [till]: { at, ip } };
  await x(
    `INSERT INTO till_seen (till_id, last_seen, last_ip) VALUES (?, ?, ?)
     ON CONFLICT(till_id) DO UPDATE SET last_seen = excluded.last_seen, last_ip = excluded.last_ip`,
    [till, at, ip || '']
  );
}

async function hello() {
  return {
    status: 200,
    body: { app: 'bip', v: 1, role: 'principal', shop_id: await getMeta('shop_id', ''), shop_name: app.shop.name, till_id: app.till.id, till_name: app.till.name }
  };
}

async function pair(body, remote) {
  if (!hub.code || Date.now() > hub.codeExpires) return { status: 403, body: { error: 'nocode', message: 'Sulla cassa principale non è aperto nessun abbinamento. Tocca "Collega una nuova cassa" nella scheda Casse.' } };
  if (String(body?.code || '').trim() !== hub.code) return { status: 403, body: { error: 'badcode', message: 'Il codice non è corretto. Controlla quello mostrato sulla cassa principale.' } };
  const id = await nextTillId();
  const name = 'Cassa ' + id.replace(/\D/g, '');
  const key = uuid() + uuid();
  await record('till.upsert', { id, name, role: 'secondary', removed: 0 });
  await x('INSERT OR REPLACE INTO till_keys (till_id, key, created_at) VALUES (?, ?, ?)', [id, key, nowIso()]);
  await markSeen(id, remote);
  hub.code = null;
  hub.justPaired = name;
  await refreshAll();
  return {
    status: 200,
    body: { till_id: id, till_name: name, key, shop_id: await getMeta('shop_id', ''), shop_name: app.shop.name, principal: { id: app.till.id, name: app.till.name } }
  };
}

async function sync(body, headers, remote) {
  const till = await authorize(headers);
  if (!till) return { status: 401, body: { error: 'revoked', message: 'Questa cassa non è più collegata alla principale.' } };
  // Si accettano solo le registrazioni create dalla cassa che scrive
  const own = (body?.entries || []).filter((e) => e && e.origin === till);
  const added = await ingest(own);
  if (added) await refreshAll();
  await markSeen(till, remote);
  const { entries, more } = await entriesMissing(body?.have || {}, 1000, till);
  return { status: 200, body: { have: await vector(), entries, more } };
}

async function handle(req) {
  const path = (req.path || '').split('?')[0];
  if (req.method === 'GET' && path === '/bip/v1/hello') return hello();
  if (req.method === 'POST' && path === '/bip/v1/pair') return pair(req.body, req.remote);
  if (req.method === 'POST' && path === '/bip/v1/sync') return sync(req.body, req.headers, req.remote);
  if (req.method === 'POST' && path === '/bip/v1/catalog') return catalog(req.body, req.remote);
  return { status: 404, body: { error: 'notfound' } };
}

/** Avvia il server: da chiamare all'avvio sulla cassa principale. */
export async function startHub() {
  onRequest(handle);
  const seen = await q('SELECT * FROM till_seen');
  hub.seen = Object.fromEntries(seen.map((r) => [r.till_id, { at: r.last_seen, ip: r.last_ip }]));
  try {
    hub.port = await serverStart(app.till.name || 'Cassa principale', {
      shop: await getMeta('shop_id', ''),
      shopname: app.shop.name || '',
      till: app.till.id,
      tillname: app.till.name || '',
      v: '1'
    });
    hub.running = true;
    hub.error = '';
  } catch (e) {
    hub.running = false;
    hub.error = String(e?.message || e);
  }
  hub.ips = await localIps();
}

export async function stopHub() {
  await serverStop();
  hub.running = false;
}

/** Ripubblica il nome sulla rete dopo una modifica. */
export async function restartHub() {
  if (!hub.running) return;
  await stopHub();
  await startHub();
}

export async function renameTill(id, name) {
  const t = (await q('SELECT * FROM tills WHERE id = ?', [id]))[0];
  await record('till.upsert', { id, name: name.trim(), role: t?.role || 'secondary', removed: t ? Number(t.removed) : 0 });
  await refreshAll();
}

/** Scollega una cassa secondaria: non potrà più sincronizzarsi. Le sue vendite restano. */
export async function removeTill(id) {
  const t = (await q('SELECT * FROM tills WHERE id = ?', [id]))[0];
  await record('till.upsert', { id, name: t?.name || id, role: 'secondary', removed: 1 });
  await x('DELETE FROM till_keys WHERE till_id = ?', [id]);
  await refreshAll();
}
