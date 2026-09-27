import { q } from './db/index.js';
import { splitByVat, vatPart } from './money.js';

/** Giorno di calendario (ora locale) di una data ISO: "2026-10-30". */
export const dayKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "ven 30 ott" */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const dayLabel = (k) => cap(new Date(k + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }));
/** "venerdì 30 ottobre" */
export const dayLabelLong = (k) => new Date(k + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

function summarize(sales, bySale) {
  const paid = sales.filter((s) => s.method !== 'gift');
  const gifts = sales.filter((s) => s.method === 'gift');
  const pcs = (s) => (bySale[s.id] || []).reduce((t, l) => t + l.qty, 0);
  const income = paid.reduce((t, s) => t + s.total_cents, 0);
  const methods = { card: { total: 0, count: 0 }, cash: { total: 0, count: 0 } };
  const tills = {};
  const vat = {};
  for (const s of paid) {
    methods[s.method].total += s.total_cents;
    methods[s.method].count++;
    tills[s.origin] = tills[s.origin] || { total: 0, count: 0 };
    tills[s.origin].total += s.total_cents;
    tills[s.origin].count++;
    const parts = splitByVat(bySale[s.id] || [], s.subtotal_cents, s.total_cents);
    for (const r in parts) vat[r] = (vat[r] || 0) + parts[r];
  }
  return {
    income,
    count: paid.length,
    pieces: paid.reduce((t, s) => t + pcs(s), 0),
    average: paid.length ? Math.round(income / paid.length) : 0,
    discounts: paid.reduce((t, s) => t + s.discount_cents, 0),
    rounding: paid.reduce((t, s) => t + s.rounding_cents, 0),
    gifts: { count: gifts.length, pieces: gifts.reduce((t, s) => t + pcs(s), 0), value: gifts.reduce((t, s) => t + s.subtotal_cents, 0) },
    methods,
    tills,
    vat: Object.keys(vat).map(Number).sort((a, b) => a - b).map((r) => ({ rate: r, gross: vat[r], tax: r ? vatPart(vat[r], r) : 0 }))
  };
}

/**
 * Statistiche di un evento, calcolate dalle vendite registrate.
 * Con `day` (per esempio "2026-10-30") riepilogo e prodotti si riferiscono solo a quel giorno;
 * l'andamento per giorno e l'elenco dei giorni restano sempre riferiti a tutto l'evento.
 */
export async function eventStatistics(eventId, day = null) {
  const sales = (await q('SELECT * FROM sales WHERE event_id = ? ORDER BY at', [eventId])).map((s) => ({
    ...s,
    subtotal_cents: Number(s.subtotal_cents),
    discount_cents: Number(s.discount_cents),
    rounding_cents: Number(s.rounding_cents),
    total_cents: Number(s.total_cents),
    day: dayKey(s.at)
  }));
  const lines = await q('SELECT sl.* FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id WHERE s.event_id = ?', [eventId]);
  const bySale = {};
  for (const l of lines) {
    (bySale[l.sale_id] = bySale[l.sale_id] || []).push({ ...l, qty: Number(l.qty), unit_cents: Number(l.unit_cents), vat_rate: Number(l.vat_rate) });
  }

  const days = [...new Set(sales.map((s) => s.day))].sort();
  const byDay = days.map((d) => ({ day: d, ...summarize(sales.filter((s) => s.day === d), bySale) }));
  const selected = day ? sales.filter((s) => s.day === day) : sales;

  // Prodotti: totali (del giorno scelto, se c'è) e andamento giorno per giorno
  const products = {};
  for (const s of sales) {
    for (const l of bySale[s.id] || []) {
      const key = l.product_id || 'free:' + l.name;
      const o = (products[key] = products[key] || { key, product_id: l.product_id, name: l.name, code: l.code, unit_cents: l.unit_cents, sold: 0, gifts: 0, days: {} });
      const d = (o.days[s.day] = o.days[s.day] || { sold: 0, gifts: 0 });
      if (s.method === 'gift') d.gifts += l.qty;
      else d.sold += l.qty;
      if (!day || s.day === day) {
        if (s.method === 'gift') o.gifts += l.qty;
        else o.sold += l.qty;
      }
    }
  }

  const ddt = await q(
    `SELECT
       (SELECT COALESCE(SUM(tl.qty), 0) FROM transfer_lines tl JOIN transfers t ON t.id = tl.transfer_id WHERE t.event_id = ? AND t.direction = 'out') AS out_n,
       (SELECT COALESCE(SUM(trl.qty), 0) FROM transfer_return_lines trl JOIN transfer_returns tr ON tr.id = trl.return_id JOIN transfers t ON t.id = tr.transfer_id WHERE t.event_id = ?) AS back_n`,
    [eventId, eventId]
  );

  return {
    ...summarize(selected, bySale),
    day,
    days,
    byDay,
    ddt: { out: Number(ddt[0].out_n), back: Number(ddt[0].back_n) },
    products: Object.values(products),
    sales: selected.map((s) => ({ ...s, pieces: (bySale[s.id] || []).reduce((t, l) => t + l.qty, 0), lines: bySale[s.id] || [] }))
  };
}

export const delta = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
