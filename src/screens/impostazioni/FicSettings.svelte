<script>
  import Icon from '../../components/Icon.svelte';
  import { ficConfig, saveFicConfig } from '../../lib/ficStore.js';
  import { listCompanies } from '../../lib/fic.js';

  let cfg = $state({ token: '', companyId: '', companyName: '' });
  let token = $state('');
  let companies = $state([]);
  let err = $state('');
  let busy = $state(false);
  ficConfig().then((c) => (cfg = c));

  async function verify() {
    err = '';
    const t = token.trim().replace(/^Bearer\s+/i, '');
    if (!t) { err = 'Incolla il token generato in Fatture in Cloud.'; return; }
    busy = true;
    try {
      const list = await listCompanies(t);
      if (!list.length) err = 'Il token non dà accesso a nessuna azienda. Rigeneralo scegliendo la tua azienda.';
      else if (list.length === 1) await connect(t, list[0]);
      else companies = list;
    } catch (e) {
      err = e.message;
    }
    busy = false;
  }
  async function connect(t, c) {
    cfg = { token: t, companyId: String(c.id), companyName: c.name };
    await saveFicConfig(cfg);
    token = '';
    companies = [];
  }
  async function disconnect() {
    cfg = { token: '', companyId: '', companyName: '' };
    await saveFicConfig(cfg);
  }
</script>

<div class="panel">
  <h3>Fatture in Cloud</h3>
  {#if cfg.token && cfg.companyId}
    <div class="row-inline" style="justify-content:space-between">
      <p style="margin:0">Collegata a <strong>{cfg.companyName}</strong>, in sola lettura.</p>
      <button type="button" class="outline sm" onclick={disconnect}>Scollega</button>
    </div>
    <p class="hint">Da qui la cassa importa i prodotti (scheda Prodotti) e i DDT della dotazione (schede Dotazione e DDT). Serve internet solo durante l'importazione.</p>
  {:else}
    <p class="hint" style="margin:0 0 6px">Serve per importare prodotti e dotazione. Si fa una volta sola, con internet, sulla cassa principale.</p>
    <ol class="steps">
      <li>In Fatture in Cloud crea un'applicazione privata nell'area sviluppatori e annota il suo <strong>Client ID</strong>.</li>
      <li>Vai su <strong>Impostazioni → Applicazioni collegate → Collega una nuova applicazione</strong>, inserisci il Client ID e scegli la tua azienda.</li>
      <li>Concedi solo questi permessi in lettura: <strong>Prodotti</strong> e <strong>DDT</strong>.</li>
      <li>Copia il token generato e incollalo qui sotto.</li>
    </ol>
    <p class="hint">La procedura completa è nella guida ufficiale: developers.fattureincloud.it, sezione "Manual Authentication".</p>
    <label class="flabel" for="fictoken">Token</label>
    <div class="newev">
      <input id="fictoken" class="field" class:bad={err} type="password" autocomplete="off" placeholder="Incolla qui il token" bind:value={token} oninput={() => (err = '')} />
      <button type="button" class="solid" disabled={busy} onclick={verify}><Icon name="link" /><span>{busy ? 'Verifico…' : 'Collega'}</span></button>
    </div>
    {#if err}<p class="kerr">{err}</p>{/if}
    {#if companies.length}
      <span class="flabel">Il token dà accesso a più aziende: scegli quella da usare</span>
      {#each companies as c (c.id)}
        <button type="button" class="cl" onclick={() => connect(token.trim().replace(/^Bearer\s+/i, ''), c)}>{c.name}</button>
      {/each}
    {/if}
  {/if}
</div>
