import { q } from './db/index.js';

// Dotazione di un evento: quanti pezzi sono stati portati, quanti ne sono usciti e quanti ne restano.

/**
 * Riepilogo per prodotto di un evento.
 * loaded: portati (carichi + rifornimenti) · counted: differenze da conteggio
 * sold: venduti · gifts: omaggi · ddtOut: consegnati ai negozi · ddtBack: rientrati in fiera
 * left: rimasti in fiera
 */
export async function eventSummary(eventId) {
  const map = {};
  const get = (pid) => (map[pid] = map[pid] || { loaded: 0, counted: 0, sold: 0, gifts: 0, ddtOut: 0, ddtBack: 0, left: 0 });

  for (const m of await q('SELECT product_id, kind, SUM(qty) AS n FROM stock_moves WHERE event_id = ? GROUP BY product_id, kind', [eventId])) {
    if (m.kind === 'load') get(m.product_id).loaded += Number(m.n);
    else get(m.product_id).counted += Number(m.n);
  }
  for (const t of await q(
    `SELECT tl.product_id, t.direction, SUM(tl.qty) AS n FROM transfer_lines tl JOIN transfers t ON t.id = tl.transfer_id
     WHERE t.event_id = ? GROUP BY tl.product_id, t.direction`, [eventId])) {
    if (t.direction === 'in') get(t.product_id).loaded += Number(t.n);
    else get(t.product_id).ddtOut += Number(t.n);
  }
  for (const r of await q(
    `SELECT trl.product_id, SUM(trl.qty) AS n FROM transfer_return_lines trl
     JOIN transfer_returns tr ON tr.id = trl.return_id JOIN transfers t ON t.id = tr.transfer_id
     WHERE t.event_id = ? AND tr.destination = 'fair' GROUP BY trl.product_id`, [eventId])) {
    get(r.product_id).ddtBack += Number(r.n);
  }
  for (const s of await q(
    `SELECT sl.product_id, s.method, SUM(sl.qty) AS n FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id
     WHERE s.event_id = ? AND s.voided = 0 AND sl.product_id IS NOT NULL GROUP BY sl.product_id, s.method`, [eventId])) {
    if (s.method === 'gift') get(s.product_id).gifts += Number(s.n);
    else get(s.product_id).sold += Number(s.n);
  }
  for (const o of Object.values(map)) o.left = o.loaded + o.counted - o.sold - o.gifts - o.ddtOut + o.ddtBack;
  return map;
}

/** Cronologia dei movimenti di un prodotto in un evento, dal più recente. */
export async function productHistory(eventId, productId) {
  const rows = [];
  for (const m of await q('SELECT * FROM stock_moves WHERE event_id = ? AND product_id = ?', [eventId, productId])) {
    rows.push({ at: m.at, origin: m.origin, qty: Number(m.qty), label: m.kind === 'load' ? 'Aggiunti alla dotazione' : 'Conteggio allo stand', note: m.note });
  }
  for (const t of await q(
    `SELECT t.*, c.name AS client_name, tl.qty FROM transfer_lines tl JOIN transfers t ON t.id = tl.transfer_id
     LEFT JOIN clients c ON c.id = t.client_id WHERE t.event_id = ? AND tl.product_id = ?`, [eventId, productId])) {
    const inn = t.direction === 'in';
    rows.push({
      at: t.at, origin: t.origin, qty: inn ? Number(t.qty) : -Number(t.qty),
      label: inn ? `Rifornimento DDT ${t.number}: ${t.source}` : `DDT ${t.number}: ${t.client_name || 'cliente'}`,
      note: inn ? t.reference : ''
    });
  }
  for (const r of await q(
    `SELECT tr.at, tr.origin, t.number, trl.qty FROM transfer_return_lines trl JOIN transfer_returns tr ON tr.id = trl.return_id
     JOIN transfers t ON t.id = tr.transfer_id WHERE t.event_id = ? AND trl.product_id = ? AND tr.destination = 'fair'`, [eventId, productId])) {
    rows.push({ at: r.at, origin: r.origin, qty: Number(r.qty), label: `Rientro dal DDT ${r.number}`, note: '' });
  }
  const sold = await q(
    `SELECT s.method, SUM(sl.qty) AS n FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id
     WHERE s.event_id = ? AND s.voided = 0 AND sl.product_id = ? GROUP BY s.method`, [eventId, productId]);
  rows.sort((a, b) => (a.at < b.at ? 1 : -1));
  const soldN = sold.filter((s) => s.method !== 'gift').reduce((t, s) => t + Number(s.n), 0);
  const giftN = sold.filter((s) => s.method === 'gift').reduce((t, s) => t + Number(s.n), 0);
  return { rows, sold: soldN, gifts: giftN };
}

export const fairLevel = (p, left) => (left <= 0 ? 'bad' : left <= p.alert_below ? 'warn' : '');
