import { q } from './db/index.js';
import { record } from './journal.js';
import { uuid } from './ids.js';
import { reloadBrands, reloadProducts } from './state.svelte.js';

// Marchi: servono a sapere chi ha venduto cosa quando la cassa vende prodotti di più marchi.

export async function createBrand(name) {
  const payload = { id: uuid(), name: name.trim() };
  await record('brand.upsert', payload);
  await reloadBrands();
  return payload;
}

export async function renameBrand(id, name) {
  await record('brand.upsert', { id, name: name.trim() });
  await reloadBrands();
}

export async function brandUsage(id) {
  const r = await q(
    `SELECT (SELECT COUNT(*) FROM products WHERE brand_id = ?) AS products,
            (SELECT COUNT(*) FROM sale_lines WHERE brand_id = ?) AS lines`,
    [id, id]
  );
  return { products: Number(r[0].products), lines: Number(r[0].lines) };
}

export async function deleteBrand(id) {
  await record('brand.delete', { id });
  await reloadBrands();
  await reloadProducts();
}

/** Nomi già usati (senza distinguere maiuscole e minuscole). */
export const brandExists = (brands, name, exceptId = null) =>
  brands.some((b) => b.id !== exceptId && b.name.trim().toLowerCase() === name.trim().toLowerCase());
