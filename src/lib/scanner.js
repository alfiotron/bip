// Il lettore di codici a barre si comporta come una tastiera: "digita" il codice molto
// velocemente e poi preme Invio. Qui ascoltiamo la tastiera di tutta la finestra e
// riconosciamo lo scanner dalla velocità, senza bisogno di una casella di testo.

const MAX_GAP_MS = 60; // tra un carattere e l'altro dello scanner passano pochi millisecondi
const MIN_LENGTH = 8;  // i codici più corti (EAN-8) hanno 8 cifre

export function startScanner(onScan) {
  let buffer = '';
  let last = 0;

  function onKey(e) {
    // Se si sta scrivendo in un campo di testo, lo scanner scrive lì come una tastiera normale.
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const now = performance.now();
    if (now - last > MAX_GAP_MS) buffer = '';
    last = now;
    if (e.key === 'Enter') {
      if (buffer.length >= MIN_LENGTH) {
        e.preventDefault(); // evita di "premere" il pulsante che ha il focus
        onScan(buffer);
      }
      buffer = '';
      return;
    }
    if (/^[0-9Xx]$/.test(e.key)) buffer += e.key.toUpperCase();
  }

  window.addEventListener('keydown', onKey, true);
  return () => window.removeEventListener('keydown', onKey, true);
}
