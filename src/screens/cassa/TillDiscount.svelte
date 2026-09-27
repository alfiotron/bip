<script>
  import Icon from '../../components/Icon.svelte';
  import Keypad from '../../components/Keypad.svelte';
  import { pos } from '../../lib/pos.svelte.js';
  import { eur, editAmount } from '../../lib/money.js';

  const pctTxt = (v) => String(v).replace('.', ',');
  let kind = $state(pos.isPresetDiscount ? 'pct' : pos.discount.kind);
  let text = $state(
    pos.isPresetDiscount ? '' : pos.discount.kind === 'pct' ? pctTxt(pos.discount.value) : (pos.discount.value / 100).toFixed(2).replace('.', ',')
  );
  let err = $state('');

  function key(k) {
    err = '';
    text = editAmount(text, k);
  }
  function setKind(k) {
    kind = k;
    err = '';
  }
  function apply() {
    const v = parseFloat(text.replace(',', '.'));
    if (!text || isNaN(v) || v <= 0) { err = 'Inserisci un valore maggiore di zero.'; return; }
    if (kind === 'pct') {
      if (v > 100) { err = 'La percentuale non può superare 100.'; return; }
      pos.discount = { kind: 'pct', value: Math.round(v * 100) / 100 };
    } else {
      const c = Math.round(v * 100);
      if (c > pos.subtotal) { err = `Lo sconto supera il totale del carrello (${eur(pos.subtotal)}).`; return; }
      pos.discount = { kind: 'eur', value: c };
    }
    pos.panel = 'cart';
  }
</script>

<div class="phead">
  <button type="button" class="back" onclick={() => (pos.panel = 'cart')}><Icon name="arrow_back" /><span>Indietro</span></button>
  <h2>Sconto personalizzato</h2>
</div>
<div class="seg two" role="group" aria-label="Tipo di sconto">
  <button type="button" class:on={kind === 'pct'} onclick={() => setKind('pct')}>Percentuale</button>
  <button type="button" class:on={kind === 'eur'} onclick={() => setKind('eur')}>Importo in euro</button>
</div>
<div>
  <div class="display num" class:bad={err}>
    {#if text}{kind === 'pct' ? `${text} %` : `€ ${text}`}{:else}<span class="ph">{kind === 'pct' ? '12 %' : '€ 2,00'}</span>{/if}
  </div>
  {#if err}<p class="kerr">{err}</p>{/if}
  <Keypad onkey={key} />
</div>
<div class="grow"></div>
<button type="button" class="solid" onclick={apply}><Icon name="check" /><span>Applica sconto</span></button>
