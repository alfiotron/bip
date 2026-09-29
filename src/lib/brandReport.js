import { buildXlsx, totalRow } from './xlsx.js';
import { eventStatistics, dayLabelLong, pct } from './stats.js';
import { eventSummary } from './stock.js';
import { codeLabel } from './codes.js';
import { eur } from './money.js';

// Report delle vendite con un foglio per marchio, più un foglio di riepilogo.

const ratio = (list, income) => (list ? Math.round(((list - income) / list) * 1000) / 10 : '');

function sheetName(name, used) {
  let base = String(name).replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Marchio';
  let n = base, i = 2;
  while (used.has(n.toLowerCase())) { const suf = ` (${i++})`; n = base.slice(0, 31 - suf.length) + suf; }
  used.add(n.toLowerCase());
  return n;
}

export async function buildBrandReport(event, day, products, brands, brandName) {
  const st = await eventStatistics(event.id, day);
  const stock = day ? {} : await eventSummary(event.id);
  const byId = new Map(products.map((p) => [p.id, p]));
  const used = new Set(['riepilogo']);

  // Prodotti venduti o dati in omaggio, raggruppati per marchio (anche quelli senza marchio)
  const groups = new Map();
  for (const r of st.products) {
    if (!r.sold && !r.gifts) continue;
    const k = r.brand || '';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  // Ordine dei fogli: marchi per incasso, "Senza marchio" in fondo
  const order = [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : 0) || (st.brands.find((x) => (x.brand || '') === b)?.income || 0) - (st.brands.find((x) => (x.brand || '') === a)?.income || 0));

  const columns = [
    { header: 'Prodotto', width: 38 }, { header: 'Codice', width: 20 }, { header: 'Prezzo', width: 10, type: 'money' },
    { header: 'Venduti', width: 9, type: 'int' }, { header: 'Omaggi', width: 9, type: 'int' },
    { header: 'Prezzo pieno', width: 13, type: 'money' }, { header: 'Incassato', width: 13, type: 'money' }, { header: 'Sconto %', width: 10 },
    ...(day ? [] : [{ header: 'Portati', width: 9, type: 'int' }, { header: 'Rimasti', width: 9, type: 'int' }])
  ];
  const sheets = [];
  for (const k of order) {
    const rows = groups.get(k).sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name, 'it')).map((r) => {
      const s = r.product_id ? stock[r.product_id] : null;
      const p = r.product_id ? byId.get(r.product_id) : null;
      return [
        r.name + (r.product_id ? '' : ' (voce libera)'),
        r.code ? codeLabel(r.code) : p?.code ? codeLabel(p.code) : '',
        r.unit_cents, r.sold, r.gifts || '', r.list || '', r.list ? r.income : '', ratio(r.list, r.income),
        ...(day ? [] : [s && s.loaded ? s.loaded : '', s && s.loaded ? s.left : ''])
      ];
    });
    const sum = (i) => rows.reduce((t, r) => t + (Number(r[i]) || 0), 0);
    rows.push(totalRow(['Totale', '', '', sum(3), sum(4), sum(5), sum(6), ratio(sum(5), sum(6)), ...(day ? [] : [sum(8), sum(9)])]));
    sheets.push({ name: sheetName(k ? brandName(k) : 'Senza marchio', used), columns, rows });
  }

  const summaryRows = st.brands.filter((b) => b.sold || b.gifts).map((b) => [brandName(b.brand), b.sold, b.gifts || '', b.list, b.income, ratio(b.list, b.income)]);
  summaryRows.push(totalRow(['Totale', st.pieces, st.gifts.pieces, st.list, st.income, ratio(st.list, st.income)]));
  const bytes = buildXlsx([
    {
      name: 'Riepilogo',
      columns: [
        { header: 'Marchio', width: 30 }, { header: 'Venduti', width: 10, type: 'int' }, { header: 'Omaggi', width: 10, type: 'int' },
        { header: 'Prezzo pieno', width: 14, type: 'money' }, { header: 'Incassato', width: 14, type: 'money' }, { header: 'Sconto %', width: 10 }
      ],
      rows: summaryRows
    },
    ...sheets
  ]);

  const period = day ? dayLabelLong(day) : 'tutto l\'evento';
  const safe = (event.name + (day ? ' ' + day : '')).replace(/[\\/:*?"<>|]/g, ' ').trim();
  const lines = [
    `Report delle vendite di ${event.name}, ${period}.`,
    '',
    `Incasso: ${eur(st.income)}`,
    `Vendite: ${st.count}, pezzi venduti: ${st.pieces}`,
    `Prezzo pieno delle copie vendute: ${eur(st.list)}, sconto medio: ${pct(st.discountPct)}`,
    st.gifts.pieces ? `Omaggi: ${st.gifts.pieces} pezzi` : null,
    '',
    'Per marchio:',
    ...st.brands.filter((b) => b.sold).map((b) => `- ${brandName(b.brand)}: ${b.sold} pezzi, ${eur(b.income)} incassati (sconto medio ${pct(b.discountPct)})`),
    '',
    'In allegato il file Excel con un foglio per marchio.',
    '',
    'Inviato da Bip'
  ].filter((l) => l !== null);
  return {
    bytes,
    filename: `Report ${safe}.xlsx`,
    subject: `Report vendite: ${event.name}${day ? ', ' + dayLabelLong(day) : ''}`,
    body: lines.join('\n'),
    brands: sheets.length,
    empty: !st.count && !st.gifts.count
  };
}
