<script>
  // Elenco dei prodotti da importare (da Excel o da un'altra cassa): stato di ciascuno,
  // scelta del marchio, selezione e importazione.
  import Icon from './Icon.svelte';
  import Cover from './Cover.svelte';
  import BrandPicker from './BrandPicker.svelte';
  import { app, brandName } from '../lib/state.svelte.js';
  import { matchLocal, statusOf, STATUS_TAGS, importItems, importMessage } from '../lib/catalogImport.js';
  import { eur } from '../lib/money.js';
  import { codeLabel } from '../lib/codes.js';
  import { revealFirstError } from '../lib/reveal.js';

  let { source, errors = [], ondone, sourceLabel = 'del file' } = $props();

  const hasBrands = $derived(source.some((i) => i.brand_name));
  let brandMode = $state('source'); // 'source': marchi indicati nell'origine · 'one': un solo marchio per tutti
  let brand = $state(null);
  let selected = $state(new Set());
  let showErrors = $state(false);
  let busy = $state(false);
  let err = $state('');

  const items = $derived(source.map((it) => { const local = matchLocal(it, app.products); return { ...it, local, status: statusOf(it, local) }; }));
  const useSource = $derived(hasBrands && brandMode === 'source');
  const localBrandId = (name) => app.brands.find((b) => b.name.trim().toLowerCase() === String(name || '').trim().toLowerCase())?.id || null;
  const moving = $derived(
    items.filter((i) => {
      if (!selected.has(i.key) || !i.local || !i.local.brand_id) return false;
      if (useSource) return i.brand_name && localBrandId(i.brand_name) !== i.local.brand_id;
      return brand && i.local.brand_id !== brand;
    }).length
  );
  const newBrands = $derived(useSource ? [...new Set(items.filter((i) => selected.has(i.key) && i.brand_name && !localBrandId(i.brand_name)).map((i) => i.brand_name.trim()))] : []);
  const count = (s) => items.filter((i) => i.status === s).length;

  $effect(() => {
    selected = new Set(items.filter((i) => i.status === 'new' || i.status === 'changed').map((i) => i.key));
  });

  function toggle(k) {
    const s = new Set(selected);
    s.has(k) ? s.delete(k) : s.add(k);
    selected = s;
    err = '';
  }
  async function doImport() {
    if (!selected.size) { err = 'Seleziona almeno un prodotto da importare.'; revealFirstError(); return; }
    busy = true;
    const r = await importItems(items.filter((i) => selected.has(i.key)), useSource ? null : brand, useSource);
    busy = false;
    ondone(importMessage(r, !useSource && brand ? brandName(brand) : ''));
  }
</script>

<div class="panel importbrand" style="margin-top:12px">
  <h3>Marchio</h3>
  {#if hasBrands}
    <div class="seg two" role="group" aria-label="Marchio" style="max-width:520px;margin-bottom:12px">
      <button type="button" class:on={brandMode === 'source'} onclick={() => (brandMode = 'source')}>Usa i marchi {sourceLabel}</button>
      <button type="button" class:on={brandMode === 'one'} onclick={() => (brandMode = 'one')}>Un solo marchio per tutti</button>
    </div>
  {/if}
  {#if useSource}
    <p class="hint" style="margin:0">Ogni prodotto va nel marchio indicato, riconosciuto dal nome. I prodotti senza marchio mantengono quello attuale.{newBrands.length ? ` Verranno creati: ${newBrands.join(', ')}.` : ''}</p>
  {:else}
    <p class="hint" style="margin:-4px 0 12px">Tutti i prodotti importati vengono assegnati al marchio scelto. Con "Senza marchio" i prodotti già presenti mantengono il loro.</p>
    <BrandPicker bind:value={brand} allowCreate />
  {/if}
  {#if moving}
    <p class="hint warn" style="margin-top:10px">{moving === 1 ? '1 prodotto selezionato cambierà' : `${moving} prodotti selezionati cambieranno`} marchio.</p>
  {/if}
</div>

<div class="counts" style="margin-top:16px">
  <span class="tag" style="margin-left:0">{count('new')} {count('new') === 1 ? 'nuovo' : 'nuovi'}</span>
  <span class="tag warn" style="margin-left:0">{count('changed')} {count('changed') === 1 ? 'modificato' : 'modificati'}</span>
  <span class="tag off" style="margin-left:0">{count('same')} già {count('same') === 1 ? 'presente' : 'presenti'}</span>
  {#if errors.length}
    <button type="button" class="tag bad" style="margin-left:0;border:0;cursor:pointer" onclick={() => (showErrors = !showErrors)}>{errors.length} {errors.length === 1 ? 'riga con errori' : 'righe con errori'}</button>
  {/if}
</div>
{#if showErrors && errors.length}
  <div class="panel" style="margin-bottom:12px">
    <h3>Righe non importate</h3>
    {#each errors as e (e.line)}
      <div class="kvrow"><span>Riga {e.line}{e.name ? `: ${e.name}` : ''}<small>{e.text}</small></span><span></span></div>
    {/each}
    <p class="hint">Correggile nel file e sceglilo di nuovo, oppure importa intanto le righe corrette.</p>
  </div>
{/if}

<div style="display:flex;gap:14px;margin-bottom:6px;flex-wrap:wrap">
  <button type="button" class="linkb" onclick={() => (selected = new Set(items.filter((i) => i.status !== 'same').map((i) => i.key)))}>Seleziona nuovi e modificati</button>
  <button type="button" class="linkb" onclick={() => (selected = new Set(items.map((i) => i.key)))}>Seleziona tutti</button>
  <button type="button" class="linkb" onclick={() => (selected = new Set())}>Deseleziona tutto</button>
</div>
{#each items as it (it.key)}
  {@const on = selected.has(it.key)}
  <button type="button" class="fgrid" aria-pressed={on} onclick={() => toggle(it.key)}>
    <span class="ck" class:on><Icon name={on ? 'check_box' : 'check_box_outline_blank'} fill={on} /></span>
    <Cover item={it.local || { id: it.key, name: it.name }} />
    <span style="min-width:0"><span class="rt">{it.name}</span>
      <span class="ra num">{it.code ? codeLabel(it.code) : 'Senza codice'}{useSource && it.brand_name ? ', ' + it.brand_name : ''}{it.local && it.local.brand_id && app.brands.length ? ', ora in ' + brandName(it.local.brand_id) : ''}</span></span>
    <span class="fhide"><span class="tag {STATUS_TAGS[it.status][0]}" style="margin-left:0">{STATUS_TAGS[it.status][1]}</span></span>
    <span class="r-al num" style="font-weight:600">{#if it.status === 'changed' && it.local.price_cents !== it.price_cents}<span class="old">{eur(it.local.price_cents)}</span>{/if}{eur(it.price_cents)}</span>
    <span class="r-al fhide" style="color:var(--ink-2);font-size:14px">{it.vat_rate ? it.vat_rate + '%' : 'Assolta'}</span>
  </button>
{:else}
  <p class="hint">Nessun prodotto da importare.</p>
{/each}
{#if err}<p class="kerr">{err}</p>{/if}
<div class="ficbar">
  <span class="hint" style="margin:0">{selected.size} {selected.size === 1 ? 'prodotto selezionato' : 'prodotti selezionati'}{!useSource && brand ? ` nel marchio ${brandName(brand)}` : ''}</span>
  <button type="button" class="solid" disabled={busy} onclick={doImport}><Icon name="download" /><span>Importa</span></button>
</div>
