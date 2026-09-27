<script>
  import Icon from '../../components/Icon.svelte';
  import Cover from '../../components/Cover.svelte';
  import Keypad from '../../components/Keypad.svelte';
  import { app } from '../../lib/state.svelte.js';
  import { pos, scan, addProduct, leftInFair } from '../../lib/pos.svelte.js';
  import { eur } from '../../lib/money.js';

  let query = $state('');
  let code = $state('');
  let codeErr = $state('');

  const list = $derived.by(() => {
    const t = query.trim().toLowerCase();
    return app.products.filter((p) => p.active && (!t || `${p.name} ${p.description} ${p.code}`.toLowerCase().includes(t)));
  });

  function tag(p) {
    if (!app.stock.has) return null;
    const s = leftInFair(p.id);
    if (!s.loaded) return ['off', 'Non portato'];
    if (s.left <= 0) return ['bad', 'Finito in fiera'];
    if (s.left <= p.alert_below) return ['warn', `Ultimi ${s.left}`];
    return null;
  }

  function key(k) {
    codeErr = '';
    if (k === 'C') code = '';
    else if (k === '⌫') code = code.slice(0, -1);
    else if (code.length < 13) code += k;
  }
  function addCode() {
    if (code.length < 8) { codeErr = 'Un codice ha da 8 a 13 cifre.'; return; }
    if (scan(code)) code = '';
    else codeErr = 'Questo codice non è in catalogo.';
  }
</script>

<div class="shead">
  <button type="button" class="back" onclick={() => (pos.view = 'cart')}><Icon name="arrow_back" /><span>Carrello</span></button>
  <h2>Cerca prodotto</h2>
</div>
<div class="sgrid">
  <div>
    <div class="psearch"><Icon name="search" /><input class="field" placeholder="Cerca per nome, descrizione o codice" bind:value={query} /></div>
    <div class="shelf">
      {#each list as p (p.id)}
        {@const t = tag(p)}
        <button type="button" class="shelfbook" onclick={() => addProduct(p)}>
          <Cover item={p} size="lg" />
          <span class="rt">{p.name}</span>
          <span class="ra num">{eur(p.price_cents)}</span>
          {#if t}<span class="tag {t[0]}">{t[1]}</span>{/if}
        </button>
      {:else}
        <p class="hint">{app.products.length ? 'Nessun prodotto corrisponde alla ricerca.' : 'Il catalogo è vuoto: aggiungi i prodotti dalla scheda Prodotti.'}</p>
      {/each}
    </div>
  </div>
  <div>
    <span class="kl">Oppure digita il codice</span>
    <div class="display" class:bad={codeErr}>{#if code}{code}{:else}<span class="ph">978</span>{/if}</div>
    {#if codeErr}<p class="kerr">{codeErr}</p>{/if}
    <Keypad keys={['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫']} onkey={key} />
    <button type="button" class="solid" onclick={addCode}>Aggiungi al carrello</button>
  </div>
</div>
