import { q, x } from '../db/index.js';
import { applyPending } from '../journal.js';

// Scambio delle voci del journal tra le casse.

/** Per ogni cassa d'origine, il numero più alto già presente qui: { C1: 57, C2: 12 } */
export async function vector() {
  const rows = await q('SELECT origin, MAX(seq) AS n FROM journal GROUP BY origin');
  return Object.fromEntries(rows.map((r) => [r.origin, Number(r.n)]));
}

const toEntry = (r) => ({ id: r.id, origin: r.origin, seq: Number(r.seq), at: r.at, kind: r.kind, payload: JSON.parse(r.payload) });

/** Voci che chi ha il vettore `have` non conosce ancora, in ordine per cassa e numero. */
export async function entriesMissing(have, limit = 1000, exclude = null) {
  const known = Object.entries(have || {});
  const conds = known.map(() => '(origin = ? AND seq > ?)');
  const params = known.flatMap(([o, n]) => [o, n]);
  let where = conds.length ? `(${conds.join(' OR ')}) OR origin NOT IN (${known.map(() => '?').join(',')})` : '1 = 1';
  if (conds.length) params.push(...known.map(([o]) => o));
  if (exclude) { where = `(${where}) AND origin <> ?`; params.push(exclude); }
  const rows = await q(`SELECT * FROM journal WHERE ${where} ORDER BY origin, seq LIMIT ?`, [...params, limit + 1]);
  return { entries: rows.slice(0, limit).map(toEntry), more: rows.length > limit };
}

/** Voci create da questa cassa dopo il numero `after`. */
export async function ownEntriesAfter(origin, after, limit = 1000) {
  const rows = await q('SELECT * FROM journal WHERE origin = ? AND seq > ? ORDER BY seq LIMIT ?', [origin, after, limit + 1]);
  return { entries: rows.slice(0, limit).map(toEntry), more: rows.length > limit };
}

export async function countOwnAfter(origin, after) {
  const r = await q('SELECT COUNT(*) AS n FROM journal WHERE origin = ? AND seq > ?', [origin, after]);
  return Number(r[0].n);
}

const valid = (e) =>
  e && typeof e.id === 'string' && typeof e.origin === 'string' && Number.isInteger(e.seq) && typeof e.at === 'string' && typeof e.kind === 'string' && e.payload && typeof e.payload === 'object';

/** Aggiunge le voci ricevute (ignorando quelle già presenti) e le applica. Restituisce quante erano nuove. */
export async function ingest(entries) {
  let added = 0;
  for (const e of entries || []) {
    if (!valid(e)) continue;
    const r = await x(
      'INSERT OR IGNORE INTO journal (id, origin, seq, at, kind, payload, applied) VALUES (?, ?, ?, ?, ?, ?, 0)',
      [e.id, e.origin, e.seq, e.at, e.kind, JSON.stringify(e.payload)]
    );
    if (r && r.rowsAffected) added++;
  }
  if (added) await applyPending();
  return added;
}
