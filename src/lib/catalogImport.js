import { record } from './journal.js';
import { uuid } from './ids.js';
import { app, reloadProducts, reloadBrands, bump } from './state.svelte.js';

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
export async function importItems(items, brandId, useItemBrands = false) {
  let created = 0, updated = 0, moved = 0, brandsCreated = 0;
  // Con useItemBrands ogni prodotto va nel marchio indicato nel file (per nome); quelli che mancano si creano
  const byName = new Map(app.brands.map((b) => [norm(b.name), b.id]));
  async function brandFor(name) {
    const k = norm(name);
    if (!k) return null;
    if (!byName.has(k)) {
      const id = uuid();
      await record('brand.upsert', { id, name: String(name).trim() });
      byName.set(k, id);
      brandsCreated++;
    }
    return byName.get(k);
  }
  for (const it of items) {
    const p = it.local;
    const target = useItemBrands ? (await brandFor(it.brand_name)) || null : brandId;
    if (p && target && p.brand_id && p.brand_id !== target) moved++;
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
      brand_id: target || (p ? p.brand_id || null : null)
    });
    p ? updated++ : created++;
  }
  if (brandsCreated) await reloadBrands();
  await reloadProducts();
  bump();
  return { created, updated, moved, brandsCreated };
}

export function importMessage(r, brandName) {
  const parts = [];
  if (r.created) parts.push(r.created === 1 ? '1 prodotto nuovo' : `${r.created} prodotti nuovi`);
  if (r.updated) parts.push(r.updated === 1 ? '1 aggiornato' : `${r.updated} aggiornati`);
  let m = (parts.join(', ') || 'Nessun prodotto importato') + (brandName ? ` nel marchio ${brandName}` : '') + '.';
  if (r.moved) m += r.moved === 1 ? ' 1 prodotto è stato spostato da un altro marchio.' : ` ${r.moved} prodotti sono stati spostati da altri marchi.`;
  if (r.brandsCreated) m += r.brandsCreated === 1 ? ' Creato 1 nuovo marchio.' : ` Creati ${r.brandsCreated} nuovi marchi.`;
  return m;
}
