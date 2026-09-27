// Dati simulati di Fatture in Cloud, usati solo nel browser di sviluppo (npm run dev).
const PRODUCTS = [
  { id: 101, code: '9788812345671', name: 'Il giardino delle ore', description: 'Marta Rossi', gross_price: 18, net_price: 18, use_gross_prices: true, default_vat: { value: 0 } },
  { id: 102, code: '9788812345688', name: 'Mappe del silenzio', description: 'Luca Bianchi', gross_price: 17, net_price: 17, use_gross_prices: true, default_vat: { value: 0 } },
  { id: 103, code: '9788812345695', name: 'Racconti di porto', description: 'Marta Rossi', gross_price: 14, net_price: 14, use_gross_prices: true, default_vat: { value: 0 } },
  { id: 106, code: '9788812345725', name: 'Il sale e la rotta', description: 'Giulia Verdi', gross_price: 19, net_price: 19, use_gross_prices: true, default_vat: { value: 0 } },
  { id: 107, code: '9788812345732', name: 'Quaderni di bordo', description: 'Andrea Neri', gross_price: 16, net_price: 16, use_gross_prices: true, default_vat: { value: 0 } },
  { id: 108, code: '9788812345749', name: 'Notturno in fiera', description: 'Marta Rossi', gross_price: 21, net_price: 21, use_gross_prices: true, default_vat: { value: 0 } },
  { id: 109, code: '8051234500011', name: 'Segnalibro in ottone', description: '', gross_price: 6, net_price: 4.92, use_gross_prices: true, default_vat: { value: 22 } },
  { id: 111, code: '', name: 'Spese di spedizione', description: '', gross_price: 8, net_price: 6.56, use_gross_prices: false, default_vat: { value: 22 } }
];
const NOTES = [
  { id: 503, number: 47, numeration: '', date: '2026-10-26', entity: { name: 'Stand Lucca Comics & Games' },
    items: [{ product_id: 106, code: '9788812345725', name: 'Il sale e la rotta', qty: 15, gross_price: 19, vat: { value: 0 } },
      { product_id: 107, code: '9788812345732', name: 'Quaderni di bordo', qty: 10, gross_price: 16, vat: { value: 0 } },
      { product_id: 108, code: '9788812345749', name: 'Notturno in fiera', qty: 12, gross_price: 21, vat: { value: 0 } }] },
  { id: 502, number: 46, numeration: '', date: '2026-10-24', entity: { name: 'Stand Lucca Comics & Games' },
    items: [{ product_id: 101, code: '9788812345671', name: 'Il giardino delle ore', qty: 20, gross_price: 18, vat: { value: 0 } },
      { product_id: 109, code: '8051234500011', name: 'Segnalibro in ottone', qty: 30, gross_price: 6, vat: { value: 22 } },
      { product_id: null, code: '', name: 'Espositore da banco', qty: 1, gross_price: 0, vat: { value: 22 } }] },
  { id: 501, number: 45, numeration: '', date: '2026-10-22', entity: { name: 'Libreria Il Mappamondo' },
    items: [{ product_id: 102, code: '9788812345688', name: 'Mappe del silenzio', qty: 6, gross_price: 17, vat: { value: 0 } }] }
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function mockGet(path, token) {
  await wait(250);
  if (!token || token.length < 6) {
    const { FicError } = await import('./fic.js');
    throw new FicError('auth', 'Il token non è valido o è stato revocato. Generane uno nuovo in Fatture in Cloud.');
  }
  if (path.startsWith('/user/companies')) return { data: { companies: [{ id: 1234, name: 'Edizioni Aurora srl (simulata)' }] } };
  if (path.includes('/products')) return { data: PRODUCTS, current_page: 1, last_page: 1, total: PRODUCTS.length };
  const m = path.match(/issued_documents\/(\d+)/);
  if (m) {
    const n = NOTES.find((x) => String(x.id) === m[1]);
    return { data: { ...n, items_list: n.items } };
  }
  if (path.includes('issued_documents')) return { data: NOTES.map(({ items, ...rest }) => rest), current_page: 1, last_page: 1 };
  return { data: [] };
}
