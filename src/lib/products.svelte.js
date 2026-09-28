import { app, reloadProducts, productByCode } from './state.svelte.js';
import { record } from './journal.js';
import { uuid } from './ids.js';
import { parseAmount, centsToInput } from './money.js';
import { plausibleCode } from './codes.js';
import { productUsage, deleteProduct } from './deletion.js';

// Stato della scheda Prodotti (serve anche allo scanner, per aprire un prodotto leggendone il codice).
export const pf = $state({
  query: '',
  brand: '', // filtro dell'elenco: '' tutti, 'none' senza marchio, oppure l'id del marchio
  view: 'products', // 'products' | 'brands'
  form: null, // { id, code, name, description, price, vat_rate, active, alert_below }
  errors: {},
  saved: '',
  del: null // { kind: 'confirm' } oppure { kind: 'blocked', text }
});

export function editProduct(p) {
  pf.form = {
    id: p.id,
    code: p.code || '',
    name: p.name,
    description: p.description || '',
    price: centsToInput(p.price_cents),
    vat_rate: p.vat_rate,
    active: p.active,
    alert_below: String(p.alert_below),
    brand_id: p.brand_id || null
  };
  pf.errors = {};
  pf.saved = '';
  pf.del = null;
}

export function newProduct(code = '') {
  // Un nuovo prodotto eredita il marchio che si sta guardando nell'elenco
  const brand = pf.brand && pf.brand !== 'none' ? pf.brand : null;
  pf.form = { id: null, code, name: '', description: '', price: '', vat_rate: 0, active: true, alert_below: '5', brand_id: brand };
  pf.errors = {};
  pf.saved = '';
}

export function closeForm() {
  pf.form = null;
  pf.errors = {};
  pf.del = null;
}

/** Primo passo dell'eliminazione: controlla se il prodotto ha uno storico. */
export async function askDeleteProduct() {
  const u = await productUsage(pf.form.id);
  if (!u.used) { pf.del = { kind: 'confirm' }; return; }
  const parts = [];
  if (u.saleEvents) parts.push(u.saleEvents === 1 ? 'nelle vendite di un evento' : `nelle vendite di ${u.saleEvents} eventi`);
  if (u.moves) parts.push('in una dotazione');
  if (u.transfers) parts.push('in un DDT');
  pf.del = {
    kind: 'blocked',
    text: `Questo prodotto compare ${parts.join(', ')}: eliminarlo farebbe perdere lo storico. Puoi toglierlo dalla vendita con l'interruttore "In vendita", oppure eliminare prima gli eventi in cui compare.`
  };
}

export async function confirmDeleteProduct() {
  const name = pf.form.name;
  await deleteProduct(pf.form.id);
  await reloadProducts();
  pf.form = null;
  pf.del = null;
  pf.saved = `"${name}" eliminato`;
}

/** Lettura dello scanner mentre è aperta la scheda Prodotti. */
export function productsScan(code) {
  if (pf.form) {
    pf.form.code = code;
    pf.errors.code = '';
    return;
  }
  const p = productByCode(code);
  if (p) editProduct(p);
  else newProduct(code);
}

export async function saveProduct() {
  const f = pf.form;
  const e = {};
  const name = f.name.trim();
  const code = f.code.trim().toUpperCase();
  const cents = parseAmount(f.price);
  if (!name) e.name = 'Scrivi il nome del prodotto.';
  if (!String(f.price).trim() || isNaN(cents) || cents <= 0) e.price = 'Inserisci un prezzo maggiore di zero, per esempio 18,00.';
  if (code && !plausibleCode(code)) e.code = 'Il codice deve avere da 8 a 13 cifre.';
  else if (code && app.products.some((p) => p.code === code && p.id !== f.id)) e.code = 'Questo codice è già usato da un altro prodotto.';
  if (!/^\d{1,5}$/.test(String(f.alert_below).trim())) e.alert_below = 'Inserisci un numero intero, anche 0.';
  pf.errors = e;
  if (Object.keys(e).length) return false;

  const existing = f.id ? app.products.find((p) => p.id === f.id) : null;
  await record('product.upsert', {
    id: f.id || uuid(),
    code,
    name,
    description: f.description.trim(),
    price_cents: cents,
    vat_rate: f.vat_rate,
    active: f.active ? 1 : 0,
    alert_below: parseInt(f.alert_below, 10),
    fic_id: existing ? existing.fic_id ?? null : null,
    brand_id: f.brand_id || null
  });
  await reloadProducts();
  pf.form = null;
  pf.saved = 'Prodotto salvato';
  return true;
}
