<script>
  // Scelta del marchio: pulsanti se i marchi sono pochi, menu a tendina se sono tanti.
  // Con allowCreate si può creare un marchio nuovo senza lasciare la scheda.
  import Icon from './Icon.svelte';
  import { app } from '../lib/state.svelte.js';
  import { createBrand, brandExists } from '../lib/brands.js';

  let { value = $bindable(null), allowCreate = false } = $props();

  let creating = $state(false);
  let name = $state('');
  let err = $state('');

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
  </div>
{:else}
  <select class="sel field" value={value || ''} onchange={(e) => (value = e.currentTarget.value || null)}>
    <option value="">Senza marchio</option>
    {#each app.brands as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
  </select>
{/if}

{#if allowCreate}
  {#if creating}
    <div class="newev" style="margin-top:8px">
      <input class="field" placeholder="Nome del marchio" bind:value={name} oninput={() => (err = '')} onkeydown={(e) => e.key === 'Enter' && create()} />
      <button type="button" class="solid" onclick={create}>Crea</button>
    </div>
    {#if err}<p class="kerr">{err}</p>{/if}
  {:else}
    <button type="button" class="linkb" style="margin-top:6px" onclick={() => (creating = true)}><Icon name="add" size={18} />Nuovo marchio</button>
  {/if}
{/if}
