<script>
  import { reveal } from '../../lib/reveal.js';
  import Icon from '../../components/Icon.svelte';
  import Cover from '../../components/Cover.svelte';
  import Keypad from '../../components/Keypad.svelte';
  import { app, refreshEventData } from '../../lib/state.svelte.js';
  import { productHistory, fairLevel } from '../../lib/stock.js';
  import { record } from '../../lib/journal.js';
  import { uuid } from '../../lib/ids.js';
  import { codeLabel } from '../../lib/codes.js';

  // Dettaglio di un prodotto nella dotazione di un evento.
  // Tre schede, così nulla resta nascosto in fondo al pannello: aggiungi pezzi, conteggio, movimenti.
  let { product, event, s, onback } = $props();

  let tab = $state('add'); // 'add' | 'count' | 'moves'
  let addQty = $state(0);
  let countQty = $state(0);
  let keypad = $state(false);
  let typed = $state(''); // cifre digitate con il tastierino
  let err = $state('');
  let msg = $state('');
  let busy = $state(false);
  let history = $state({ rows: [], sold: 0, gifts: 0 });

  // Nuovo prodotto selezionato: si riparte da zero
  $effect(() => {
    product.id;
    tab = event.is_open ? 'add' : 'moves';
    addQty = 0;
    keypad = false;
    typed = '';
    err = '';
    msg = '';
  });
  // Il conteggio parte dal numero che la cassa si aspetta di trovare
  $effect(() => {
    if (tab === 'count') countQty = Math.max(0, s.left);
  });
  $effect(() => {
    app.version;
    productHistory(event.id, product.id).then((h) => (history = h));
  });

  const moves = $derived(history.rows.length + (history.sold || history.gifts ? 1 : 0));
  const value = $derived(tab === 'add' ? addQty : countQty);
  function setValue(v) {
    v = Math.max(0, Math.min(99999, v));
    if (tab === 'add') addQty = v;
    else countQty = v;
    err = '';
    msg = '';
  }
  function key(k) {
    if (k === 'C') typed = '';
    else if (k === '⌫') typed = typed.slice(0, -1);
    else if (typed.length < 5) typed = (typed === '0' ? '' : typed) + k;
    setValue(parseInt(typed || '0', 10));
  }
  function toggleKeypad() {
    keypad = !keypad;
    typed = keypad ? '' : typed;
  }
  function switchTab(t) {
    tab = t;
    keypad = false;
    typed = '';
    err = '';
    msg = '';
  }

  const preview = $derived.by(() => {
    if (tab === 'add') return addQty ? `Portati in totale ${s.loaded + addQty}, rimasti in fiera ${s.left + addQty}.` : 'Tocca i pulsanti per indicare quanti pezzi aggiungi.';
    const d = countQty - s.left;
    return d === 0 ? 'Il numero coincide con quello della cassa.' : `Differenza rispetto alla cassa: ${d > 0 ? '+' : '−'}${Math.abs(d)}.`;
  });

  async function save() {
    if (busy) return;
    if (tab === 'add' && addQty <= 0) { err = 'Indica almeno un pezzo da aggiungere.'; return; }
    if (tab === 'count' && countQty === s.left) { err = `Allo stand risultano già ${s.left} pezzi: non c'è niente da correggere.`; return; }
    busy = true;
    if (tab === 'add') {
      await record('stock.move', { id: uuid(), event_id: event.id, product_id: product.id, kind: 'load', qty: addQty, note: '' });
      msg = `Aggiunti ${addQty} ${addQty === 1 ? 'pezzo' : 'pezzi'} alla dotazione.`;
      addQty = 0;
    } else {
      await record('stock.move', { id: uuid(), event_id: event.id, product_id: product.id, kind: 'count', qty: countQty - s.left, note: '' });
      msg = `Conteggio registrato: ora risultano ${countQty} pezzi in fiera.`;
    }
    keypad = false;
    typed = '';
    await refreshEventData();
    busy = false;
  }
  const when = (iso) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const level = $derived(s.loaded ? fairLevel(product, s.left) : '');
</script>

