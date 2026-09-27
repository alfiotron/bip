import { q, x } from './db/index.js';
import { uuid, nowIso } from './ids.js';
import { applyEntry } from './apply.js';

// Ogni modifica passa da qui: viene scritta nel journal con l'identificativo di questa cassa
// e un numero progressivo, poi applicata alle tabelle. Il flag "applied" permette di
// completare all'avvio un'operazione interrotta (per esempio se il PC si spegne).

let tillId = null;
export const setJournalTill = (id) => { tillId = id; };

let chain = Promise.resolve();

async function doRecord(kind, payload) {
  const rows = await q('SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM journal WHERE origin = ?', [tillId]);
  const entry = { id: uuid(), origin: tillId, seq: Number(rows[0].n), at: nowIso(), kind, payload };
  await x(
    'INSERT INTO journal (id, origin, seq, at, kind, payload, applied) VALUES (?, ?, ?, ?, ?, ?, 0)',
    [entry.id, entry.origin, entry.seq, entry.at, entry.kind, JSON.stringify(entry.payload)]
  );
  await applyEntry(entry);
  await x('UPDATE journal SET applied = 1 WHERE id = ?', [entry.id]);
  return entry;
}

/** Registra una modifica. Le chiamate vengono messe in fila per non creare numeri doppi. */
export function record(kind, payload) {
  const p = chain.then(() => doRecord(kind, payload));
  chain = p.catch(() => {});
  return p;
}

/** All'avvio: applica le voci del journal rimaste in sospeso. */
export async function applyPending() {
  const rows = await q('SELECT * FROM journal WHERE applied = 0 ORDER BY at, origin, seq');
  for (const r of rows) {
    await applyEntry({ ...r, payload: JSON.parse(r.payload) });
    await x('UPDATE journal SET applied = 1 WHERE id = ?', [r.id]);
  }
  return rows.length;
}
