<script>
  import Icon from '../components/Icon.svelte';
  import AdminHeader from '../components/AdminHeader.svelte';
  import { app, refreshAll } from '../lib/state.svelte.js';
  import { q } from '../lib/db/index.js';
  import { hub, newPairingCode, closePairing, renameTill, removeTill, restartHub } from '../lib/sync/hub.svelte.js';
  import { link, syncNow, changeAddress, urlFor, hello, unsentCount, stopLink } from '../lib/sync/link.svelte.js';
  import { eraseLocalData } from '../lib/sync/identity.js';
  import { reveal } from '../lib/reveal.js';

  const principal = $derived(app.till.role === 'principal');
  let tills = $state([]);
  let editing = $state(null); // { id, name, err }
  let confirmRemove = $state(null);
  let addr = $state('');
  let addrErr = $state('');
  let resetAsk = $state(null); // { pending }
  let now = $state(Date.now());

  $effect(() => {
    app.version;
    q('SELECT * FROM tills ORDER BY id').then((r) => (tills = r.map((t) => ({ ...t, removed: !!t.removed }))));
  });
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  const secondaries = $derived(tills.filter((t) => t.role === 'secondary' && !t.removed));
  const ago = (iso) => {
    if (!iso) return 'mai';
    const s = Math.round((now - new Date(iso).getTime()) / 1000);
    if (s < 15) return 'adesso';
    if (s < 60) return `${s} secondi fa`;
    if (s < 3600) return `${Math.round(s / 60)} min fa`;
    return new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const online = (id) => hub.seen[id] && now - new Date(hub.seen[id].at).getTime() < 20000;
  const remaining = $derived(hub.code ? Math.max(0, Math.round((hub.codeExpires - now) / 1000)) : 0);
  $effect(() => {
    if (hub.code && remaining === 0) closePairing();
  });

  async function saveRename() {
    const n = editing.name.trim();
    if (!n) { editing.err = 'Il nome non può essere vuoto.'; return; }
    if (tills.some((t) => t.id !== editing.id && t.name.trim().toLowerCase() === n.toLowerCase())) { editing.err = 'Un\'altra cassa ha già questo nome.'; return; }
    await renameTill(editing.id, n);
    if (editing.id === app.till.id) await restartHub();
    editing = null;
  }
  async function saveAddr() {
    const v = addr.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!v) { addrErr = 'Scrivi l\'indirizzo della cassa principale.'; return; }
    const [h, p] = v.split(':');
    const url = urlFor(h, p ? Number(p) : undefined);
    try {
      await hello(url);
      await changeAddress(url);
      addr = '';
      addrErr = '';
    } catch (e) {
      addrErr = e?.message || 'La cassa principale non risponde a questo indirizzo.';
    }
  }
  async function askReset() {
    resetAsk = { pending: await unsentCount() };
  }
  async function doReset() {
    stopLink();
    await eraseLocalData();
    await refreshAll();
    app.screen = 'cassa';
    app.setupNeeded = true;
  }
</script>

