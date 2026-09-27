// Solo per lo sviluppo nel browser (npm run dev): SQLite compilato in WebAssembly,
// salvato nella memoria del browser. Nell'app vera si usa db/tauri.js.
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

const KEY = 'cassa-fiera-dev-db';

export async function openBrowser() {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* memoria non disponibile */ }
  const db = saved
    ? new SQL.Database(Uint8Array.from(atob(saved), (c) => c.charCodeAt(0)))
    : new SQL.Database();

  let timer;
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const bytes = db.export();
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        localStorage.setItem(KEY, btoa(bin));
      } catch { /* se la memoria è piena si lavora solo in RAM */ }
    }, 300);
  };

  return {
    async execute(sql, params = []) {
      db.run(sql, params);
      persist();
      return { rowsAffected: db.getRowsModified() };
    },
    async select(sql, params = []) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    },
    reset() {
      try { localStorage.removeItem(KEY); } catch { /* niente da fare */ }
    }
  };
}
