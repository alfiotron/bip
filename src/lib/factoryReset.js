import { q, x, setMeta } from './db/index.js';
import { record, setJournalTill } from './journal.js';
import { uuid } from './ids.js';
import { app, refreshAll, setCurrentEvent } from './state.svelte.js';
import { eraseLocalData } from './sync/identity.js';
import { startHub, stopHub } from './sync/hub.svelte.js';

// Azzeramento della cassa principale.
// - keepCatalog: si tengono prodotti, marchi, clienti, nome e logo dell'attività, posta e Fatture in Cloud;
//   si cancellano eventi, vendite, dotazione e DDT, e la numerazione riparte da capo.
// - altrimenti: la cassa torna come appena installata (resta solo il colore e i suoni).
// In entrambi i casi le casse secondarie vengono scollegate: andranno azzerate e ricollegate.

export async function resetSummary() {
  const r = await q(
    `SELECT (SELECT COUNT(*) FROM events) AS events, (SELECT COUNT(*) FROM sales) AS sales,
            (SELECT COUNT(*) FROM transfers) AS transfers, (SELECT COUNT(*) FROM products) AS products,
            (SELECT COUNT(*) FROM brands) AS brands,
            (SELECT COUNT(*) FROM tills WHERE role = 'secondary' AND removed = 0) AS secondaries`
  );
  return Object.fromEntries(Object.entries(r[0]).map(([k, v]) => [k, Number(v)]));
}

export async function factoryReset({ keepCatalog }) {
  const name = app.till.name;
  const tillId = app.till.id || 'C1';
  let snap = null;
  if (keepCatalog) {
    snap = {
      brands: await q('SELECT * FROM brands'),
      products: await q('SELECT * FROM products'),
      clients: await q('SELECT * FROM clients'),
      settings: await q('SELECT key, value FROM settings'),
      meta: await q(`SELECT key, value FROM meta WHERE key LIKE 'mail_%' OR key LIKE 'fic_%'`)
    };
  }
  await stopHub();
  await eraseLocalData();

  if (!keepCatalog) {
    await refreshAll();
    app.screen = 'cassa';
    app.setupNeeded = true;
    return;
  }

  // Si riparte come cassa principale di una "nuova" attività: le vecchie secondarie non potranno più collegarsi
  await setMeta('till_id', tillId);
  await setMeta('till_role', 'principal');
  await setMeta('shop_id', uuid());
  for (const m of snap.meta) await setMeta(m.key, m.value);
  setJournalTill(tillId);
  await record('till.upsert', { id: tillId, name, role: 'principal', removed: 0 });
  for (const b of snap.brands) await record('brand.upsert', { id: b.id, name: b.name });
  for (const s of snap.settings) await record('setting.upsert', { key: s.key, value: s.value });
  for (const c of snap.clients) await record('client.upsert', { id: c.id, name: c.name, address: c.address, vat: c.vat });
  for (const p of snap.products) {
    await record('product.upsert', {
      id: p.id, code: p.code, name: p.name, description: p.description, price_cents: Number(p.price_cents), vat_rate: Number(p.vat_rate),
      active: Number(p.active), alert_below: Number(p.alert_below), fic_id: p.fic_id ?? null, brand_id: p.brand_id ?? null
    });
  }
  await setCurrentEvent(null);
  await refreshAll();
  app.screen = 'cassa';
  await startHub();
}
