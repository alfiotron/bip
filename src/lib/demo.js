import { record } from './journal.js';
import { uuid } from './ids.js';
import { getMeta, setMeta, q } from './db/index.js';
import { deleteEvent, deleteProduct, productUsage } from './deletion.js';

// Dati di prova per esplorare la cassa senza inserire prodotti veri.
const PRODUCTS = [
  ['9788812345671', 'Il giardino delle ore', 'Marta Rossi', 1800, 0],
  ['9788812345688', 'Mappe del silenzio', 'Luca Bianchi', 1650, 0],
  ['9788812345695', 'Racconti di porto', 'Marta Rossi', 1400, 0],
  ['9788812345701', 'La città sospesa', 'Giulia Verdi', 2000, 0],
  ['9788812345718', 'Il custode dei fari', 'Andrea Neri', 2200, 0],
  ['8051234500011', 'Segnalibro in ottone', '', 600, 22],
  ['8051234500028', 'Shopper in tela', '', 1200, 22],
  ['8051234500035', 'Rotte di sale', 'Gioco da tavolo, 2-4 giocatori', 3500, 22]
];

export async function loadDemoData() {
  const ids = [];
  for (const [code, name, description, price_cents, vat_rate] of PRODUCTS) {
    const id = uuid();
    ids.push(id);
    await record('product.upsert', { id, code, name, description, price_cents, vat_rate, active: 1, alert_below: 5, fic_id: null, brand_id: null });
  }
  const eventId = uuid();
  await record('event.upsert', { id: eventId, name: 'Fiera di prova', is_open: 1 });
  const prev = JSON.parse((await getMeta('demo', '')) || '{"events":[],"products":[]}');
  await setMeta('demo', JSON.stringify({ events: [...prev.events, eventId], products: [...prev.products, ...ids] }));
  return eventId;
}

/** Eventi e prodotti di prova: quelli registrati da questa versione, più quelli riconoscibili per nome e codice. */
async function demoIds() {
  const d = JSON.parse((await getMeta('demo', '')) || '{"events":[],"products":[]}');
  const evs = await q(`SELECT id FROM events WHERE name = 'Fiera di prova'`);
  const prods = await q('SELECT id, code, name FROM products');
  const known = new Map(PRODUCTS.map((p) => [p[0], p[1]]));
  const events = [...new Set([...d.events, ...evs.map((e) => e.id)])];
  const products = [...new Set([...d.products, ...prods.filter((p) => known.get(p.code) === p.name).map((p) => p.id)])];
  return { events, products };
}

export async function hasDemoData() {
  const d = await demoIds();
  const ev = d.events.length ? await q(`SELECT COUNT(*) AS n FROM events WHERE id IN (${d.events.map(() => '?').join(',')})`, d.events) : [{ n: 0 }];
  const pr = d.products.length ? await q(`SELECT COUNT(*) AS n FROM products WHERE id IN (${d.products.map(() => '?').join(',')})`, d.products) : [{ n: 0 }];
  return Number(ev[0].n) + Number(pr[0].n) > 0;
}

/**
 * Elimina gli eventi e i prodotti creati con "Carica dati di prova", con tutte le vendite
 * registrate su quegli eventi. I prodotti di prova usati in eventi veri restano.
 */
export async function removeDemoData() {
  const d = await demoIds();
  for (const id of d.events) await deleteEvent(id);
  const kept = [];
  for (const id of d.products) {
    if ((await productUsage(id)).used) kept.push(id);
    else await deleteProduct(id);
  }
  await setMeta('demo', JSON.stringify({ events: [], products: kept }));
  return { events: d.events.length, products: d.products.length - kept.length, kept: kept.length };
}

export const DEMO_CODES = PRODUCTS.map((p) => p[0]);
