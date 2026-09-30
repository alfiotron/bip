import { parseAmount } from './money.js';
import { plausibleCode } from './codes.js';
import { buildXlsx } from './xlsx.js';
import { saveFile } from './save.js';

// Importazione dell'anagrafica da Excel o CSV: riconoscimento delle colonne e controllo delle righe.

export const FIELDS = [
  { key: 'name', label: 'Nome', required: true },
  { key: 'code', label: 'Codice a barre' },
  { key: 'price', label: 'Prezzo', required: true },
  { key: 'vat', label: 'IVA' },
  { key: 'description', label: 'Descrizione' },
  { key: 'brand', label: 'Marchio' }
];

const SYNONYMS = {
  name: ['nome', 'titolo', 'prodotto', 'nome prodotto', 'articolo', 'denominazione', 'title', 'name'],
  code: ['codice', 'codice a barre', 'barcode', 'isbn', 'ean', 'ean13', 'isbn13', 'sku', 'cod', 'codice articolo', 'code'],
  price: ['prezzo', 'prezzo di vendita', 'prezzo copertina', 'prezzo ivato', 'prezzo ivato incluso', 'pvp', 'listino', 'prezzo al pubblico', 'price'],
  vat: ['iva', 'aliquota', 'aliquota iva', '% iva', 'vat'],
  description: ['descrizione', 'autore', 'autori', 'note', 'formato', 'description'],
  brand: ['marchio', 'brand', 'editore', 'marca', 'collana']
};

const clean = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9% ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Prima riga con almeno due celle piene: la consideriamo l'intestazione. */
export function headerRowIndex(rows) {
  const i = rows.findIndex((r) => r.filter((c) => String(c).trim() !== '').length >= 2);
  return i < 0 ? 0 : i;
}

/** Abbina le colonne del file ai campi, dai nomi delle intestazioni. */
export function guessMapping(header) {
  const h = header.map(clean);
  const map = {};
  const used = new Set();
  for (const key of ['code', 'price', 'vat', 'brand', 'name', 'description']) {
    let i = h.findIndex((x, j) => !used.has(j) && SYNONYMS[key].includes(x));
    if (i < 0) i = h.findIndex((x, j) => !used.has(j) && x && SYNONYMS[key].some((s) => x.startsWith(s + ' ') || x.includes(' ' + s)));
    if (i >= 0) { map[key] = i; used.add(i); }
  }
  // Senza una colonna "Nome", spesso il nome del prodotto sta nella colonna "Descrizione"
  if (map.name === undefined && map.description !== undefined) { map.name = map.description; delete map.description; }
  return map;
}

function parseVat(v, fallback) {
  if (v === '' || v === null || v === undefined) return { value: fallback };
  if (typeof v === 'number') {
    const n = v > 0 && v < 1 ? Math.round(v * 100) : Math.round(v);
    return [0, 4, 5, 10, 22].includes(n) ? { value: n } : { error: `Aliquota IVA non valida: ${v}` };
  }
  const s = clean(v);
  if (/(assolt|esent|art 74|74|fuori campo|^0$|^0 ?%$)/.test(s)) return { value: 0 };
  const m = s.match(/^(\d{1,2})( ?%)?$/);
  if (m && [0, 4, 5, 10, 22].includes(Number(m[1]))) return { value: Number(m[1]) };
  return { error: `Aliquota IVA non valida: ${v}` };
}

function parsePrice(v) {
  if (typeof v === 'number') return Math.round(v * 100);
  const s = String(v ?? '').replace(/€|eur/gi, '').replace(/\s/g, '');
  return parseAmount(s);
}

function parseCode(v) {
  if (v === '' || v === null || v === undefined) return { value: '' };
  if (typeof v === 'number') return { value: String(Math.round(v)) };
  const s = String(v).trim();
  if (/e\+?\d+$/i.test(s) && /[,.]/.test(s)) return { error: 'Excel ha scritto il codice in formato scientifico: formatta la colonna come testo e reincolla i codici.' };
  const code = s.replace(/[\s-]/g, '').toUpperCase();
  return plausibleCode(code) ? { value: code } : { error: `Codice non valido: ${s}` };
}

/** Trasforma le righe del file in prodotti, segnalando gli errori riga per riga. */
export function parseRows(rows, headerIdx, map, defaultVat) {
  const items = [];
  const errors = [];
  const seen = new Map();
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (k) => (map[k] === undefined ? '' : row[map[k]] ?? '');
    if (row.every((c) => String(c).trim() === '')) continue;
    const line = r + 1; // numero di riga come in Excel
    const name = String(get('name')).trim();
    const price = parsePrice(get('price'));
    const code = parseCode(get('code'));
    const vat = parseVat(get('vat'), defaultVat);
    const probs = [];
    if (!name) probs.push('manca il nome');
    if (isNaN(price) || price <= 0) probs.push(`prezzo non valido${String(get('price')).trim() ? ': ' + get('price') : ''}`);
    if (code.error) probs.push(code.error);
    if (vat.error) probs.push(vat.error);
    if (!code.error && code.value && seen.has(code.value)) probs.push(`codice già presente alla riga ${seen.get(code.value)}`);
    if (probs.length) { errors.push({ line, name, text: probs.join(', ') }); continue; }
    if (code.value) seen.set(code.value, line);
    items.push({ key: 'r' + line, line, code: code.value, name, description: String(get('description')).trim(), price_cents: price, vat_rate: vat.value, brand_name: String(get('brand')).trim() });
  }
  return { items, errors };
}

/** Modello di file Excel da compilare. */
export async function saveTemplate() {
  const bytes = buildXlsx([{
    name: 'Prodotti',
    columns: [
      { header: 'Nome', width: 36 }, { header: 'Codice', width: 18 }, { header: 'Prezzo', width: 10 },
      { header: 'IVA', width: 10 }, { header: 'Descrizione', width: 30 }, { header: 'Marchio', width: 22 }
    ],
    rows: [
      ['Il giardino delle ore', '9788812345671', 18, 'Assolta', 'Marta Rossi', 'Edizioni Aurora'],
      ['Rotte di sale', '8051234500035', 35, 22, 'Gioco da tavolo, 2-4 giocatori', 'Giochi Rotta']
    ]
  }]);
  return saveFile('Modello prodotti Bip.xlsx', bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel', ['xlsx']);
}


/** Esporta il catalogo nello stesso formato del modello: si reimporta su un'altra cassa. */
export async function exportCatalog(products, brandName, filename = 'Catalogo Bip.xlsx') {
  const bytes = buildXlsx([{
    name: 'Prodotti',
    columns: [
      { header: 'Nome', width: 36 }, { header: 'Codice', width: 18 }, { header: 'Prezzo', width: 10, type: 'money' },
      { header: 'IVA', width: 10 }, { header: 'Descrizione', width: 30 }, { header: 'Marchio', width: 22 }, { header: 'In vendita', width: 11 }
    ],
    rows: products.map((p) => [p.name, p.code || '', p.price_cents, p.vat_rate ? p.vat_rate : 'Assolta', p.description || '', p.brand_id ? brandName(p.brand_id) : '', p.active ? 'Sì' : 'No'])
  }]);
  return saveFile(filename, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel', ['xlsx']);
}
