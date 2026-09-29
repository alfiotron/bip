<script>
  import Icon from '../../components/Icon.svelte';
  import Keypad from '../../components/Keypad.svelte';
  import { pos } from '../../lib/pos.svelte.js';
  import { eur, editAmount, parseAmount } from '../../lib/money.js';

  // Sconto personalizzato: una percentuale, oppure il totale che il cliente paga
  // (lo sconto lo calcola la cassa: prezzo pieno meno totale).
  const pctTxt = (v) => String(v).replace('.', ',');
  const pctOf = (d, sub) => (sub ? ((d / sub) * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 }) : '0');

  let kind = $state(pos.isPresetDiscount ? 'total' : pos.discount.kind === 'pct' ? 'pct' : 'total');
  let text = $state(
    pos.isPresetDiscount ? '' : pos.discount.kind === 'pct' ? pctTxt(pos.discount.value) : ((pos.subtotal - pos.discountCents) / 100).toFixed(2).replace('.', ',')
  );
  let err = $state('');

  const preview = $derived.by(() => {
    if (!text) return kind === 'total' ? `Prezzo pieno ${eur(pos.subtotal)}: scrivi quanto paga il cliente.` : '';
    if (kind === 'total') {
      const c = parseAmount(text);
      if (isNaN(c) || c <= 0 || c > pos.subtotal) return '';
      const d = pos.subtotal - c;
      return d ? `Sconto ${eur(d)}, pari al ${pctOf(d, pos.subtotal)}%.` : 'Nessuno sconto: è il prezzo pieno.';
    }
    const v = parseFloat(text.replace(',', '.'));
    if (isNaN(v) || v <= 0 || v > 100) return '';
    const d = Math.round((pos.subtotal * v) / 100);
    return `Sconto ${eur(d)}: il cliente paga ${eur(pos.subtotal - d)}.`;
  });

  function key(k) {
    err = '';
    text = editAmount(text, k);
  }
  function setKind(k) {
    kind = k;
    text = '';
    err = '';
  }
  function apply() {
    if (kind === 'total') {
      const c = parseAmount(text);
      if (!text || isNaN(c) || c <= 0) { err = 'Scrivi quanto paga il cliente.'; return; }
      if (c > pos.subtotal) { err = `Il totale supera il prezzo pieno (${eur(pos.subtotal)}).`; return; }
      pos.discount = c === pos.subtotal ? { kind: 'pct', value: 0 } : { kind: 'eur', value: pos.subtotal - c };
    } else {
      const v = parseFloat(text.replace(',', '.'));
      if (!text || isNaN(v) || v <= 0) { err = 'Inserisci una percentuale maggiore di zero.'; return; }
      if (v > 100) { err = 'La percentuale non può superare 100.'; return; }
      pos.discount = { kind: 'pct', value: Math.round(v * 100) / 100 };
    }
    pos.panel = 'cart';
  }
</script>

<div class="phead">
  <button type="button" class="back" onclick={() => (pos.panel = 'cart')}><Icon name="arrow_back" /><span>Indietro</span></button>
  <h2>Sconto personalizzato</h2>
</div>
<div class="seg two" role="group" aria-label="Tipo di sconto">
  <button type="button" class:on={kind === 'total'} onclick={() => setKind('total')}>Totale da pagare</button>
  <button type="button" class:on={kind === 'pct'} onclick={() => setKind('pct')}>Percentuale</button>
</div>
<div>
  <div class="display num" class:bad={err}>
    {#if text}{kind === 'pct' ? `${text} %` : `€ ${text}`}{:else}<span class="ph">{kind === 'pct' ? '12 %' : eur(pos.subtotal)}</span>{/if}
  </div>
  {#if err}<p class="kerr">{err}</p>{:else if preview}<p class="hint">{preview}</p>{/if}
  <Keypad onkey={key} />
</div>
<div class="grow"></div>
<button type="button" class="solid" onclick={apply}><Icon name="check" /><span>Applica sconto</span></button>
