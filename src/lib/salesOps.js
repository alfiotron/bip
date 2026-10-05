import { record } from './journal.js';
import { app, refreshEventData } from './state.svelte.js';
import { pos } from './pos.svelte.js';

// Correzioni delle vendite. Valgono su tutte le casse.

export const VOID_REASONS = ['Errore di cassa', 'Reso del cliente', 'Altro'];

/** Annulla una vendita: resta nell'elenco come "annullata", ma non conta più. */
export async function voidSale(saleId, reason = null) {
  await record('sale.void', { sale_id: saleId, reason });
  await refreshEventData();
}

/** Cambia il metodo di pagamento di una vendita già registrata (carta ↔ contanti). */
export async function changeMethod(saleId, method) {
  await record('sale.method', { sale_id: saleId, method });
  await refreshEventData();
}

/**
 * Correzione completa: la vendita viene annullata e i suoi prodotti tornano nel carrello,
 * con lo stesso sconto, per essere corretti e pagati di nuovo.
 */
export async function correctSale(sale) {
  await voidSale(sale.id, 'Correzione');
  pos.lines = sale.lines.map((l) => ({
    key: l.product_id || 'free-' + l.id,
    product_id: l.product_id || null,
    code: l.code || '',
    name: l.name,
    unit_cents: l.unit_cents,
    vat_rate: l.vat_rate,
    qty: l.qty,
    free: !l.product_id,
    brand_id: l.brand_id || l.brand || null
  }));
  pos.discount = sale.discount_kind === 'pct' || sale.discount_kind === 'eur' ? { kind: sale.discount_kind, value: Number(sale.discount_value) } : { kind: 'pct', value: 0 };
  pos.view = 'cart';
  pos.panel = 'cart';
  app.screen = 'cassa';
}

/** Cancella tutte le vendite registrate finora su un evento (per esempio le prove prima della fiera). */
export async function resetEventSales(eventId) {
  await record('event.sales.reset', { event_id: eventId });
  await refreshEventData();
}
