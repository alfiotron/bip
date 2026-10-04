<script>
  // Scelta da un elenco, pensata per il touchscreen: al posto del menu a tendina del sistema
  // si apre un pannello con voci grandi da toccare, con la ricerca quando le voci sono tante.
  import Icon from './Icon.svelte';
  import Dialog from './Dialog.svelte';

  let { value = $bindable(), options = [], label = '', placeholder = 'Scegli', onchange = null, invalid = false, wide = false } = $props();

  let open = $state(false);
  let query = $state('');
  const current = $derived(options.find((o) => o.value === value));
  const searchable = $derived(options.length > 8);
  const shown = $derived.by(() => {
    const t = query.trim().toLowerCase();
    return t ? options.filter((o) => `${o.label} ${o.hint || ''}`.toLowerCase().includes(t)) : options;
  });

  function close() {
    open = false;
    query = '';
  }
  function pick(o) {
    value = o.value;
    close();
    onchange?.(o.value);
  }
</script>

<button type="button" class="tsel" class:bad={invalid} class:wide aria-haspopup="dialog" onclick={() => (open = true)}>
  <span class="tsel-txt">
    {#if label}<small>{label}</small>{/if}
    <span class:ph={!current}>{current ? current.label : placeholder}</span>
  </span>
  <Icon name="expand_more" />
</button>

{#if open}
  <Dialog label={label || placeholder} onclose={close} sheet>
    <div class="tsheet-head">
      <h2>{label || placeholder}</h2>
      <button type="button" class="icon-btn" aria-label="Chiudi" onclick={close}><Icon name="close" /></button>
    </div>
    {#if searchable}
      <div class="psearch"><Icon name="search" /><input class="field" placeholder="Cerca" bind:value={query} /></div>
    {/if}
    <div class="tsheet-list">
      {#each shown as o, i (String(o.value) + i)}
        {#if o.group && (i === 0 || shown[i - 1].group !== o.group)}<p class="tsheet-group">{o.group}</p>{/if}
        <button type="button" class="tsheet-opt" class:on={o.value === value} onclick={() => pick(o)}>
          <span>{o.label}{#if o.hint}<small>{o.hint}</small>{/if}</span>
          {#if o.value === value}<Icon name="check" />{/if}
        </button>
      {:else}
        <p class="hint">Nessuna voce corrisponde alla ricerca.</p>
      {/each}
    </div>
  </Dialog>
{/if}
