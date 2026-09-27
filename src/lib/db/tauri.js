import Database from '@tauri-apps/plugin-sql';

// Database SQLite dentro l'app Tauri. Il file cassa.db si trova nella cartella dati dell'app
// (su Windows in AppData, su macOS in ~/Library/Application Support).
export async function openTauri() {
  const db = await Database.load('sqlite:cassa.db');
  await db.execute('PRAGMA journal_mode = WAL');
  return {
    execute: (sql, params = []) => db.execute(sql, params),
    select: (sql, params = []) => db.select(sql, params)
  };
}
