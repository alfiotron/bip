/** Tipo di codice a barre, per mostrarlo accanto al numero. */
export function codeType(code) {
  if (!code) return '';
  if (/^97[89]\d{10}$/.test(code)) return 'ISBN';
  if (/^\d{9}[\dX]$/.test(code)) return 'ISBN';
  if (code.length === 13) return 'EAN';
  if (code.length === 8) return 'EAN-8';
  if (code.length === 12) return 'UPC';
  return 'Codice';
}

export const codeLabel = (code) => (code ? `${codeType(code)} ${code}` : 'Senza codice');

/** Controlla la cifra di controllo di un EAN-13 (vale anche per gli ISBN-13). */
export function validEan13(code) {
  if (!/^\d{13}$/.test(code)) return false;
  const d = code.split('').map(Number);
  const sum = d.slice(0, 12).reduce((s, n, i) => s + n * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === d[12];
}

/** Un codice a barre accettabile: da 8 a 13 caratteri, cifre (e X finale per gli ISBN-10). */
export const plausibleCode = (code) => /^[0-9]{7,12}[0-9Xx]$/.test(code);
