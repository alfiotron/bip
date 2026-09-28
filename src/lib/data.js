import { q } from './db/index.js';

// Letture dal database usate da più schermate.

export async function loadProducts() {
  const rows = await q('SELECT * FROM products ORDER BY name COLLATE NOCASE');
  return rows.map((r) => ({ ...r, active: !!r.active }));
}

export async function loadBrands() {
  return q('SELECT * FROM brands ORDER BY name COLLATE NOCASE');
}

export async function loadEvents() {
  const rows = await q('SELECT * FROM events ORDER BY is_open DESC, updated_at DESC');
  return rows.map((r) => ({ ...r, is_open: !!r.is_open }));
}

/** Vendite, omaggi e incasso di un evento. */
export async function eventStats(eventId) {
  const rows = await q(
    `SELECT
       SUM(CASE WHEN method <> 'gift' THEN 1 ELSE 0 END) AS sales,
       SUM(CASE WHEN method = 'gift' THEN 1 ELSE 0 END) AS gifts,
       COALESCE(SUM(total_cents), 0) AS total
     FROM sales WHERE event_id = ?`,
    [eventId]
  );
  const r = rows[0] || {};
  return { sales: Number(r.sales || 0), gifts: Number(r.gifts || 0), total: Number(r.total || 0) };
}

/**
 * Dotazione di un evento, prodotto per prodotto:
 * portati (carichi + rifornimenti) e rimasti (portati + conteggi − venduti − consegnati + rientrati in fiera).
 */
export async function eventStock(eventId) {
  const map = {};
  const get = (pid) => (map[pid] = map[pid] || { loaded: 0, left: 0 });

  const moves = await q(
    'SELECT product_id, kind, SUM(qty) AS q FROM stock_moves WHERE event_id = ? GROUP BY product_id, kind',
    [eventId]
  );
  for (const m of moves) {
    const o = get(m.product_id);
    if (m.kind === 'load') o.loaded += Number(m.q);
    o.left += Number(m.q);
  }

  const tr = await q(
    `SELECT tl.product_id, t.direction, SUM(tl.qty) AS q
     FROM transfer_lines tl JOIN transfers t ON t.id = tl.transfer_id
     WHERE t.event_id = ? GROUP BY tl.product_id, t.direction`,
    [eventId]
  );
  for (const t of tr) {
    const o = get(t.product_id);
    if (t.direction === 'in') { o.loaded += Number(t.q); o.left += Number(t.q); }
    else o.left -= Number(t.q);
  }

  const rets = await q(
    `SELECT trl.product_id, SUM(trl.qty) AS q
     FROM transfer_return_lines trl
     JOIN transfer_returns tr ON tr.id = trl.return_id
     JOIN transfers t ON t.id = tr.transfer_id
     WHERE t.event_id = ? AND tr.destination = 'fair'
     GROUP BY trl.product_id`,
    [eventId]
  );
  for (const r of rets) get(r.product_id).left += Number(r.q);

  const sold = await q(
    `SELECT sl.product_id, SUM(sl.qty) AS q
     FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id
     WHERE s.event_id = ? AND sl.product_id IS NOT NULL
     GROUP BY sl.product_id`,
    [eventId]
  );
  for (const s of sold) get(s.product_id).left -= Number(s.q);

  const has = Object.values(map).some((o) => o.loaded > 0);
  return { has, map };
}
