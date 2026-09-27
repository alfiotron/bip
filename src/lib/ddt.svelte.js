import { productByCode } from './state.svelte.js';

// Stato della scheda DDT (serve anche allo scanner, per aggiungere prodotti a un nuovo DDT).
export const dd = $state({
  filter: 'all',
  selected: null, // id del DDT aperto
  editor: null, // nuovo DDT in preparazione
  returning: false, // modulo di rientro aperto sul DDT selezionato
  printing: null, // id del DDT di cui mostrare il riepilogo stampabile
  importing: false, // importazione di un rifornimento da Fatture in Cloud
  notice: ''
});

export function newEditor(direction = 'in') {
  dd.editor = {
    direction,
    source: 'Magazzino centrale',
    reference: '',
    note: '',
    client_id: null,
    reason: 'deposit',
    lines: [],
    query: '',
    newClient: null,
    errors: {}
  };
  dd.selected = null;
  dd.returning = false;
}

export function editorAdd(productId) {
  const e = dd.editor;
  const l = e.lines.find((x) => x.product_id === productId);
  if (l) l.qty++;
  else e.lines.push({ product_id: productId, qty: 1 });
  e.errors.lines = '';
}

/** Lettura dello scanner con la scheda DDT aperta. */
export function ddtScan(code) {
  if (!dd.editor) return;
  const p = productByCode(code);
  if (p) editorAdd(p.id);
  else dd.editor.errors.lines = `Il codice ${code} non è in catalogo. Crealo dalla scheda Prodotti.`;
}
