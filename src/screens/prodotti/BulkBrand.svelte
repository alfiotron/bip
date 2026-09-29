<script>
  import Icon from '../../components/Icon.svelte';
  import BrandPicker from '../../components/BrandPicker.svelte';
  import { app, brandName } from '../../lib/state.svelte.js';
  import { pf, assignBrand, stopSelecting } from '../../lib/products.svelte.js';
  import { reveal } from '../../lib/reveal.js';

  let brand = $state(null);
  let busy = $state(false);
  let msg = $state('');
  let err = $state('');

  const chosen = $derived(app.products.filter((p) => pf.sel.has(p.id)));
  // Da quali marchi arrivano i prodotti selezionati
  const from = $derived.by(() => {
    const m = new Map();
    for (const p of chosen) m.set(p.brand_id || '', (m.get(p.brand_id || '') || 0) + 1);
    return [...m.entries()].map(([id, n]) => ({ id: id || null, n })).sort((a, b) => b.n - a.n);
  });
  const toMove = $derived(chosen.filter((p) => (p.brand_id || null) !== (brand || null)).length);

  async function apply() {
    if (!chosen.length) { err = 'Seleziona almeno un prodotto nell\'elenco.'; return; }
    if (!toMove) { err = `I prodotti selezionati sono già ${brand ? 'nel marchio ' + brandName(brand) : 'senza marchio'}.`; return; }
    busy = true;
    const n = await assignBrand([...pf.sel], brand);
    busy = false;
    msg = `${n === 1 ? '1 prodotto spostato' : n + ' prodotti spostati'} ${brand ? 'nel marchio ' + brandName(brand) : 'in "Senza marchio"'}.`;
    pf.sel = new Set();
    pf.bulkOpen = false;
  }
</script>

<button type="button" class="back mback" onclick={() => (pf.bulkOpen = false)}><Icon name="arrow_back" /><span>Torna all'elenco</span></button>
<h2 class="fh">Sposta nel marchio</h2>
{#if chosen.length}
  <p class="hint">{chosen.length === 1 ? '1 prodotto selezionato' : `${chosen.length} prodotti selezionati`}, ora in:</p>
  <div style="margin-top:6px">
    {#each from as f (f.id || '')}
      <div class="kvrow"><span>{brandName(f.id)}</span><span class="num">{f.n}</span></div>
    {/each}
  </div>
{:else}
  <p class="hint">Tocca i prodotti nell'elenco per selezionarli. Puoi usare la ricerca e il filtro per marchio, poi "Seleziona tutti".</p>
{/if}

<span class="flabel">Nuovo marchio</span>
<BrandPicker bind:value={brand} allowCreate />

{#if err}<p class="kerr" use:reveal>{err}</p>{:else if msg}<p class="okmsg" use:reveal>{msg}</p>{/if}

<div class="factions">
  <button type="button" class="outline" onclick={stopSelecting}>Fine</button>
  <button type="button" class="solid" disabled={busy} onclick={apply}>
    <Icon name="drive_file_move" /><span>{toMove ? `Sposta ${toMove} ${toMove === 1 ? 'prodotto' : 'prodotti'}` : 'Sposta'}</span>
  </button>
</div>
