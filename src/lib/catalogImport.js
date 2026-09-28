import { record } from './journal.js';
import { uuid } from './ids.js';
import { reloadProducts, bump } from './state.svelte.js';

// Regole comuni alle importazioni dell'anagrafica (Fatture in Cloud ed Excel).
// Ogni elemento da importare è { fic_id?, code, name, description, price_cents, vat_rate }.

const norm = (s) => String(s || '').trim().toLowerCase();

/** Trova il prodotto già in catalogo: prima dal collegamento con Fatture in Cloud, poi dal codice, poi (senza codice) dal nome. */
export function matchLocal(item, products) {
  if (item.fic_id) {
    const p = products.find((x) => x.fic_id && x.fic_id === item.fic_id);
    if (p) return p;
  }
  if (item.code) return products.find((x) => x.code === item.code) || null;
  return products.find((x) => !x.code && norm(x.name) === norm(item.name)) || null;
}

/** new: nuovo · changed: dati diversi · link: uguale ma da collegare a Fatture in Cloud · same: identico */
export function statusOf(item, p) {
  if (!p) return 'new';
  const changed = p.name !== item.name || (p.description || '') !== (item.description || '') || p.price_cents !== item.price_cents || p.vat_rate !== item.vat_rate || (p.code || '') !== (item.code || '');
  if (changed) return 'changed';
  if (item.fic_id && p.fic_id !== item.fic_id) return 'link';
  return 'same';
}

export const STATUS_TAGS = { new: ['', 'Nuovo'], changed: ['warn', 'Modificato'], link: ['off', 'Da collegare'], same: ['off', 'Già presente'] };

/**
 * Scrive i prodotti nel catalogo, tutti nel marchio scelto.
 * Con "Senza marchio" i prodotti già presenti mantengono il loro marchio.
 */
export async function importItems(items, brandId) {
  let created = 0, updated = 0, moved = 0;
  for (const it of items) {
    const p = it.local;
    if (p && brandId && p.brand_id && p.brand_id !== brandId) moved++;
    await record('product.upsert', {
      id: p ? p.id : uuid(),
      code: it.code || '',
      name: it.name,
      description: it.description || '',
      price_cents: it.price_cents,
      vat_rate: it.vat_rate,
      active: p ? (p.active ? 1 : 0) : 1,
      alert_below: p ? p.alert_below : 5,
      fic_id: it.fic_id || (p ? p.fic_id ?? null : null),
      brand_id: brandId || (p ? p.brand_id || null : null)
    });
    p ? updated++ : created++;
  }
  await reloadProducts();
  bump();
  return { created, updated, moved };
}

export function importMessage(r, brandName) {
  const parts = [];
  if (r.created) parts.push(r.created === 1 ? '1 prodotto nuovo' : `${r.created} prodotti nuovi`);
  if (r.updated) parts.push(r.updated === 1 ? '1 aggiornato' : `${r.updated} aggiornati`);
  let m = (parts.join(', ') || 'Nessun prodotto importato') + (brandName ? ` nel marchio ${brandName}` : '') + '.';
  if (r.moved) m += r.moved === 1 ? ' 1 prodotto è stato spostato da un altro marchio.' : ` ${r.moved} prodotti sono stati spostati da altri marchi.`;
  return m;
}
