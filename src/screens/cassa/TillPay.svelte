<script>
  import Icon from '../../components/Icon.svelte';
  import { pos, confirmPay } from '../../lib/pos.svelte.js';
  import { eur, vatIncluded, roundingOptions } from '../../lib/money.js';

  const TITLES = { card: 'Pagamento con carta', cash: 'Pagamento in contanti', gift: 'Omaggio' };
  const RECIPIENTS = ['Giornalista', 'Ospite', 'Autore', 'Altro'];

  const p = $derived(pos.pay);
  const due = $derived(p ? p.round ?? pos.total : 0);
  const vat = $derived(vatIncluded(pos.lines, pos.subtotal, due));
  const opts = $derived(roundingOptions(pos.total));
  const notes = $derived([due, ...[500, 1000, 2000, 5000, 10000].filter((x) => x > due).slice(0, 3)]);
  let busy = $state(false);

  function setRound(o) {
    p.round = p.round === o ? null : o;
    p.received = null;
  }
  async function confirm() {
    if (busy) return;
    busy = true;
    await confirmPay();
    busy = false;
  }
</script>

{#if p}
  <div class="phead">
    <button type="button" class="back" onclick={() => { pos.pay = null; pos.panel = 'cart'; }}><Icon name="arrow_back" /><span>Indietro</span></button>
    <h2>{TITLES[p.method]}</h2>
  </div>

  {#if p.method === 'gift'}
    <div>
      <span class="tl">Valore di listino</span>
      <span class="tv sm num">{eur(pos.subtotal)}</span>
      <span class="tmeta"><span>Nessun incasso. I pezzi risultano usciti dalla dotazione.</span></span>
    </div>
    <div>
      <span class="tl">Destinatario, se vuoi annotarlo</span>
      <div class="chips">
        {#each RECIPIENTS as r (r)}
          <button type="button" class:on={p.giftTo === r} onclick={() => (p.giftTo = p.giftTo === r ? null : r)}>{r}</button>
        {/each}
      </div>
    </div>
  {:else}
    <div>
      <span class="tl">Da incassare</span>
      <span class="tv num">{eur(due)}</span>
      <span class="tmeta num">
        {#if p.round !== null}<span>Invece di {eur(pos.total)}</span>{/if}
        {#if vat}<span>IVA inclusa {eur(vat)}</span>{/if}
      </span>
    </div>
    {#if opts.length}
      <div>
        <span class="tl">Arrotonda per difetto</span>
        <div class="chips num">
          {#each opts as o (o)}
            <button type="button" class:on={p.round === o} onclick={() => setRound(o)}>{eur(o)}</button>
          {/each}
        </div>
      </div>
    {/if}
    {#if p.method === 'cash'}
      <div>
        <span class="tl">Contanti ricevuti</span>
        <div class="chips num">
          {#each notes as n, i (i)}
            <button type="button" class:on={p.received === n} onclick={() => (p.received = n)}>{i ? '€ ' + n / 100 : 'Importo esatto'}</button>
          {/each}
        </div>
      </div>
      {#if p.received !== null && p.received > due}
        <div class="change"><span>Resto</span><strong class="num">{eur(p.received - due)}</strong></div>
      {/if}
    {/if}
  {/if}

  <div class="grow"></div>
  <button type="button" class="solid" disabled={busy} onclick={confirm}>
    <Icon name="check" /><span>{p.method === 'gift' ? 'Registra omaggio' : 'Conferma pagamento'}</span>
  </button>
{/if}
