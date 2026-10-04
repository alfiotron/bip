import { q, x } from './db/index.js';

// Applica una voce del journal alle tabelle. Ogni operazione è "idempotente": applicarla
// due volte dà lo stesso risultato. È ciò che rende sicura la sincronizzazione tra casse.

const PRODUCT_COLS = ['code', 'name', 'description', 'price_cents', 'vat_rate', 'active', 'alert_below', 'fic_id', 'brand_id'];
const BRAND_COLS = ['name'];
const TILL_COLS = ['name', 'role', 'removed'];
const EVENT_COLS = ['name', 'is_open'];
const CLIENT_COLS = ['name', 'address', 'vat'];

const isDeleted = async (id) => id && (await q('SELECT 1 FROM deleted WHERE id = ?', [id])).length > 0;

async function markDeleted(id, kind, at) {
  await x('INSERT OR IGNORE INTO deleted (id, kind, at) VALUES (?, ?, ?)', [id, kind, at]);
}

/** Cancella un evento e tutto ciò che vi è stato registrato: vendite, dotazione e DDT. */
async function deleteEventData(eventId) {
  await x('DELETE FROM sale_lines WHERE sale_id IN (SELECT id FROM sales WHERE event_id = ?)', [eventId]);
  await x('DELETE FROM sales WHERE event_id = ?', [eventId]);
  await x('DELETE FROM stock_moves WHERE event_id = ?', [eventId]);
  await x(
    `DELETE FROM transfer_return_lines WHERE return_id IN
      (SELECT tr.id FROM transfer_returns tr JOIN transfers t ON t.id = tr.transfer_id WHERE t.event_id = ?)`,
    [eventId]
  );
  await x('DELETE FROM transfer_returns WHERE transfer_id IN (SELECT id FROM transfers WHERE event_id = ?)', [eventId]);
  await x('DELETE FROM transfer_lines WHERE transfer_id IN (SELECT id FROM transfers WHERE event_id = ?)', [eventId]);
  await x('DELETE FROM transfers WHERE event_id = ?', [eventId]);
  await x('DELETE FROM events WHERE id = ?', [eventId]);
}

/** Cambia il metodo di pagamento (carta o contanti) di una vendita, ricordando quello originale. */
async function setMethod(p, at) {
  if (!['card', 'cash'].includes(p.method)) return;
  const r = await q('SELECT method, method_was, edited_at FROM sales WHERE id = ?', [p.sale_id]);
  if (!r.length || r[0].method === 'gift') return;
  if (r[0].edited_at && r[0].edited_at > at) return; // c'è già una modifica più recente
  await x('UPDATE sales SET method = ?, method_was = COALESCE(method_was, ?), edited_at = ? WHERE id = ?', [p.method, r[0].method, at, p.sale_id]);
}

/** Anagrafiche (prodotti, eventi, clienti): vince la modifica più recente. */
async function upsertLatest(table, cols, p, e) {
  if (await isDeleted(p.id)) return;
  const cur = await q(`SELECT updated_at, updated_by FROM ${table} WHERE id = ?`, [p.id]);
  const values = cols.map((c) => (p[c] === undefined ? null : typeof p[c] === 'boolean' ? (p[c] ? 1 : 0) : p[c]));
  if (cur.length) {
    const c = cur[0];
    if (c.updated_at > e.at || (c.updated_at === e.at && c.updated_by > e.origin)) return;
    await x(
      `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ?, updated_by = ? WHERE id = ?`,
      [...values, e.at, e.origin, p.id]
    );
  } else {
    await x(
      `INSERT INTO ${table} (id, ${cols.join(', ')}, updated_at, updated_by) VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`,
      [p.id, ...values, e.at, e.origin]
    );
  }
}

