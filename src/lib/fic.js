import { isTauri } from './db/index.js';

// Collegamento a Fatture in Cloud, in sola lettura: prodotti e DDT emessi.
// Documentazione: https://developers.fattureincloud.it
//
// Le richieste partono dalla parte Rust dell'app (plugin HTTP di Tauri), così non ci sono
// problemi di CORS e il token non passa da siti esterni. Nel browser di sviluppo si usano
// dati simulati (fic-mock.js).

const BASE = 'https://api-v2.fattureincloud.it';

export class FicError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

async function get(path, token) {
  if (!isTauri()) {
    if (import.meta.env.DEV) {
      const { mockGet } = await import('./fic-mock.js');
      return mockGet(path, token);
    }
    throw new FicError('env', 'Fatture in Cloud è disponibile solo nell\'app.');
  }
  const { fetch } = await import('@tauri-apps/plugin-http');
  let res;
  try {
    res = await fetch(BASE + path, { method: 'GET', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
  } catch (err) {
    throw new FicError('net', 'Impossibile raggiungere Fatture in Cloud. Controlla la connessione a internet.');
  }
  if (res.status === 401) throw new FicError('auth', 'Il token non è valido o è stato revocato. Generane uno nuovo in Fatture in Cloud.');
  if (res.status === 403) throw new FicError('scope', 'Il token non ha i permessi necessari: servono "Prodotti" e "DDT" in lettura.');
  if (res.status === 429) throw new FicError('rate', 'Troppe richieste a Fatture in Cloud. Riprova tra un minuto.');
  if (!res.ok) throw new FicError('http', `Fatture in Cloud ha risposto con un errore (${res.status}). Riprova più tardi.`);
  return res.json();
}

/** Aziende a cui il token dà accesso. */
export async function listCompanies(token) {
  const r = await get('/user/companies', token);
  return (r.data?.companies || []).map((c) => ({ id: c.id, name: c.name }));
}

/** Tutti i prodotti dell'anagrafica, pagina per pagina. */
export async function fetchAllProducts(token, companyId, onProgress) {
  const out = [];
  let page = 1;
  let last = 1;
  do {
    const r = await get(`/c/${companyId}/products?fieldset=detailed&per_page=100&page=${page}&sort=name`, token);
    out.push(...(r.data || []));
    last = r.last_page || 1;
    if (onProgress) onProgress(out.length, r.total || out.length);
    page++;
  } while (page <= last);
  return out.map(mapProduct);
}

function grossCents(price, vat, gross) {
  if (gross !== null && gross !== undefined && gross !== '') return Math.round(Number(gross) * 100);
  if (price === null || price === undefined) return 0;
  return Math.round(Number(price) * (1 + (vat || 0) / 100) * 100);
}

export function mapProduct(p) {
  const vat = Math.round(Number(p.default_vat?.value ?? 0));
  return {
    fic_id: String(p.id),
    code: String(p.code || '').trim().toUpperCase(),
    name: String(p.name || '').trim() || 'Prodotto senza nome',
    description: String(p.description || '').trim(),
    price_cents: grossCents(p.net_price, vat, p.use_gross_prices || p.gross_price ? p.gross_price : null),
    vat_rate: vat
  };
}

/** Elenco dei DDT emessi, dal più recente. */
export async function listDeliveryNotes(token, companyId, page = 1) {
  const r = await get(`/c/${companyId}/issued_documents?type=delivery_note&fieldset=basic&sort=-date&per_page=50&page=${page}`, token);
  return {
    items: (r.data || []).map((d) => ({
      id: String(d.id),
      number: [d.numeration, d.number].filter((x) => x !== null && x !== undefined && x !== '').join('') || String(d.number ?? d.id),
      date: d.date || '',
      to: d.entity?.name || ''
    })),
    lastPage: r.last_page || 1
  };
}

/** Righe di un DDT emesso. */
export async function getDeliveryNote(token, companyId, id) {
  const r = await get(`/c/${companyId}/issued_documents/${id}`, token);
  const d = r.data || {};
  return (d.items_list || []).map((it) => {
    const vat = Math.round(Number(it.vat?.value ?? 0));
    return {
      fic_product_id: it.product_id ? String(it.product_id) : null,
      code: String(it.code || '').trim().toUpperCase(),
      name: String(it.name || '').trim(),
      qty: Math.round(Number(it.qty || 0)),
      price_cents: grossCents(it.net_price, vat, it.gross_price ?? null),
      vat_rate: vat
    };
  });
}

/** Data ISO (2026-10-24) in formato leggibile (24/10/2026). */
export const ficDate = (d) => (d ? d.split('-').reverse().join('/') : '');
