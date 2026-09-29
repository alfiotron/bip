import { app, currentEvent, productByCode, refreshEventData } from './state.svelte.js';
import { showToast, setStatus } from './ui.svelte.js';
import { record } from './journal.js';
import { uuid } from './ids.js';
import { eur } from './money.js';
import { codeLabel } from './codes.js';

export const DISCOUNT_PRESETS = [0, 5, 10, 15, 20];

// Carrello e stato della schermata di vendita.
class Pos {
  lines = $state([]); // { key, product_id, code, name, unit_cents, vat_rate, qty, free }
  discount = $state({ kind: 'pct', value: 0 }); // pct: percentuale; eur: centesimi
  view = $state('cart'); // area principale: 'cart' | 'search' | 'manual'
  panel = $state('cart'); // pannello di destra: 'cart' | 'discount' | 'pay'
  pay = $state(null); // { method: 'card' | 'cash' | 'gift', round: null | cents, received: null | cents, giftTo: null | string }
  highlight = $state(null);
  manualPrefill = $state('');

  get subtotal() {
    return this.lines.reduce((s, l) => s + l.unit_cents * l.qty, 0);
  }
  get discountCents() {
    const sub = this.subtotal;
    if (this.discount.kind === 'pct') return Math.round((sub * this.discount.value) / 100);
    return Math.min(this.discount.value, sub);
  }
  get total() {
    return this.subtotal - this.discountCents;
  }
  get pieces() {
    return this.lines.reduce((s, l) => s + l.qty, 0);
  }
  get isPresetDiscount() {
    return this.discount.kind === 'pct' && DISCOUNT_PRESETS.includes(this.discount.value);
  }
}

export const pos = new Pos();

let hlTimer;
function flash(key) {
  pos.highlight = key;
  clearTimeout(hlTimer);
  hlTimer = setTimeout(() => { pos.highlight = null; }, 800);
}

/** Pezzi rimasti in fiera per un prodotto, tolti quelli già nel carrello. null se la dotazione non è gestita. */
export function leftInFair(productId) {
  if (!app.stock.has) return null;
  const s = app.stock.map[productId];
  const inCart = pos.lines.find((l) => l.product_id === productId)?.qty || 0;
  return { loaded: s ? s.loaded : 0, left: (s ? s.left : 0) - inCart };
}

export function addProduct(p, code = '') {
  const key = 'p:' + p.id;
  const i = pos.lines.findIndex((l) => l.key === key);
  if (i >= 0) {
    const line = pos.lines[i];
    line.qty += 1;
    pos.lines.splice(i, 1);
    pos.lines.unshift(line);
  } else {
    pos.lines.unshift({ key, product_id: p.id, code: p.code, name: p.name, unit_cents: p.price_cents, vat_rate: p.vat_rate, qty: 1, free: false, brand_id: p.brand_id || null });
  }
  pos.pay = null;
  pos.panel = 'cart';
  pos.view = 'cart';
  flash(key);

  const qty = pos.lines[0].qty;
  const stock = leftInFair(p.id);
  if (stock && !stock.loaded) {
    setStatus('warn', 'Non risulta portato in fiera', 4000);
    showToast('warn', 'Non risulta portato in fiera', { detail: `${p.name}: aggiunto comunque al carrello. Controlla la dotazione.`, code });
  } else if (stock && stock.left < 0) {
    setStatus('warn', 'Risulta finito in fiera', 4000);
    showToast('warn', 'Risulta finito in fiera', { detail: `${p.name}: aggiunto comunque al carrello. Controlla le scatole o registra un rifornimento.`, code });
  } else {
    if (code) setStatus('ok', 'Letto ' + code);
    showToast('ok', p.name, { detail: qty > 1 ? `Aggiunto al carrello, ora ${qty} pezzi` : 'Aggiunto al carrello', code });
  }
}

/** Lettura dallo scanner o codice digitato a mano. */
export function scan(code) {
  if (!currentEvent()) {
    showToast('warn', 'Nessun evento aperto', { detail: 'Scegli un evento aperto in alto per registrare le vendite.', code });
    return false;
  }
  const p = productByCode(code);
  if (!p) {
    setStatus('err', 'Non in catalogo: ' + code);
    showToast('err', 'Codice non in catalogo', {
      detail: 'Controlla il prodotto o vendilo come voce libera.',
      code,
      action: { label: 'Vendi come voce libera', run: () => openManual('Codice ' + code) }
    });
    return false;
  }
  if (!p.active) {
    showToast('warn', 'Prodotto non in vendita', { detail: `${p.name}. Riattivalo dalla scheda Prodotti per poterlo vendere.`, code });
    return false;
  }
  addProduct(p, code);
  return true;
}

