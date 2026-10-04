<script>
  // Scelta del marchio: pulsanti se i marchi sono pochi, un elenco da toccare se sono tanti.
  // Con allowCreate si può creare un marchio nuovo senza lasciare la scheda.
  import Icon from './Icon.svelte';
  import TouchSelect from './TouchSelect.svelte';
  import { app } from '../lib/state.svelte.js';
  import { createBrand, brandExists } from '../lib/brands.js';
  import { reveal } from '../lib/reveal.js';

  let { value = $bindable(null), allowCreate = false } = $props();

  let creating = $state(false);
  let name = $state('');
  let err = $state('');
  const count = (id) => app.products.filter((p) => (p.brand_id || null) === id).length;
  const options = $derived([
    { value: null, label: 'Senza marchio' },
    ...app.brands.map((b) => ({ value: b.id, label: b.name, hint: `${count(b.id)} prodotti` }))
  ]);

  async function create() {
    const n = name.trim();
    if (!n) { err = 'Scrivi il nome del marchio.'; return; }
    if (brandExists(app.brands, n)) { err = 'Esiste già un marchio con questo nome.'; return; }
    const b = await createBrand(n);
    value = b.id;
    creating = false;
    name = '';
  }
</script>

{#if app.brands.length <= 6}
  <div class="chips brandchips">
    <button type="button" class:on={!value} onclick={() => (value = null)}>Senza marchio</button>
    {#each app.brands as b (b.id)}
      <button type="button" class:on={value === b.id} onclick={() => (value = b.id)}>{b.name}</button>
    {/each}
    {#if allowCreate && !creating}
      <button type="button" class="addchip" onclick={() => (creating = true)}><Icon name="add" size={20} />Nuovo marchio</button>
    {/if}
  </div>
{:else}
  <div class="brandrow">
    <TouchSelect bind:value {options} label="Marchio" wide />
    {#if allowCreate && !creating}
      <button type="button" class="addchip" onclick={() => (creating = true)}><Icon name="add" size={20} />Nuovo marchio</button>
    {/if}
  </div>
{/if}

{#if allowCreate && creating}
  <div class="newbrand" use:reveal>
    <span class="flabel" style="margin-top:0">Nuovo marchio</span>
    <div class="newev">
      <input class="field" placeholder="Nome del marchio" bind:value={name} oninput={() => (err = '')} onkeydown={(e) => e.key === 'Enter' && create()} />
      <button type="button" class="solid" onclick={create}>Crea</button>
    </div>
    {#if err}<p class="kerr">{err}</p>{/if}
    <button type="button" class="linkb" onclick={() => { creating = false; err = ''; }}>Annulla</button>
  </div>
{/if}
