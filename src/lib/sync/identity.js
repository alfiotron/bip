import { q, x, getMeta, setMeta } from '../db/index.js';
import { record, setJournalTill } from '../journal.js';
import { uuid } from '../ids.js';

// Identità di questa cassa e dati di collegamento, salvati solo qui (tabella meta).

export async function syncMeta() {
  return {
    role: (await getMeta('till_role', '')) || '',
    tillId: (await getMeta('till_id', '')) || '',
    shopId: (await getMeta('shop_id', '')) || '',
    principalUrl: (await getMeta('principal_url', '')) || '',
    principalName: (await getMeta('principal_name', '')) || '',
    key: (await getMeta('sync_key', '')) || '',
    ack: Number((await getMeta('sync_ack', '0')) || 0),
    lastSync: (await getMeta('last_sync', '')) || ''
  };
}

/** Quanto c'è già in questa cassa: serve ad avvisare prima di cancellare. */
export async function localContent() {
  const r = await q(
    `SELECT (SELECT COUNT(*) FROM sales) AS sales, (SELECT COUNT(*) FROM products) AS products,
            (SELECT COUNT(*) FROM events) AS events, (SELECT COUNT(*) FROM journal) AS journal`
  );
  const c = r[0];
  return { sales: Number(c.sales), products: Number(c.products), events: Number(c.events), journal: Number(c.journal) };
}

const DATA_TABLES = [
  'journal', 'products', 'events', 'clients', 'sales', 'sale_lines', 'stock_moves', 'transfers', 'transfer_lines',
  'transfer_returns', 'transfer_return_lines', 'deleted', 'settings', 'brands', 'tills', 'till_keys', 'till_seen'
];
const KEEP_META = ['schema_version', 'accent', 'sound'];

/** Cancella tutti i dati di questa cassa, tranne colore e suoni. */
export async function eraseLocalData() {
  for (const t of DATA_TABLES) await x(`DELETE FROM ${t}`);
  await x(`DELETE FROM meta WHERE key NOT IN (${KEEP_META.map(() => '?').join(',')})`, KEEP_META);
}

/** Questa cassa diventa la principale. I dati già presenti restano. */
export async function becomePrincipal(name) {
  const existing = await getMeta('till_id', '');
  const id = existing || 'C1';
  await setMeta('till_id', id);
  await setMeta('till_role', 'principal');
  if (!(await getMeta('shop_id', ''))) await setMeta('shop_id', uuid());
  setJournalTill(id);
  await record('till.upsert', { id, name: name.trim() || 'Cassa 1', role: 'principal', removed: 0 });
  return id;
}

/** Salva l'abbinamento ricevuto dalla principale. */
export async function saveSecondary({ tillId, shopId, principalUrl, principalName, key }) {
  await setMeta('till_id', tillId);
  await setMeta('till_role', 'secondary');
  await setMeta('shop_id', shopId);
  await setMeta('principal_url', principalUrl);
  await setMeta('principal_name', principalName);
  await setMeta('sync_key', key);
  await setMeta('sync_ack', '0');
}

/** Codice della prossima cassa secondaria: C2, C3... */
export async function nextTillId() {
  // Si considerano anche le casse rimosse e quelle presenti solo nel journal: un codice non si riusa mai
  const rows = await q('SELECT id FROM tills UNION SELECT DISTINCT origin AS id FROM journal');
  const n = rows.reduce((m, r) => Math.max(m, parseInt(String(r.id).replace(/\D/g, ''), 10) || 0), 1);
  return 'C' + (n + 1);
}
