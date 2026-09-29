import { record } from './journal.js';
import { refreshEventData } from './state.svelte.js';

// Correzioni delle vendite. Valgono su tutte le casse.

export const VOID_REASONS = ['Errore di cassa', 'Reso del cliente', 'Altro'];

/** Annulla una vendita: resta nell'elenco come "annullata", ma non conta più. */
export async function voidSale(saleId, reason = null) {
  await record('sale.void', { sale_id: saleId, reason });
  await refreshEventData();
}

/** Cancella tutte le vendite registrate finora su un evento (per esempio le prove prima della fiera). */
export async function resetEventSales(eventId) {
  await record('event.sales.reset', { event_id: eventId });
  await refreshEventData();
}
