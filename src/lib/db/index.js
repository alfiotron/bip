import { migrate } from './schema.js';

let db = null;

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function openDb() {
  if (isTauri()) {
    const { openTauri } = await import('./tauri.js');
    db = await openTauri();
  } else if (import.meta.env.DEV) {
    const { openBrowser } = await import('./browser.js');
    db = await openBrowser();
  } else {
    throw new Error('Il database è disponibile solo nell\'app o in modalità sviluppo.');
  }
  await migrate(db);
  return db;
}

/** Esegue una SELECT e restituisce le righe come oggetti. Segnaposto: ? */
export const q = (sql, params = []) => db.select(sql, params);
/** Esegue INSERT, UPDATE o DELETE. Segnaposto: ? */
export const x = (sql, params = []) => db.execute(sql, params);

export async function getMeta(key, fallback = null) {
  const rows = await q('SELECT value FROM meta WHERE key = ?', [key]);
  return rows.length ? rows[0].value : fallback;
}

export async function setMeta(key, value) {
  await x(
    `INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value === null || value === undefined ? null : String(value)]
  );
}

/** Solo nel browser di sviluppo: cancella il database salvato. */
export function resetDevDb() {
  if (db && db.reset) db.reset();
}
