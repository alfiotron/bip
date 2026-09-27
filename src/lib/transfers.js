import { q } from './db/index.js';
import { record } from './journal.js';
import { uuid } from './ids.js';

// DDT interni: rifornimenti in arrivo (in) e consegne ai negozi (out), con i rientri.

export async function loadTransfers() {
  const ts = await q(
    `SELECT t.*, c.name AS client_name, c.address AS client_address, c.vat AS client_vat, e.name AS event_name
     FROM transfers t LEFT JOIN clients c ON c.id = t.client_id LEFT JOIN events e ON e.id = t.event_id
     ORDER BY t.at DESC`
  );
  const lines = await q('SELECT * FROM transfer_lines');
  const rets = await q('SELECT * FROM transfer_returns ORDER BY at');
  const retLines = await q('SELECT * FROM transfer_return_lines');
  return ts.map((t) => {
    const tl = lines.filter((l) => l.transfer_id === t.id).map((l) => ({ ...l, qty: Number(l.qty) }));
    const tr = rets.filter((r) => r.transfer_id === t.id).map((r) => ({ ...r, lines: retLines.filter((l) => l.return_id === r.id).map((l) => ({ ...l, qty: Number(l.qty) })) }));
    const out = tl.reduce((s, l) => s + l.qty, 0);
    const back = tr.reduce((s, r) => s + r.lines.reduce((x, l) => x + l.qty, 0), 0);
    return { ...t, lines: tl, returns: tr, pieces: out, returned: back, atClient: t.direction === 'out' && t.reason !== 'sale' ? out - back : 0 };
  });
}

export async function loadClients() {
  return q('SELECT * FROM clients ORDER BY name COLLATE NOCASE');
}

/** Prossimo numero di DDT per questa cassa, per esempio C1-8. Ogni cassa ha la sua numerazione. */
export async function nextTransferNumber(tillId) {
  const rows = await q('SELECT number FROM transfers WHERE origin = ?', [tillId]);
  const max = rows.reduce((m, r) => Math.max(m, parseInt(String(r.number).split('-').pop(), 10) || 0), 0);
  return `${tillId}-${max + 1}`;
}

export async function createTransfer(tillId, t) {
  const payload = {
    id: uuid(),
    number: await nextTransferNumber(tillId),
    direction: t.direction,
    event_id: t.event_id,
    client_id: t.client_id ?? null,
    reason: t.reason ?? null,
    source: t.source || '',
    reference: t.reference || '',
    note: t.note || '',
    fic_id: t.fic_id ?? null,
    lines: t.lines.filter((l) => l.qty > 0).map((l) => ({ id: uuid(), product_id: l.product_id, qty: l.qty }))
  };
  await record('transfer.create', payload);
  return payload;
}

export async function createReturn(transferId, destination, lines) {
  const payload = {
    id: uuid(),
    transfer_id: transferId,
    destination,
    lines: lines.filter((l) => l.qty > 0).map((l) => ({ id: uuid(), product_id: l.product_id, qty: l.qty }))
  };
  await record('transfer.return', payload);
  return payload;
}

export async function createClient(name, address = '', vat = '') {
  const payload = { id: uuid(), name: name.trim(), address: address.trim(), vat: vat.trim() };
  await record('client.upsert', payload);
  return payload;
}

export const REASONS = { deposit: 'Conto deposito', approval: 'Conto visione', sale: 'Vendita' };
