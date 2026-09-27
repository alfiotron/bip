import { q } from './db/index.js';
import { record } from './journal.js';

// Eliminazioni. Un prodotto si può eliminare solo se non compare in nessuna vendita,
// dotazione o DDT: altrimenti si perderebbe lo storico. Un evento si elimina insieme
// a tutto ciò che vi è stato registrato.

export async function productUsage(productId) {
  const r = await q(
    `SELECT
       (SELECT COUNT(DISTINCT s.event_id) FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id WHERE sl.product_id = ?) AS sale_events,
       (SELECT COUNT(*) FROM stock_moves WHERE product_id = ?) AS moves,
       (SELECT COUNT(*) FROM transfer_lines WHERE product_id = ?) AS transfers`,
    [productId, productId, productId]
  );
  const x = r[0];
  return { saleEvents: Number(x.sale_events), moves: Number(x.moves), transfers: Number(x.transfers), used: Number(x.sale_events) + Number(x.moves) + Number(x.transfers) > 0 };
}

export async function eventUsage(eventId) {
  const r = await q(
    `SELECT
       (SELECT COUNT(*) FROM sales WHERE event_id = ?) AS sales,
       (SELECT COUNT(*) FROM transfers WHERE event_id = ?) AS transfers,
       (SELECT COUNT(*) FROM stock_moves WHERE event_id = ?) AS moves`,
    [eventId, eventId, eventId]
  );
  return { sales: Number(r[0].sales), transfers: Number(r[0].transfers), moves: Number(r[0].moves) };
}

export const deleteProduct = (id) => record('product.delete', { id });
export const deleteEvent = (id) => record('event.delete', { id });
