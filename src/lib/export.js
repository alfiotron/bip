import { buildXlsx, totalRow } from './xlsx.js';
import { saveFile } from './save.js';
import { eventStatistics, dayLabel } from './stats.js';
import { eventSummary } from './stock.js';
import { codeLabel } from './codes.js';

const METHODS = { card: 'Carta', cash: 'Contanti', gift: 'Omaggio' };

/** Esporta in Excel le statistiche complete di un evento: prodotti, giorni, vendite e IVA. */
export async function exportEvent(event, products, tillName) {
  const st = await eventStatistics(event.id);
  const stock = await eventSummary(event.id);
  const byId = new Map(products.map((p) => [p.id, p]));
  const multiDay = st.days.length > 1;

  // Prodotti: venduti, in omaggio, portati o consegnati con DDT
  const rows = new Map(st.products.map((p) => [p.key, p]));
  for (const pid of Object.keys(stock)) {
    const s = stock[pid];
    if (!rows.has(pid) && (s.loaded || s.ddtOut)) {
      const p = byId.get(pid);
      rows.set(pid, { key: pid, product_id: pid, name: p?.name || 'Prodotto eliminato', code: p?.code || '', unit_cents: p?.price_cents || 0, sold: 0, gifts: 0, days: {} });
    }
  }
  const prodRows = [...rows.values()]
    .sort((a, b) => b.sold - a.sold || a.name.localeCompare(b.name, 'it'))
    .map((r) => {
      const s = r.product_id ? stock[r.product_id] : null;
      const p = r.product_id ? byId.get(r.product_id) : null;
      return [
        r.name,
        p?.description || (r.product_id ? '' : 'Voce libera'),
        r.code ? codeLabel(r.code) : '',
        r.unit_cents,
        s && s.loaded ? s.loaded : '',
        r.sold,
        r.gifts || '',
        s && s.ddtOut - s.ddtBack ? s.ddtOut - s.ddtBack : '',
        s && s.loaded ? s.left : '',
        ...(multiDay ? st.days.map((d) => r.days[d]?.sold || '') : [])
      ];
    });
  const sumCol = (i) => prodRows.reduce((t, r) => t + (Number(r[i]) || 0), 0);
  prodRows.push(totalRow(['Totale', '', '', '', sumCol(4), sumCol(5), sumCol(6), sumCol(7), sumCol(8), ...(multiDay ? st.days.map((_, i) => sumCol(9 + i)) : [])]));

  const dayRows = st.byDay.map((d) => [dayLabel(d.day), d.count, d.pieces, d.income, d.methods.card.total, d.methods.cash.total, d.discounts, d.rounding, d.gifts.pieces]);
  dayRows.push(totalRow(['Totale', st.count, st.pieces, st.income, st.methods.card.total, st.methods.cash.total, st.discounts, st.rounding, st.gifts.pieces]));

  const saleRows = st.sales.map((s) => {
    const d = new Date(s.at);
    return [
      d.toLocaleDateString('it-IT'),
      d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      tillName(s.origin),
      METHODS[s.method],
      s.pieces,
      s.lines.map((l) => `${l.qty}× ${l.name}`).join('; '),
      s.subtotal_cents,
      s.discount_cents || '',
      s.rounding_cents || '',
      s.total_cents,
      s.gift_to || ''
    ];
  });

  const vatRows = st.vat.map((v) => [v.rate ? v.rate + '%' : 'Assolta (art. 74)', v.gross, v.rate ? v.gross - v.tax : '', v.rate ? v.tax : '']);
  vatRows.push(totalRow(['Totale', st.vat.reduce((t, v) => t + v.gross, 0), '', st.vat.reduce((t, v) => t + v.tax, 0)]));

  const bytes = buildXlsx([
    {
      name: 'Prodotti',
      columns: [
        { header: 'Prodotto', width: 36 }, { header: 'Descrizione', width: 24 }, { header: 'Codice', width: 20 },
        { header: 'Prezzo', width: 11, type: 'money' }, { header: 'Portati', width: 9, type: 'int' }, { header: 'Venduti', width: 9, type: 'int' },
        { header: 'Omaggi', width: 9, type: 'int' }, { header: 'DDT', width: 8, type: 'int' }, { header: 'Rimasti', width: 9, type: 'int' },
        ...(multiDay ? st.days.map((d) => ({ header: 'Venduti ' + dayLabel(d), width: 16, type: 'int' })) : [])
      ],
      rows: prodRows
    },
    {
      name: 'Giorni',
      columns: [
        { header: 'Giorno', width: 16 }, { header: 'Vendite', width: 10, type: 'int' }, { header: 'Pezzi venduti', width: 14, type: 'int' },
        { header: 'Incasso', width: 13, type: 'money' }, { header: 'Carta', width: 13, type: 'money' }, { header: 'Contanti', width: 13, type: 'money' },
        { header: 'Sconti', width: 12, type: 'money' }, { header: 'Arrotondamenti', width: 15, type: 'money' }, { header: 'Pezzi in omaggio', width: 16, type: 'int' }
      ],
      rows: dayRows
    },
    {
      name: 'Vendite',
      columns: [
        { header: 'Data', width: 12 }, { header: 'Ora', width: 8 }, { header: 'Cassa', width: 12 }, { header: 'Pagamento', width: 12 },
        { header: 'Pezzi', width: 8, type: 'int' }, { header: 'Prodotti', width: 60 }, { header: 'Prezzo pieno', width: 13, type: 'money' },
        { header: 'Sconto', width: 11, type: 'money' }, { header: 'Arrotondamento', width: 15, type: 'money' }, { header: 'Incassato', width: 12, type: 'money' },
        { header: 'Omaggio a', width: 14 }
      ],
      rows: saleRows
    },
    {
      name: 'IVA',
      columns: [{ header: 'Aliquota', width: 18 }, { header: 'Incassato', width: 13, type: 'money' }, { header: 'Imponibile', width: 13, type: 'money' }, { header: 'Imposta', width: 12, type: 'money' }],
      rows: vatRows
    }
  ]);

  const safeName = event.name.replace(/[\\/:*?"<>|]/g, ' ').trim();
  return saveFile(`Statistiche ${safeName}.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Excel', ['xlsx']);
}
