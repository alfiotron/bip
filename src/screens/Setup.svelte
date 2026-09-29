<script>
  import Icon from '../components/Icon.svelte';
  import Keypad from '../components/Keypad.svelte';
  import { app, refreshAll } from '../lib/state.svelte.js';
  import { becomePrincipal, localContent, eraseLocalData, saveSecondary } from '../lib/sync/identity.js';
  import { discover } from '../lib/net.js';
  import { hello, pair, urlFor, startLink, syncNow, link } from '../lib/sync/link.svelte.js';
  import { startHub } from '../lib/sync/hub.svelte.js';
  import { reveal } from '../lib/reveal.js';
  import logo from '../../app-icon.svg';

  // Primo avvio: questa cassa è la principale, oppure si collega a una principale.
  let { onreset = null } = $props(); // presente quando si arriva qui scollegando una cassa

  let step = $state('choose'); // 'choose' | 'principal' | 'find' | 'code' | 'receiving'
  let name = $state('Cassa 1');
  let found = $state([]);
  let searching = $state(false);
  let manual = $state('');
  let target = $state(null); // { url, info }
  let code = $state('');
  let err = $state('');
  let busy = $state(false);
  let content = $state({ sales: 0, products: 0, events: 0, journal: 0 });
  let confirmErase = $state(false);
  localContent().then((c) => (content = c));

  const hasData = $derived(content.journal > 0);

  async function asPrincipal() {
    busy = true;
    await becomePrincipal(name);
    await refreshAll();
    await startHub();
    app.setupNeeded = false;
    busy = false;
  }

  async function search() {
    searching = true;
    err = '';
    try {
      found = (await discover(3000)).filter((f) => f.addresses?.length);
    } catch (e) {
      found = [];
      err = 'Ricerca non riuscita: ' + (e?.message || e);
    }
    searching = false;
  }
  function openFind() {
    step = 'find';
    search();
  }
  async function choose(url) {
    err = '';
    busy = true;
    try {
      const info = await hello(url);
      target = { url, info };
      step = 'code';
      code = '';
    } catch (e) {
      err = e?.message || 'La cassa principale non risponde a questo indirizzo.';
    }
    busy = false;
  }
  function manualUrl() {
    const v = manual.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!v) { err = "Scrivi l'indirizzo mostrato dalla cassa principale, per esempio 192.168.1.20."; return; }
    const [host, port] = v.split(':');
    choose(urlFor(host, port ? Number(port) : undefined));
  }
  function key(k) {
    err = '';
    if (k === 'C') code = '';
    else if (k === '⌫') code = code.slice(0, -1);
    else if (code.length < 6) code += k;
  }
  async function connect() {
    if (code.length !== 6) { err = 'Il codice ha 6 cifre.'; return; }
    if (hasData && !confirmErase) { err = 'Conferma la cancellazione dei dati di questa cassa.'; return; }
    busy = true;
    err = '';
    try {
      const r = await pair(target.url, code);
      step = 'receiving';
      await eraseLocalData();
      await saveSecondary({ tillId: r.till_id, shopId: r.shop_id, principalUrl: target.url, principalName: r.principal?.name || target.info.till_name, key: r.key });
      link.firstSync = true;
      await refreshAll();
      await syncNow();
      await startLink();
      await refreshAll();
      app.setupNeeded = false;
    } catch (e) {
      err = e?.message || 'Collegamento non riuscito.';
      if (step === 'receiving') step = 'code';
    }
    busy = false;
  }
</script>