export function changeQty(index, delta) {
  const l = pos.lines[index];
  l.qty += delta;
  if (l.qty < 1) pos.lines.splice(index, 1);
  pos.pay = null;
}

export function removeLine(index) {
  pos.lines.splice(index, 1);
  pos.pay = null;
}

export function clearSale() {
  pos.lines = [];
  pos.discount = { kind: 'pct', value: 0 };
  pos.pay = null;
  pos.panel = 'cart';
}

export function openManual(prefill = '') {
  if (!currentEvent()) return;
  pos.manualPrefill = prefill;
  pos.view = 'manual';
}

export function addManual(name, cents, vat, brandId = null) {
  const key = 'm:' + uuid();
  pos.lines.unshift({ key, product_id: null, code: '', name: name.trim() || 'Voce libera', unit_cents: cents, vat_rate: vat, qty: 1, free: true, brand_id: brandId });
  pos.view = 'cart';
  pos.pay = null;
  flash(key);
  showToast('ok', 'Voce libera aggiunta', { detail: `${name.trim() || 'Voce libera'}, ${eur(cents)}` });
}

export function startPay(method) {
  if (!currentEvent()) {
    showToast('warn', 'Nessun evento aperto', { detail: 'Scegli un evento aperto per registrare le vendite.' });
    return;
  }
  if (!pos.lines.length) {
    showToast('warn', 'Il carrello è vuoto', { detail: 'Aggiungi almeno un prodotto.' });
    return;
  }
  pos.pay = { method, round: null, received: null, giftTo: null };
  pos.panel = 'pay';
}

export async function confirmPay() {
  const e = currentEvent();
  if (!e || !pos.pay || !pos.lines.length) return;
  const gift = pos.pay.method === 'gift';
  const due = gift ? 0 : pos.pay.round ?? pos.total;
  const sale = {
    id: uuid(),
    event_id: e.id,
    method: pos.pay.method,
    subtotal_cents: pos.subtotal,
    discount_kind: gift ? null : pos.discount.value ? pos.discount.kind : null,
    discount_value: gift ? null : pos.discount.value || null,
    discount_cents: gift ? 0 : pos.discountCents,
    rounding_cents: gift ? 0 : pos.total - due,
    total_cents: due,
    gift_to: gift ? pos.pay.giftTo : null,
    lines: pos.lines.map((l) => ({
      id: uuid(),
      product_id: l.product_id,
      code: l.code || '',
      name: l.name,
      unit_cents: l.unit_cents,
      vat_rate: l.vat_rate,
      qty: l.qty,
      brand_id: l.brand_id || null
    }))
  };
  try {
    await record('sale.create', sale);
  } catch (err) {
    showToast('err', 'Vendita non registrata', { detail: 'Errore nel salvataggio: ' + (err?.message || err) });
    return;
  }
  const giftTo = pos.pay.giftTo;
  const snapshot = { lines: pos.lines.map((l) => ({ ...l })), discount: { ...pos.discount } };
  clearSale();
  await refreshEventData();
  // Per qualche secondo si può tornare indietro: la vendita viene annullata e i prodotti tornano nel carrello
  const undo = {
    label: 'Annulla e riporta nel carrello',
    run: async () => {
      const { voidSale } = await import('./salesOps.js');
      await voidSale(sale.id, 'Errore di cassa');
      pos.lines = snapshot.lines;
      pos.discount = snapshot.discount;
      pos.view = 'cart';
      pos.panel = 'cart';
      showToast('warn', gift ? 'Omaggio annullato' : 'Vendita annullata', { detail: 'I prodotti sono di nuovo nel carrello.', ms: 3000 });
    }
  };
  if (gift) showToast('ok', 'Omaggio registrato' + (giftTo ? ' per ' + giftTo.toLowerCase() : ''), { sound: 'pay', ms: 8000, action: undo });
  else showToast('ok', 'Pagamento registrato: ' + eur(due), { sound: 'pay', ms: 8000, action: undo });
  setStatus('ok', 'Vendita registrata', 2400);
}

export { codeLabel };