export async function applyEntry(e) {
  const p = e.payload;
  // Registrazioni che appartengono a un evento eliminato: si ignorano.
  if (p && p.event_id && (await isDeleted(p.event_id))) return;
  // DDT e rientri eliminati (anche se la creazione arriva dopo l'eliminazione, da un'altra cassa)
  if ((e.kind === 'transfer.create' || e.kind === 'transfer.return') && (await isDeleted(p.id))) return;
  if (e.kind === 'transfer.return' && (await isDeleted(p.transfer_id))) return;
  switch (e.kind) {
    case 'product.upsert':
      return upsertLatest('products', PRODUCT_COLS, p, e);
    case 'event.upsert':
      return upsertLatest('events', EVENT_COLS, p, e);
    case 'client.upsert':
      return upsertLatest('clients', CLIENT_COLS, p, e);
    case 'till.upsert':
      return upsertLatest('tills', TILL_COLS, p, e);
    case 'brand.upsert':
      return upsertLatest('brands', BRAND_COLS, p, e);
    case 'brand.delete':
      await markDeleted(p.id, 'brand', e.at);
      await x('UPDATE products SET brand_id = NULL WHERE brand_id = ?', [p.id]);
      return x('DELETE FROM brands WHERE id = ?', [p.id]);

    case 'sale.create': {
      // Vendite azzerate: se l'evento è stato azzerato dopo questa vendita, la vendita non si registra
      const reset = await q(`SELECT at FROM deleted WHERE id = ? AND kind = 'sales_reset'`, ['reset:' + p.event_id]);
      if (reset.length && reset[0].at >= e.at) return;
      await x(
        `INSERT OR IGNORE INTO sales (id, origin, event_id, at, method, subtotal_cents, discount_kind, discount_value,
          discount_cents, rounding_cents, total_cents, gift_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, e.origin, p.event_id, e.at, p.method, p.subtotal_cents, p.discount_kind ?? null, p.discount_value ?? null,
          p.discount_cents || 0, p.rounding_cents || 0, p.total_cents, p.gift_to ?? null]
      );
      for (const l of p.lines) {
        await x(
          `INSERT OR IGNORE INTO sale_lines (id, sale_id, product_id, code, name, unit_cents, vat_rate, qty, brand_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [l.id, p.id, l.product_id ?? null, l.code || '', l.name, l.unit_cents, l.vat_rate, l.qty, l.brand_id ?? null]
        );
      }
      // Annullamento arrivato prima della vendita (da un'altra cassa): la vendita nasce già annullata
      const v = await q(`SELECT at FROM deleted WHERE id = ? AND kind = 'sale_void'`, [p.id]);
      if (v.length) await x('UPDATE sales SET voided = 1, voided_at = ? WHERE id = ?', [v[0].at, p.id]);
      // Modifiche del pagamento arrivate prima della vendita: si riapplicano ora, in ordine
      const edits = await q(`SELECT * FROM journal WHERE kind = 'sale.method' AND payload LIKE ? ORDER BY at, origin, seq`, ['%"sale_id":"' + p.id + '"%']);
      for (const ed of edits) await setMethod(JSON.parse(ed.payload), ed.at);
      return;
    }

    case 'sale.method':
      return setMethod(p, e.at);

    case 'sale.void':
      await x(`INSERT OR IGNORE INTO deleted (id, kind, at) VALUES (?, 'sale_void', ?)`, [p.sale_id, e.at]);
      return x('UPDATE sales SET voided = 1, voided_at = ?, void_reason = ? WHERE id = ? AND voided = 0', [e.at, p.reason || null, p.sale_id]);

    case 'event.sales.reset': {
      // Azzera le vendite di un evento registrate fino a questo momento, su tutte le casse
      await x(
        `INSERT INTO deleted (id, kind, at) VALUES (?, 'sales_reset', ?) ON CONFLICT(id) DO UPDATE SET at = MAX(at, excluded.at)`,
        ['reset:' + p.event_id, e.at]
      );
      await x('DELETE FROM sale_lines WHERE sale_id IN (SELECT id FROM sales WHERE event_id = ? AND at <= ?)', [p.event_id, e.at]);
      return x('DELETE FROM sales WHERE event_id = ? AND at <= ?', [p.event_id, e.at]);
    }

    case 'stock.move':
      return x(
        `INSERT OR IGNORE INTO stock_moves (id, origin, event_id, product_id, kind, qty, note, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, e.origin, p.event_id, p.product_id, p.kind, p.qty, p.note || '', e.at]
      );

    case 'transfer.create':
      await x(
        `INSERT OR IGNORE INTO transfers (id, origin, number, direction, event_id, at, client_id, reason, source, reference, note, fic_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, e.origin, p.number, p.direction, p.event_id, e.at, p.client_id ?? null, p.reason ?? null,
          p.source || '', p.reference || '', p.note || '', p.fic_id ?? null]
      );
      for (const l of p.lines) {
        await x('INSERT OR IGNORE INTO transfer_lines (id, transfer_id, product_id, qty) VALUES (?, ?, ?, ?)', [l.id, p.id, l.product_id, l.qty]);
      }
      return;

    case 'setting.upsert': {
      // Impostazioni condivise: vince la modifica più recente
      const cur = await q('SELECT updated_at, updated_by FROM settings WHERE key = ?', [p.key]);
      if (cur.length && (cur[0].updated_at > e.at || (cur[0].updated_at === e.at && cur[0].updated_by > e.origin))) return;
      return x(
        `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        [p.key, p.value ?? null, e.at, e.origin]
      );
    }

    case 'transfer.delete':
      await markDeleted(p.id, 'transfer', e.at);
      await x('DELETE FROM transfer_return_lines WHERE return_id IN (SELECT id FROM transfer_returns WHERE transfer_id = ?)', [p.id]);
      await x('DELETE FROM transfer_returns WHERE transfer_id = ?', [p.id]);
      await x('DELETE FROM transfer_lines WHERE transfer_id = ?', [p.id]);
      return x('DELETE FROM transfers WHERE id = ?', [p.id]);

    case 'transfer.return.delete':
      await markDeleted(p.id, 'transfer_return', e.at);
      await x('DELETE FROM transfer_return_lines WHERE return_id = ?', [p.id]);
      return x('DELETE FROM transfer_returns WHERE id = ?', [p.id]);

    case 'product.delete':
      await markDeleted(p.id, 'product', e.at);
      return x('DELETE FROM products WHERE id = ?', [p.id]);

    case 'event.delete':
      await markDeleted(p.id, 'event', e.at);
      return deleteEventData(p.id);

    case 'transfer.return':
      await x(
        'INSERT OR IGNORE INTO transfer_returns (id, origin, transfer_id, at, destination) VALUES (?, ?, ?, ?, ?)',
        [p.id, e.origin, p.transfer_id, e.at, p.destination]
      );
      for (const l of p.lines) {
        await x('INSERT OR IGNORE INTO transfer_return_lines (id, return_id, product_id, qty) VALUES (?, ?, ?, ?)', [l.id, p.id, l.product_id, l.qty]);
      }
      return;

    default:
      // Voce di un tipo sconosciuto (per esempio arrivata da una cassa con una versione più
      // recente dell'app): la conserviamo nel journal ma non la applichiamo.
      console.warn('Tipo di registrazione sconosciuto:', e.kind);
  }
}
