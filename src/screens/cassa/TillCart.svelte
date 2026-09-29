<script>
  import Icon from '../../components/Icon.svelte';
  import { pos, DISCOUNT_PRESETS, startPay, clearSale } from '../../lib/pos.svelte.js';
  import { eur, vatIncluded } from '../../lib/money.js';

  const pctTxt = (v) => String(v).replace('.', ',');
  const vat = $derived(vatIncluded(pos.lines, pos.subtotal, pos.total));
  const discountLabel = $derived(
    pos.discount.kind === 'pct'
      ? `Sconto ${pctTxt(pos.discount.value)}%: − ${eur(pos.discountCents)}`
      : `Sconto ${eur(pos.discountCents)} (${pos.subtotal ? ((pos.discountCents / pos.subtotal) * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 }) : 0}%)`
  );
</script>

<div>
  <span class="tl">Da pagare</span>
  <span class="tv num">{eur(pos.total)}</span>
  <span class="tmeta num">
    <span>{pos.pieces} {pos.pieces === 1 ? 'pezzo' : 'pezzi'}</span>
    {#if pos.discountCents}<span>{discountLabel}</span>{/if}
    {#if vat}<span>IVA inclusa {eur(vat)}</span>{/if}
  </span>
</div>

<div>
  <span class="tl">Sconto</span>
  <div class="seg" role="group" aria-label="Sconto">
    {#each DISCOUNT_PRESETS as p (p)}
      {@const on = pos.discount.kind === 'pct' && pos.discount.value === p}
      <button type="button" class:on aria-pressed={on} onclick={() => (pos.discount = { kind: 'pct', value: p })}>{p}%</button>
    {/each}
  </div>
  <button type="button" class="custom" class:on={!pos.isPresetDiscount} onclick={() => (pos.panel = 'discount')}>
    <Icon name="edit" />
    <span class="num">
      {#if pos.isPresetDiscount}Sconto personalizzato{:else if pos.discount.kind === 'pct'}Personalizzato: {pctTxt(pos.discount.value)}%{:else}Personalizzato: − {eur(pos.discount.value)}{/if}
    </span>
  </button>
</div>

<div class="grow"></div>

<div class="paygroup">
  <button type="button" class="paybtn" onclick={() => startPay('card')}><Icon name="credit_card" /><span>Carta</span></button>
  <button type="button" class="paybtn" onclick={() => startPay('cash')}><Icon name="payments" /><span>Contanti</span></button>
</div>
<div class="minor">
  <button type="button" onclick={() => startPay('gift')}><Icon name="redeem" /><span>Omaggio</span></button>
  <button type="button" onclick={clearSale}><Icon name="close" /><span>Annulla vendita</span></button>
</div>