<div class="dz">
  <button type="button" class="back mback" onclick={onback}><Icon name="arrow_back" /><span>Tutti i prodotti</span></button>

  <div class="dz-head">
    <Cover item={product} />
    <div style="min-width:0">
      <span class="rt">{product.name}</span>
      <span class="ra num">{codeLabel(product.code)}</span>
    </div>
    <div class="dz-left">
      <span class="tl">Rimasti in fiera</span>
      <strong class="num {level}">{s.left}</strong>
    </div>
  </div>

  <div class="dz-stats num">
    <div><span>Portati</span><strong>{s.loaded}</strong></div>
    <div><span>Venduti</span><strong>{s.sold}</strong></div>
    <div><span>Omaggi</span><strong>{s.gifts}</strong></div>
    <div><span>DDT</span><strong>{s.ddtOut - s.ddtBack}</strong></div>
    {#if s.counted}<div><span>Conteggi</span><strong>{s.counted > 0 ? '+' : ''}{s.counted}</strong></div>{/if}
  </div>

  <div class="seg dz-tabs" role="tablist" style="grid-template-columns:repeat({event.is_open ? 3 : 1},1fr)">
    {#if event.is_open}
      <button type="button" role="tab" aria-selected={tab === 'add'} class:on={tab === 'add'} onclick={() => switchTab('add')}>Aggiungi</button>
      <button type="button" role="tab" aria-selected={tab === 'count'} class:on={tab === 'count'} onclick={() => switchTab('count')}>Conteggio</button>
    {/if}
    <button type="button" role="tab" aria-selected={tab === 'moves'} class:on={tab === 'moves'} onclick={() => switchTab('moves')}>Movimenti{moves ? ` (${moves})` : ''}</button>
  </div>

  {#if tab === 'moves'}
    <div class="dz-body">
      {#if !event.is_open}<p class="hint" style="margin-top:0">Evento chiuso: la dotazione è consultabile ma non modificabile.</p>{/if}
      {#each history.rows as h, i (i)}
        <div class="kvrow"><span>{h.label}<small>{[when(h.at), h.note].filter(Boolean).join(', ')}</small></span><span class="num {h.qty >= 0 ? 'up' : 'down'}">{h.qty >= 0 ? '+' : '−'}{Math.abs(h.qty)}</span></div>
      {/each}
      {#if history.sold || history.gifts}
        <div class="kvrow"><span>Vendite e omaggi<small>{history.sold} venduti{history.gifts ? `, ${history.gifts} in omaggio` : ''}</small></span><span class="num down">−{history.sold + history.gifts}</span></div>
      {/if}
      {#if !moves}<p class="hint">Nessun movimento per questo prodotto.</p>{/if}
    </div>
  {:else}
    <div class="dz-body">
      <span class="tl">{tab === 'add' ? 'Pezzi da aggiungere' : 'Pezzi contati allo stand, scatole chiuse comprese'}</span>
      <div class="dz-stepper">
        <button type="button" aria-label="Uno in meno" onclick={() => setValue(value - 1)}><Icon name="remove" /></button>
        <button type="button" class="dz-value num" class:typing={keypad} aria-label="Digita il numero" onclick={toggleKeypad}>{tab === 'add' ? '+' : ''}{value}</button>
        <button type="button" aria-label="Uno in più" onclick={() => setValue(value + 1)}><Icon name="add" /></button>
      </div>
      {#if keypad}
        <Keypad keys={['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫']} onkey={key} />
      {:else}
        <div class="dz-quick">
          {#if tab === 'add'}
            {#each [5, 10, 20, 50] as n (n)}<button type="button" onclick={() => setValue(addQty + n)}>+{n}</button>{/each}
          {:else}
            {#each [-10, -5, 5, 10] as n (n)}<button type="button" onclick={() => setValue(countQty + n)}>{n > 0 ? '+' : '−'}{Math.abs(n)}</button>{/each}
          {/if}
          <button type="button" class="kb" aria-label="Tastierino numerico" onclick={toggleKeypad}><Icon name="dialpad" /></button>
        </div>
      {/if}
      {#if err}<p class="kerr" use:reveal>{err}</p>{:else if msg}<p class="okmsg" style="margin-top:10px" use:reveal>{msg}</p>{:else}<p class="hint">{preview}</p>{/if}
    </div>
    <div class="dz-action">
      <button type="button" class="solid" disabled={busy} onclick={save}>
        <Icon name="check" /><span>{tab === 'add' ? (addQty ? `Aggiungi ${addQty} ${addQty === 1 ? 'pezzo' : 'pezzi'}` : 'Aggiungi alla dotazione') : 'Registra conteggio'}</span>
      </button>
    </div>
  {/if}
</div>
