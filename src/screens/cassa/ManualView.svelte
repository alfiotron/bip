<script>
  import Icon from '../../components/Icon.svelte';
  import Keypad from '../../components/Keypad.svelte';
  import { pos, addManual } from '../../lib/pos.svelte.js';
  import { editAmount, parseAmount } from '../../lib/money.js';

  const VATS = [0, 4, 5, 10, 22];
  let name = $state(pos.manualPrefill);
  let vat = $state(22);
  let amount = $state('');
  let err = $state('');

  function key(k) {
    err = '';
    amount = editAmount(amount, k);
  }
  function add() {
    const c = parseAmount(amount);
    if (!amount || isNaN(c) || c <= 0) { err = 'Inserisci un prezzo maggiore di zero.'; return; }
    addManual(name, c, vat);
  }
</script>

<div class="shead">
  <button type="button" class="back" onclick={() => (pos.view = 'cart')}><Icon name="arrow_back" /><span>Carrello</span></button>
  <h2>Voce libera</h2>
</div>
<div class="sgrid">
  <div>
    <label class="kl" for="mName">Descrizione</label>
    <input id="mName" class="field" placeholder="Poster autografato" bind:value={name} />
    <p class="hint">Per ciò che non è in catalogo. Resta nelle statistiche con questa descrizione. Se la lasci vuota, verrà registrata come "Voce libera".</p>
    <span class="kl" style="margin-top:24px">Aliquota IVA</span>
    <div class="vchips" role="group" aria-label="Aliquota IVA">
      {#each VATS as v (v)}
        <button type="button" class:on={vat === v} aria-pressed={vat === v} onclick={() => (vat = v)}>{v ? v + '%' : 'Assolta'}</button>
      {/each}
    </div>
    <p class="hint">{vat === 0 ? "IVA assolta all'origine, come per i libri (art. 74)." : 'Il prezzo si intende IVA inclusa.'}</p>
  </div>
  <div>
    <span class="kl">Prezzo, IVA inclusa</span>
    <div class="display num" class:bad={err}>{#if amount}€ {amount}{:else}<span class="ph">€ 10,00</span>{/if}</div>
    {#if err}<p class="kerr">{err}</p>{/if}
    <Keypad onkey={key} />
    <button type="button" class="solid" onclick={add}>Aggiungi al carrello</button>
  </div>
</div>
