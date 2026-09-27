import { openDb, getMeta, setMeta, q } from './db/index.js';
import { record } from './journal.js';
import { setJournalTill, applyPending } from './journal.js';
import { loadProducts, loadEvents, eventStats, eventStock } from './data.js';
import { setSoundEnabled } from './sound.js';

// Stato condiviso dell'app. Le proprietà sono "reattive": quando cambiano,
// l'interfaccia si aggiorna da sola.
export const app = $state({
  ready: false,
  error: null,
  screen: 'cassa',
  till: { id: 'C1', name: 'Cassa 1', role: 'principal' },
  accent: 'petrol',
  sound: true,
  // Impostazioni dell'attività, uguali su tutte le casse
  shop: { name: '', logo: '', logoTop: true, logoIdle: true },
  products: [],
  events: [],
  currentEventId: null,
  stats: { sales: 0, gifts: 0, total: 0 },
  stock: { has: false, map: {} },
  version: 0 // aumenta dopo ogni modifica: le schermate lo osservano per ricaricare i dati
});

/** Da chiamare dopo una modifica ai dati, per aggiornare le schermate aperte. */
export function bump() {
  app.version++;
}

let codeIndex = new Map();

export const productByCode = (code) => codeIndex.get(code) || null;
export const productById = (id) => app.products.find((p) => p.id === id) || null;

export function currentEvent() {
  return app.events.find((e) => e.id === app.currentEventId && e.is_open) || null;
}

export async function reloadProducts() {
  app.products = await loadProducts();
  codeIndex = new Map(app.products.filter((p) => p.code).map((p) => [p.code, p]));
}

export async function reloadEvents() {
  app.events = await loadEvents();
}

export async function refreshEventData() {
  bump();
  const e = currentEvent();
  if (!e) {
    app.stats = { sales: 0, gifts: 0, total: 0 };
    app.stock = { has: false, map: {} };
    return;
  }
  app.stats = await eventStats(e.id);
  app.stock = await eventStock(e.id);
}

export async function setCurrentEvent(id) {
  app.currentEventId = id;
  await setMeta('current_event_id', id ?? '');
  await refreshEventData();
}

export function applyAccent() {
  if (app.accent === 'petrol') document.documentElement.removeAttribute('data-accent');
  else document.documentElement.setAttribute('data-accent', app.accent);
}

export async function saveSetting(key, value) {
  app[key] = value;
  await setMeta(key, typeof value === 'boolean' ? (value ? '1' : '0') : value);
  if (key === 'accent') applyAccent();
  if (key === 'sound') setSoundEnabled(value);
}

export async function saveTill(till) {
  app.till = { ...app.till, ...till };
  await setMeta('till_id', app.till.id);
  await setMeta('till_name', app.till.name);
  await setMeta('till_role', app.till.role);
  setJournalTill(app.till.id);
}

const SHOP_KEYS = { name: 'shop_name', logo: 'shop_logo', logoTop: 'shop_logo_top', logoIdle: 'shop_logo_idle' };

export async function loadShop() {
  const rows = await q('SELECT key, value FROM settings');
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  // L'intestazione era salvata solo su questa cassa: la si porta tra le impostazioni condivise
  if (v.shop_name === undefined) {
    const old = await getMeta('businessName', '');
    if (old) { await record('setting.upsert', { key: 'shop_name', value: old }); v.shop_name = old; }
  }
  app.shop = {
    name: v.shop_name || '',
    logo: v.shop_logo || '',
    logoTop: v.shop_logo_top !== '0',
    logoIdle: v.shop_logo_idle !== '0'
  };
}

/** Salva un'impostazione dell'attività: finisce nel journal e raggiunge le altre casse. */
export async function saveShop(field, value) {
  const stored = typeof value === 'boolean' ? (value ? '1' : '0') : value;
  await record('setting.upsert', { key: SHOP_KEYS[field], value: stored });
  app.shop = { ...app.shop, [field]: value };
}

export async function init() {
  try {
    await openDb();
    app.till = {
      id: await getMeta('till_id', 'C1'),
      name: await getMeta('till_name', 'Cassa 1'),
      role: await getMeta('till_role', 'principal')
    };
    setJournalTill(app.till.id);
    await applyPending();
    app.accent = await getMeta('accent', 'petrol');
    app.sound = (await getMeta('sound', '1')) === '1';
    await loadShop();
    setSoundEnabled(app.sound);
    applyAccent();
    await reloadProducts();
    await reloadEvents();
    app.currentEventId = (await getMeta('current_event_id', '')) || null;
    await refreshEventData();
    app.ready = true;
  } catch (err) {
    console.error(err);
    app.error = String(err && err.message ? err.message : err);
  }
}
