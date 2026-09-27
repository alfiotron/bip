// Tutti gli importi sono in centesimi (numeri interi) per evitare errori di arrotondamento.

const NF = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const eur = (cents) => '€ ' + NF.format((cents || 0) / 100);

/** Converte "18,50" o "18.50" in 1850. Restituisce NaN se il testo non è un importo valido. */
export function parseAmount(text) {
  const s = String(text ?? '').trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100);
}

/** Importo in centesimi → testo per un campo modificabile: 1850 → "18,50" */
export const centsToInput = (cents) => ((cents || 0) / 100).toFixed(2).replace('.', ',');

/** Tastierino: aggiunge o toglie una cifra da un importo scritto come testo. */
export function editAmount(text, key) {
  if (key === '⌫') return text.slice(0, -1);
  if (key === 'C') return '';
  if (key === ',') return text.includes(',') ? text : (text || '0') + ',';
  const dec = text.split(',')[1];
  if (dec && dec.length >= 2) return text;
  if (text.replace(',', '').length >= 6) return text;
  return (text === '0' ? '' : text) + key;
}

/** Parte di IVA contenuta in un importo lordo. */
export const vatPart = (gross, rate) => gross - Math.round(gross / (1 + rate / 100));

/**
 * Ripartisce un totale tra le aliquote in proporzione al valore delle righe.
 * Serve quando sconti o arrotondamenti riducono il totale di un carrello misto.
 */
export function splitByVat(lines, subtotal, total) {
  const by = {};
  for (const l of lines) by[l.vat_rate] = (by[l.vat_rate] || 0) + l.unit_cents * l.qty;
  const out = {};
  if (!subtotal) return out;
  const rates = Object.keys(by);
  let acc = 0;
  rates.forEach((r, i) => {
    const g = i === rates.length - 1 ? total - acc : Math.round((total * by[r]) / subtotal);
    out[r] = g;
    acc += g;
  });
  return out;
}

export const vatIncluded = (lines, subtotal, total) => {
  const parts = splitByVat(lines, subtotal, total);
  return Object.keys(parts).reduce((s, r) => s + vatPart(parts[r], Number(r)), 0);
};

/** Arrotondamenti per difetto proposti al pagamento: a 50 centesimi e all'euro. */
export const roundingOptions = (cents) =>
  [...new Set([Math.floor(cents / 50) * 50, Math.floor(cents / 100) * 100])].filter((x) => x < cents && x >= 0);
