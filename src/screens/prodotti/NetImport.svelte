<script>
  import Icon from '../../components/Icon.svelte';
  import Keypad from '../../components/Keypad.svelte';
  import ImportList from '../../components/ImportList.svelte';
  import { getMeta } from '../../lib/db/index.js';
  import { discover } from '../../lib/net.js';
  import { hello, urlFor, fetchCatalog } from '../../lib/sync/link.svelte.js';
  import { reveal } from '../../lib/reveal.js';

  // Ricezione del catalogo da un'altra cassa principale, indipendente da questa (per esempio di un'altra attività).
  let { onclose, ondone } = $props();

  let step = $state('find'); // 'find' | 'code' | 'list'
  let found = $state([]);
  let searching = $state(false);
  let manual = $state('');
  let target = $state(null);
  let code = $state('');
  let err = $state('');
  let busy = $state(false);
  let catalog = $state(null);

  async function search() {
    searching = true;
    err = '';
    const mine = await getMeta('shop_id', '');
    try {
      found = (await discover(3000)).filter((f) => f.addresses?.length && f.properties?.shop !== mine);
    } catch {
      found = [];
    }
    searching = false;
  }
  search();

  async function choose(url) {
    err = '';
    busy = true;
    try {
      target = { url, info: await hello(url) };
      step = 'code';
      code = '';
    } catch (e) {
      err = e?.message || 'L\'altra cassa non risponde a questo indirizzo.';
    }
    busy = false;
  }
  function manualUrl() {
    const v = manual.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!v) { err = 'Scrivi l\'indirizzo mostrato dall\'altra cassa, per esempio 192.168.1.20.'; return; }
    const [h, p] = v.split(':');
    choose(urlFor(h, p ? Number(p) : undefined));
  }
  function key(k) {
    err = '';
    if (k === 'C') code = '';
    else if (k === '⌫') code = code.slice(0, -1);
    else if (code.length < 6) code += k;
  }
  async function receive() {
    if (code.length !== 6) { err = 'Il codice ha 6 cifre.'; return; }
    busy = true;
    err = '';
    try {
      catalog = await fetchCatalog(target.url, code);
      step = 'list';
    } catch (e) {
      err = e?.message || 'Ricezione non riuscita.';
    }
    busy = false;
  }
  const items = $derived(catalog ? catalog.products.map((p, i) => ({ ...p, key: 'n' + i })) : []);
</script>

<div class="abody">
  <div class="shead"><button type="button" class="back" onclick={onclose}><Icon name="arrow_back" /><span>Prodotti</span></button><h2>Ricevi il catalogo da un'altra cassa</h2></div>

  {#if step === 'find'}
    <div class="panel">
      <p class="hint" style="margin:0 0 12px">Serve per copiare i prodotti da una cassa principale indipendente da questa. Sull'altra cassa apri la scheda <strong>Casse</strong> e tocca <strong>Condividi il catalogo</strong>. Le due casse devono essere sulla stessa rete.</p>
      {#if searching}
        <p class="hint"><Icon name="progress_activity" /> Cerco le altre casse sulla rete…</p>
      {:else}
        {#each found as f, i (i)}
          <button type="button" class="cl" disabled={busy} onclick={() => choose(urlFor(f.addresses[0], f.port))}>
            {f.properties?.tillname || f.name}{f.properties?.shopname ? ', ' + f.properties.shopname : ''}
            <small>{f.addresses[0]}</small>
          </button>
        {:else}
          <p class="hint">Nessun'altra cassa trovata automaticamente: usa l'indirizzo qui sotto.</p>
        {/each}
        <button type="button" class="linkb" onclick={search}><Icon name="refresh" size={18} />Cerca di nuovo</button>
      {/if}
      <label class="flabel" for="naddr2">Oppure scrivi l'indirizzo dell'altra cassa</label>
      <div class="newev">
        <input id="naddr2" class="field num" inputmode="decimal" placeholder="192.168.1.20" bind:value={manual} onkeydown={(e) => e.key === 'Enter' && manualUrl()} />
        <button type="button" class="solid" disabled={busy} onclick={manualUrl}>Collega</button>
      </div>
      {#if err}<p class="kerr" use:reveal>{err}</p>{/if}
    </div>
  {:else if step === 'code'}
    <div class="panel" style="max-width:520px">
      <h3>{target.info.till_name}{target.info.shop_name ? ', ' + target.info.shop_name : ''}</h3>
      <p class="hint" style="margin:-8px 0 12px">Scrivi il codice di condivisione mostrato sull'altra cassa.</p>
      <div class="display num codebox" class:bad={err}>{code || '······'}</div>
      <Keypad keys={['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫']} onkey={key} />
      {#if err}<p class="kerr" use:reveal>{err}</p>{/if}
      <div class="factions">
        <button type="button" class="outline" onclick={() => { step = 'find'; err = ''; }}>Indietro</button>
        <button type="button" class="solid" disabled={busy} onclick={receive}><Icon name="download" /><span>{busy ? 'Ricevo…' : 'Ricevi il catalogo'}</span></button>
      </div>
    </div>
  {:else}
    <p class="hint" style="margin:-8px 0 0">Catalogo di {catalog.till_name}{catalog.shop_name ? ', ' + catalog.shop_name : ''}: {catalog.products.length} prodotti. Scegli quali importare. Le due casse restano indipendenti: le modifiche successive non passano da una all'altra.</p>
    <ImportList source={items} sourceLabel="dell'altra cassa" {ondone} />
  {/if}
</div>