<div class="setup">
  <div class="setupcard">
    <img src={logo} alt="" width="64" height="64" />
    {#if step === 'choose'}
      <h1>Benvenuto in Bip</h1>
      <p class="hint">Come userai questa cassa?</p>
      <div class="setupchoices">
        <button type="button" class="panel importcard" onclick={() => (step = 'principal')}>
          <Icon name="hub" size={32} />
          <h3>È la cassa principale</h3>
          <p class="hint">La prima cassa dello stand, o l'unica. Tiene tutti i dati e le altre casse si collegano a lei.</p>
        </button>
        <button type="button" class="panel importcard" onclick={openFind}>
          <Icon name="lan" size={32} />
          <h3>Collegala a una cassa principale</h3>
          <p class="hint">Una cassa in più per lo stesso stand. Riceve prodotti ed eventi dalla principale e le manda le sue vendite.</p>
        </button>
      </div>
      {#if onreset}<button type="button" class="linkb" onclick={onreset}>Annulla</button>{/if}

    {:else if step === 'principal'}
      <h1>Cassa principale</h1>
      <p class="hint">Dai un nome a questa cassa: lo vedranno le altre casse quando si collegano.</p>
      <label class="flabel" for="tname">Nome della cassa</label>
      <input id="tname" class="field" bind:value={name} />
      {#if hasData}<p class="hint">I dati già presenti in questa cassa ({content.products} prodotti, {content.sales} vendite) restano.</p>{/if}
      <div class="factions">
        <button type="button" class="outline" onclick={() => (step = 'choose')}>Indietro</button>
        <button type="button" class="solid" disabled={busy} onclick={asPrincipal}><Icon name="check" /><span>Inizia</span></button>
      </div>

    {:else if step === 'find'}
      <h1>Trova la cassa principale</h1>
      <p class="hint">Le due casse devono essere sulla stessa rete: il router dello stand o l'hotspot di un telefono. Internet non serve.</p>
      <div class="found">
        {#if searching}
          <p class="hint"><Icon name="progress_activity" /> Cerco le casse principali sulla rete…</p>
        {:else}
          {#each found as f, i (i)}
            <button type="button" class="cl" disabled={busy} onclick={() => choose(urlFor(f.addresses[0], f.port))}>
              {f.properties?.tillname || f.name}{f.properties?.shopname ? ', ' + f.properties.shopname : ''}
              <small>{f.addresses[0]}{f.port !== 47800 ? ':' + f.port : ''}</small>
            </button>
          {:else}
            <p class="hint">Nessuna cassa principale trovata automaticamente. Può succedere con alcuni hotspot: usa l'indirizzo qui sotto.</p>
          {/each}
          <button type="button" class="linkb" onclick={search}><Icon name="refresh" size={18} />Cerca di nuovo</button>
        {/if}
      </div>
      <label class="flabel" for="maddr">Oppure scrivi l'indirizzo della cassa principale</label>
      <div class="newev">
        <input id="maddr" class="field num" inputmode="decimal" placeholder="192.168.1.20" bind:value={manual} onkeydown={(e) => e.key === 'Enter' && manualUrl()} />
        <button type="button" class="solid" disabled={busy} onclick={manualUrl}>Collega</button>
      </div>
      <p class="hint">Lo trovi sulla cassa principale, nella scheda Casse.</p>
      {#if err}<p class="kerr" use:reveal>{err}</p>{/if}
      <div class="factions"><button type="button" class="outline" onclick={() => (step = 'choose')}>Indietro</button><span></span></div>

    {:else if step === 'code'}
      <h1>{target.info.till_name}{target.info.shop_name ? ', ' + target.info.shop_name : ''}</h1>
      <p class="hint">Sulla cassa principale apri la scheda <strong>Casse</strong>, tocca <strong>Collega una nuova cassa</strong> e scrivi qui il codice che compare.</p>
      <div class="display num codebox" class:bad={err}>{code || '······'}</div>
      <Keypad keys={['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫']} onkey={key} />
      {#if hasData}
        <button type="button" class="switch" class:on={confirmErase} role="switch" aria-checked={confirmErase} onclick={() => { confirmErase = !confirmErase; err = ''; }}>
          <span>Cancella i dati di questa cassa ({content.products} prodotti, {content.sales} vendite) e usa quelli della principale</span><span class="knob"></span>
        </button>
      {/if}
      {#if err}<p class="kerr" use:reveal>{err}</p>{/if}
      <div class="factions">
        <button type="button" class="outline" onclick={() => { step = 'find'; err = ''; }}>Indietro</button>
        <button type="button" class="solid" disabled={busy} onclick={connect}><Icon name="link" /><span>Collega</span></button>
      </div>

    {:else}
      <h1>Ricevo i dati</h1>
      <p class="hint"><Icon name="progress_activity" /> Sto ricevendo prodotti, eventi e impostazioni dalla cassa principale…</p>
      {#if err}<p class="kerr" use:reveal>{err}</p>{/if}
    {/if}
  </div>
</div>