<div class="admin">
  <AdminHeader />
  <div class="abody"><div class="narrow">

    <div class="panel about">
      <div class="netbadge" class:on={principal ? hub.running : link.state === 'ok'}><Icon name={principal ? 'hub' : 'lan'} size={28} /></div>
      <div style="flex:1;min-width:0">
        {#if editing?.id === app.till.id}
          <div class="newev">
            <input class="field" bind:value={editing.name} use:reveal onkeydown={(e) => e.key === 'Enter' && saveRename()} />
            <button type="button" class="outline" style="height:52px" onclick={() => (editing = null)}>Annulla</button>
            <button type="button" class="solid" onclick={saveRename}>Salva</button>
          </div>
          {#if editing.err}<p class="kerr">{editing.err}</p>{/if}
        {:else}
          <strong>{app.till.name}</strong>
          <span>{principal ? 'Cassa principale' : 'Cassa secondaria'}, codice {app.till.id}</span>
        {/if}
      </div>
      {#if principal && editing?.id !== app.till.id}
        <button type="button" class="outline sm" onclick={() => (editing = { id: app.till.id, name: app.till.name, err: '' })}>Rinomina</button>
      {/if}
    </div>

    {#if principal}
      <div class="panel">
        <h3>Rete</h3>
        {#if hub.running}
          <p class="hint" style="margin:-8px 0 12px">Le altre casse trovano questa cassa da sole sulla stessa rete. Se la ricerca automatica non funziona, sulla cassa da collegare scrivi uno di questi indirizzi:</p>
          <div class="ips num">
            {#each hub.ips as ip (ip)}<span>{ip}{hub.port !== 47800 ? ':' + hub.port : ''}</span>{:else}<span class="hint">Nessuna rete attiva: collega il computer al router o all'hotspot.</span>{/each}
          </div>
        {:else}
          <p class="kerr">La cassa non riesce a mettersi in ascolto sulla rete{hub.error ? ': ' + hub.error : '.'}</p>
        {/if}
        <p class="hint">La prima volta Windows chiede se consentire a Bip l'accesso alla rete: consenti almeno le reti private.</p>
      </div>

      <div class="panel">
        <div class="row-inline" style="justify-content:space-between">
          <h3 style="margin:0">Casse collegate</h3>
          {#if !hub.code}<button type="button" class="solid sm" onclick={newPairingCode}><Icon name="add_link" /><span>Collega una nuova cassa</span></button>{/if}
        </div>

        {#if hub.code}
          <div class="pairbox" use:reveal>
            <p>Sulla nuova cassa scegli <strong>Collegala a una cassa principale</strong>, seleziona questa cassa e scrivi il codice:</p>
            <div class="paircode num">{hub.code.slice(0, 3)} {hub.code.slice(3)}</div>
            <p class="hint">Valido ancora {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</p>
            <button type="button" class="outline" onclick={closePairing}>Annulla</button>
          </div>
        {/if}
        {#if hub.justPaired}<p class="okmsg" use:reveal>{hub.justPaired} collegata. Sta ricevendo i dati.</p>{/if}

        {#each secondaries as t (t.id)}
          <div class="erow">
            {#if editing?.id === t.id}
              <div style="grid-column:1/-1">
                <div class="newev">
                  <input class="field" bind:value={editing.name} use:reveal onkeydown={(e) => e.key === 'Enter' && saveRename()} />
                  <button type="button" class="outline" style="height:52px" onclick={() => (editing = null)}>Annulla</button>
                  <button type="button" class="solid" onclick={saveRename}>Salva</button>
                </div>
                {#if editing.err}<p class="kerr">{editing.err}</p>{/if}
              </div>
            {:else}
              <div style="min-width:0">
                <span class="evname"><span class="dot" class:on={online(t.id)}></span>{t.name}<span class="tag off">{t.id}</span></span>
                <span class="evstats num"><span>{online(t.id) ? 'Collegata' : 'Ultimo contatto: ' + ago(hub.seen[t.id]?.at)}</span>{#if hub.seen[t.id]?.ip}<span>{hub.seen[t.id].ip}</span>{/if}</span>
              </div>
              <div class="eacts">
                <button type="button" onclick={() => { confirmRemove = null; editing = { id: t.id, name: t.name, err: '' }; }}>Rinomina</button>
                <button type="button" class="danger" onclick={() => (confirmRemove = t.id)}>Scollega</button>
              </div>
              {#if confirmRemove === t.id}
                <div class="confirmbox" use:reveal>
                  <p>Scollegare {t.name}? Non potrà più sincronizzarsi. Le vendite che ha già inviato restano; per usarla di nuovo andrà azzerata e ricollegata.</p>
                  <button type="button" onclick={() => (confirmRemove = null)}>Annulla</button>
                  <button type="button" class="go" onclick={async () => { confirmRemove = null; await removeTill(t.id); }}>Scollega</button>
                </div>
              {/if}
            {/if}
          </div>
        {:else}
          {#if !hub.code}<p class="hint">Nessuna cassa collegata. Questa cassa funziona anche da sola.</p>{/if}
        {/each}
      </div>
    {:else}
      <div class="panel">
        <h3>Cassa principale</h3>
        <div class="kvrow"><span>{link.principalName || 'Cassa principale'}<small>{link.url.replace('http://', '')}</small></span>
          <span style="color:{link.state === 'ok' ? 'var(--ok)' : link.state === 'revoked' ? 'var(--err)' : 'var(--warn)'}">
            {link.state === 'ok' ? 'Collegata' : link.state === 'revoked' ? 'Scollegata' : link.state === 'syncing' ? 'Collegamento…' : 'Non raggiungibile'}
          </span></div>
        <div class="kvrow"><span>Ultima sincronizzazione</span><span>{ago(link.lastSync)}</span></div>
        <div class="kvrow"><span>Registrazioni di questa cassa in attesa di invio</span><span class="num">{link.pending}</span></div>
        {#if link.state === 'offline' && link.error}<p class="hint">{link.error}</p>{/if}
        {#if link.state === 'revoked'}
          <p class="kerr">La cassa principale ha scollegato questa cassa. Per usarla di nuovo azzerala e ricollegala.</p>
        {:else}
          <button type="button" class="solid" style="margin-top:12px" onclick={syncNow}><Icon name="sync" /><span>Sincronizza ora</span></button>
          <label class="flabel" for="naddr">La principale ha cambiato indirizzo? Scrivi quello nuovo</label>
          <div class="newev">
            <input id="naddr" class="field num" inputmode="decimal" placeholder="192.168.1.20" bind:value={addr} oninput={() => (addrErr = '')} />
            <button type="button" class="outline" style="height:52px" onclick={saveAddr}>Usa</button>
          </div>
          {#if addrErr}<p class="kerr">{addrErr}</p>{/if}
          <p class="hint">Di solito non serve: se la principale cambia indirizzo, questa cassa la ritrova da sola.</p>
        {/if}
      </div>

      <div class="panel">
        <h3>Scollega questa cassa</h3>
        <p class="hint" style="margin:-8px 0 12px">Cancella tutti i dati di questa cassa e torna alla schermata iniziale, per collegarla a un'altra principale o usarla come principale. Il nome lo decide la cassa principale.</p>
        {#if resetAsk}
          <div class="confirmbox" use:reveal>
            <p>{resetAsk.pending ? `Attenzione: ${resetAsk.pending} registrazioni di questa cassa non sono ancora arrivate alla principale e andranno perse. Prima prova a sincronizzare.` : 'Tutte le registrazioni di questa cassa sono già sulla principale. Procedere?'}</p>
            <button type="button" onclick={() => (resetAsk = null)}>Annulla</button>
            <button type="button" class="go" onclick={doReset}>Scollega e azzera</button>
          </div>
        {:else}
          <button type="button" class="outline" style="color:var(--err)" onclick={askReset}><Icon name="link_off" /><span>Scollega e azzera questa cassa</span></button>
        {/if}
      </div>
    {/if}
  </div></div>
</div>
