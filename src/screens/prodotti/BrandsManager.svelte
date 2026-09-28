<script>
  import Icon from '../../components/Icon.svelte';
  import { app } from '../../lib/state.svelte.js';
  import { pf } from '../../lib/products.svelte.js';
  import { createBrand, renameBrand, brandUsage, deleteBrand, brandExists } from '../../lib/brands.js';
  import { reveal } from '../../lib/reveal.js';

  let newName = $state('');
  let newErr = $state('');
  let editing = $state(null); // { id, name, err }
  let confirm = $state(null); // { id, kind: 'ask' | 'blocked', text }

  const count = (id) => app.products.filter((p) => p.brand_id === id).length;
  const noBrand = $derived(app.products.filter((p) => !p.brand_id).length);

  async function create() {
    const n = newName.trim();
    if (!n) { newErr = 'Scrivi il nome del marchio.'; return; }
    if (brandExists(app.brands, n)) { newErr = 'Esiste già un marchio con questo nome.'; return; }
    await createBrand(n);
    newName = '';
  }
  async function saveRename() {
    const n = editing.name.trim();
    if (!n) { editing.err = 'Il nome non può essere vuoto.'; return; }
    if (brandExists(app.brands, n, editing.id)) { editing.err = 'Esiste già un marchio con questo nome.'; return; }
    await renameBrand(editing.id, n);
    editing = null;
  }
  async function askDelete(b) {
    const u = await brandUsage(b.id);
    if (u.lines) {
      confirm = { id: b.id, kind: 'blocked', text: `"${b.name}" compare nelle vendite già registrate: eliminarlo renderebbe le statistiche incomplete. Puoi rinominarlo, ma non eliminarlo.` };
    } else {
      confirm = {
        id: b.id,
        kind: 'ask',
        text: u.products
          ? `Eliminare "${b.name}"? I suoi ${u.products === 1 ? 'prodotto resterà' : u.products + ' prodotti resteranno'} in catalogo senza marchio.`
          : `Eliminare "${b.name}"?`
      };
    }
  }
  function showProducts(id) {
    pf.brand = id;
    pf.view = 'products';
  }
</script>

<div class="narrow">
  <p class="hint" style="margin:0 0 14px">Assegna ogni prodotto al suo marchio: le statistiche e l'esportazione in Excel mostreranno quanto ha venduto ciascuno. I marchi valgono per tutte le casse.</p>
  <label class="kl" for="newbrand">Nuovo marchio</label>
  <div class="newev">
    <input id="newbrand" class="field" class:bad={newErr} placeholder="Edizioni Aurora" bind:value={newName} oninput={() => (newErr = '')} onkeydown={(e) => e.key === 'Enter' && create()} />
    <button type="button" class="solid" onclick={create}><Icon name="add" /><span>Crea marchio</span></button>
  </div>
  {#if newErr}<p class="kerr">{newErr}</p>{/if}

  <p class="sect">Marchi</p>
  {#each app.brands as b (b.id)}
    <div class="erow">
      {#if editing?.id === b.id}
        <div style="grid-column:1/-1">
          <div class="newev">
            <input class="field" class:bad={editing.err} bind:value={editing.name} oninput={() => (editing.err = '')} onkeydown={(e) => e.key === 'Enter' && saveRename()} use:reveal />
            <button type="button" class="outline" style="height:52px" onclick={() => (editing = null)}>Annulla</button>
            <button type="button" class="solid" onclick={saveRename}>Salva</button>
          </div>
          {#if editing.err}<p class="kerr">{editing.err}</p>{/if}
        </div>
      {:else}
        <div style="min-width:0">
          <span class="evname">{b.name}</span>
          <span class="evstats num"><span>{count(b.id)} {count(b.id) === 1 ? 'prodotto' : 'prodotti'}</span></span>
        </div>
        <div class="eacts">
          <button type="button" onclick={() => showProducts(b.id)}>Prodotti</button>
          <button type="button" onclick={() => { confirm = null; editing = { id: b.id, name: b.name, err: '' }; }}>Rinomina</button>
          <button type="button" class="danger" onclick={() => askDelete(b)}>Elimina</button>
        </div>
        {#if confirm?.id === b.id}
          {#if confirm.kind === 'ask'}
            <div class="confirmbox" use:reveal>
              <p>{confirm.text}</p>
              <button type="button" onclick={() => (confirm = null)}>Annulla</button>
              <button type="button" class="go" onclick={async () => { confirm = null; await deleteBrand(b.id); }}>Elimina marchio</button>
            </div>
          {:else}
            <div class="confirmbox info" use:reveal><p>{confirm.text}</p><button type="button" onclick={() => (confirm = null)}>Ho capito</button></div>
          {/if}
        {/if}
      {/if}
    </div>
  {:else}
    <p class="hint">Nessun marchio. Creane uno qui sopra, poi assegnalo ai prodotti dalla loro scheda.</p>
  {/each}
  {#if noBrand && app.brands.length}
    <div class="erow">
      <div><span class="evname" style="color:var(--ink-2)">Senza marchio</span><span class="evstats num"><span>{noBrand} {noBrand === 1 ? 'prodotto' : 'prodotti'}</span></span></div>
      <div class="eacts"><button type="button" onclick={() => showProducts('none')}>Prodotti</button></div>
    </div>
  {/if}
</div>
