import { unzipSync, strFromU8 } from 'fflate';

// Lettura di file Excel (.xlsx) e CSV: restituisce il primo foglio come righe di celle.

function colIndex(ref) {
  const letters = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readXlsx(buf) {
  let files;
  try {
    files = unzipSync(new Uint8Array(buf));
  } catch {
    throw new Error('Il file non sembra un file Excel valido. Se è un vecchio .xls, aprilo in Excel e salvalo come .xlsx.');
  }
  const xml = (name) => (files[name] ? new DOMParser().parseFromString(strFromU8(files[name]), 'application/xml') : null);

  // Primo foglio del file
  const wb = xml('xl/workbook.xml');
  const rels = xml('xl/_rels/workbook.xml.rels');
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const first = wb?.getElementsByTagName('sheet')[0];
  if (first && rels) {
    const rid = first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    for (const r of rels.getElementsByTagName('Relationship')) {
      if (r.getAttribute('Id') === rid) {
        const t = r.getAttribute('Target').replace(/^\//, '');
        sheetPath = t.startsWith('xl/') ? t : 'xl/' + t;
      }
    }
  }
  const sheet = xml(sheetPath);
  if (!sheet) throw new Error('Nel file non c\'è nessun foglio da leggere.');

  const shared = [];
  const ss = xml('xl/sharedStrings.xml');
  if (ss) for (const si of ss.getElementsByTagName('si')) shared.push([...si.getElementsByTagName('t')].map((t) => t.textContent).join(''));

  const rows = [];
  let next = 0;
  for (const row of sheet.getElementsByTagName('row')) {
    // Le righe vuote non sono scritte nel file: si usa il loro numero per non sfasare la numerazione
    const at = Number(row.getAttribute('r')) - 1;
    while (Number.isFinite(at) && next < at) { rows.push([]); next++; }
    next++;
    const r = [];
    for (const c of row.getElementsByTagName('c')) {
      const i = colIndex(c.getAttribute('r') || '');
      const t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent;
      let val = '';
      if (t === 's') val = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map((x) => x.textContent).join('');
      else if (t === 'str' || t === 'e') val = v ?? '';
      else if (t === 'b') val = v === '1' ? 'VERO' : 'FALSO';
      else val = v === undefined ? '' : Number(v);
      r[i] = val;
    }
    rows.push(Array.from(r, (x) => (x === undefined ? '' : x)));
  }
  return rows;
}

function decodeText(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buf); // CSV salvati da Excel in italiano
  }
}

function readCsv(text) {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delim = [';', '\t', ','].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Legge un file scelto dall'utente. */
export async function readTable(file) {
  const buf = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) return readXlsx(buf);
  if (name.endsWith('.csv') || name.endsWith('.txt')) return readCsv(decodeText(buf));
  if (name.endsWith('.xls')) throw new Error('I file .xls del vecchio Excel non sono supportati: apri il file in Excel e salvalo come .xlsx.');
  throw new Error('Scegli un file Excel (.xlsx) o CSV.');
}
