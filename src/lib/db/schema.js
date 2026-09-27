// Schema del database. Ogni migrazione è un elenco di istruzioni SQL eseguite una alla volta.
// Non modificare mai una migrazione già distribuita: aggiungine una nuova in fondo.
//
// Principio che rende possibile la sincronizzazione tra casse:
// ogni modifica viene scritta prima nel "journal" (registro), con l'identificativo della cassa
// che l'ha creata (origin) e un numero progressivo (seq). Le altre tabelle sono una "proiezione"
// del journal e si possono sempre ricostruire da esso.

export const MIGRATIONS = [
  // 1: struttura iniziale
  [
    `CREATE TABLE IF NOT EXISTS journal (
      id TEXT PRIMARY KEY,
      origin TEXT NOT NULL,
      seq INTEGER NOT NULL,
      at TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      applied INTEGER NOT NULL DEFAULT 0,
      UNIQUE (origin, seq)
    )`,
    `CREATE INDEX IF NOT EXISTS journal_pending ON journal(applied)`,

    `CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL,
      vat_rate INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      alert_below INTEGER NOT NULL DEFAULT 5,
      fic_id TEXT,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS products_code ON products(code)`,

    `CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_open INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      vat TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      origin TEXT NOT NULL,
      event_id TEXT NOT NULL,
      at TEXT NOT NULL,
      method TEXT NOT NULL CHECK (method IN ('card', 'cash', 'gift')),
      subtotal_cents INTEGER NOT NULL,
      discount_kind TEXT,
      discount_value REAL,
      discount_cents INTEGER NOT NULL DEFAULT 0,
      rounding_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL,
      gift_to TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS sales_event ON sales(event_id)`,

    `CREATE TABLE IF NOT EXISTS sale_lines (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      product_id TEXT,
      code TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      unit_cents INTEGER NOT NULL,
      vat_rate INTEGER NOT NULL,
      qty INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS sale_lines_sale ON sale_lines(sale_id)`,
    `CREATE INDEX IF NOT EXISTS sale_lines_product ON sale_lines(product_id)`,

    // Dotazione dell'evento: pezzi aggiunti (load) e differenze da conteggio (count)
    `CREATE TABLE IF NOT EXISTS stock_moves (
      id TEXT PRIMARY KEY,
      origin TEXT NOT NULL,
      event_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('load', 'count')),
      qty INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS stock_moves_event ON stock_moves(event_id, product_id)`,

    // DDT interni: rifornimenti in arrivo (in) e consegne ai negozi (out)
    `CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      origin TEXT NOT NULL,
      number TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
      event_id TEXT NOT NULL,
      at TEXT NOT NULL,
      client_id TEXT,
      reason TEXT,
      source TEXT NOT NULL DEFAULT '',
      reference TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      fic_id TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS transfer_lines (
      id TEXT PRIMARY KEY,
      transfer_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      qty INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS transfer_returns (
      id TEXT PRIMARY KEY,
      origin TEXT NOT NULL,
      transfer_id TEXT NOT NULL,
      at TEXT NOT NULL,
      destination TEXT NOT NULL CHECK (destination IN ('fair', 'hq'))
    )`,
    `CREATE TABLE IF NOT EXISTS transfer_return_lines (
      id TEXT PRIMARY KEY,
      return_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      qty INTEGER NOT NULL
    )`
  ],

  // 2: eliminazioni. Chi viene eliminato resta qui, così una registrazione arrivata
  // più tardi da un'altra cassa non lo fa ricomparire.
  [
    `CREATE TABLE IF NOT EXISTS deleted (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      at TEXT NOT NULL
    )`
  ],

  // 3: impostazioni dell'attività condivise tra tutte le casse (nome, logo...)
  [
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    )`
  ]
];

export async function migrate(db) {
  await db.execute(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`);
  const rows = await db.select(`SELECT value FROM meta WHERE key = 'schema_version'`);
  let version = rows.length ? Number(rows[0].value) : 0;
  for (let i = version; i < MIGRATIONS.length; i++) {
    for (const sql of MIGRATIONS[i]) await db.execute(sql);
    version = i + 1;
    await db.execute(
      `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(version)]
    );
  }
}
