<script>
  import Icon from '../components/Icon.svelte';
  import Dialog from '../components/Dialog.svelte';
  import AdminHeader from '../components/AdminHeader.svelte';
  import { app, refreshAll } from '../lib/state.svelte.js';
  import { q } from '../lib/db/index.js';
  import { hub, newPairingCode, closePairing, renameTill, removeTill, restartHub, newShareCode, closeShare } from '../lib/sync/hub.svelte.js';
  import { link, syncNow, changeAddress, urlFor, hello, unsentCount, stopLink } from '../lib/sync/link.svelte.js';
  import { eraseLocalData } from '../lib/sync/identity.js';
  import { reveal } from '../lib/reveal.js';

  const principal = $derived(app.till.role === 'principal');
  let tills = $state([]);
  let editing = $state(null); // { id, name, err }
  let confirmRemove = $state(null);
  let showAddr = $state(false);
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
  const online = (id) => hub.seen[id] && now - new Date(hub.seen[id].at).getTime() < 20000;
  const onlineCount = $derived(secondaries.filter((t) => online(t.id)).length);
  const ago = (iso) => {
    if (!iso) return 'mai';
    const s = Math.round((now - new Date(iso).getTime()) / 1000);
    if (s < 15) return 'adesso';
    if (s < 60) return `${s} secondi fa`;
    if (s < 3600) return `${Math.round(s / 60)} min fa`;
    return new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const left = (exp) => Math.max(0, Math.round((exp - now) / 1000));
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const pairLeft = $derived(hub.code ? left(hub.codeExpires) : 0);
  const shareLeft = $derived(hub.shareCode ? left(hub.shareExpires) : 0);
  $effect(() => { if (hub.code && pairLeft === 0) closePairing(); });
  $effect(() => { if (hub.shareCode && shareLeft === 0) closeShare(); });

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
      showAddr = false;
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
  const LINK = {
    ok: ['ok', 'check_circle', 'Collegata alla cassa principale'],
    syncing: ['wait', 'progress_activity', 'Collegamento in corso'],
    offline: ['warn', 'cloud_off', 'Cassa principale non raggiungibile'],
    revoked: ['bad', 'link_off', 'Scollegata dalla cassa principale'],
    idle: ['wait', 'progress_activity', 'Collegamento in corso']
  };
  const ls = $derived(LINK[link.state] || LINK.idle);
</script>

{#snippet codeDigits(code)}
  <div class="cs-code num" aria-label="Codice {code}">
    {#each code.split('') as d, i (i)}<span>{d}</span>{/each}
  </div>
{/snippet}

<div class="admin">
  <AdminHeader />
  <div class="abody">
    <div class="cs-grid">
      <!-- colonna principale -->
      <div class="cs-stack">
        <section class="panel cs-hero">
          <div class="cs-badge" class:on={principal ? hub.running : link.state === 'ok'}><Icon name={principal ? 'hub' : 'lan'} size={30} /></div>
          <div class="cs-hero-txt">
            {#if editing?.id === app.till.id}
              <div class="newev">
                <input class="field" bind:value={editing.name} use:reveal onkeydown={(e) => e.key === 'Enter' && saveRename()} />
                <button type="button" class="outline" style="height:52px" onclick={() => (editing = null)}>Annulla</button>
                <button type="button" class="solid" onclick={saveRename}>Salva</button>
              </div>
              {#if editing.err}<p class="kerr">{editing.err}</p>{/if}
            {:else}
              <span class="cs-eyebrow">Questa cassa</span>
              <h2>{app.till.name}</h2>
              <div class="cs-tags">
                <span class="tag" style="margin:0">{principal ? 'Cassa principale' : 'Cassa secondaria'}</span>
                <span class="tag off" style="margin:0">Codice {app.till.id}</span>
              </div>
            {/if}
          </div>
          {#if principal && editing?.id !== app.till.id}
            <button type="button" class="outline sm" onclick={() => (editing = { id: app.till.id, name: app.till.name, err: '' })}><Icon name="edit" /><span>Rinomina</span></button>
          {/if}
          {#if !principal}
            <p class="hint cs-hero-note">Il nome di questa cassa lo decide la cassa principale.</p>
          {/if}
        </section>

        {#if principal}
          <section class="panel">
            <header class="cs-head">
              <div>
                <h3>Casse collegate</h3>
                <p class="hint">{secondaries.length ? `${secondaries.length} ${secondaries.length === 1 ? 'cassa' : 'casse'}, ${onlineCount} in rete adesso` : 'Le casse secondarie vendono per lo stesso stand e si sincronizzano con questa.'}</p>
              </div>
              <button type="button" class="solid sm" onclick={newPairingCode}><Icon name="add_link" /><span>Collega una cassa</span></button>
            </header>

            {#if secondaries.length}
              <ul class="cs-list">
                {#each secondaries as t (t.id)}
                  <li class="cs-item">
                    {#if editing?.id === t.id}
                      <div class="cs-edit">
                        <div class="newev">
                          <input class="field" bind:value={editing.name} use:reveal onkeydown={(e) => e.key === 'Enter' && saveRename()} />
                          <button type="button" class="outline" style="height:52px" onclick={() => (editing = null)}>Annulla</button>
                          <button type="button" class="solid" onclick={saveRename}>Salva</button>
                        </div>
                        {#if editing.err}<p class="kerr">{editing.err}</p>{/if}
                      </div>
                    {:else}
                      <span class="cs-avatar" class:on={online(t.id)}>{t.id}</span>
                      <span class="cs-item-txt">
                        <strong>{t.name}</strong>
                        <small>{online(t.id) ? 'In rete adesso' : 'Ultimo contatto: ' + ago(hub.seen[t.id]?.at)}{hub.seen[t.id]?.ip ? ', ' + hub.seen[t.id].ip : ''}</small>
                      </span>
                      <span class="cs-item-acts">
                        <button type="button" class="icon-btn" aria-label="Rinomina {t.name}" title="Rinomina" onclick={() => { confirmRemove = null; editing = { id: t.id, name: t.name, err: '' }; }}><Icon name="edit" /></button>
                        <button type="button" class="icon-btn danger" aria-label="Scollega {t.name}" title="Scollega" onclick={() => (confirmRemove = t.id)}><Icon name="link_off" /></button>
                      </span>
                      {#if confirmRemove === t.id}
                        <div class="confirmbox cs-confirm" use:reveal>
                          <p>Scollegare {t.name}? Non potrà più sincronizzarsi. Le vendite già inviate restano; per usarla di nuovo andrà azzerata e ricollegata.</p>
                          <button type="button" onclick={() => (confirmRemove = null)}>Annulla</button>
                          <button type="button" class="go" onclick={async () => { confirmRemove = null; await removeTill(t.id); }}>Scollega</button>
                        </div>
                      {/if}
                    {/if}
                  </li>
                {/each}
              </ul>
            {:else}
              <div class="cs-empty">
                <Icon name="devices" size={40} />
                <p><strong>Nessuna cassa collegata</strong><br />Questa cassa funziona anche da sola. Per aggiungerne una, tocca "Collega una cassa".</p>
              </div>
            {/if}
          </section>
        {:else}
          <section class="panel cs-status {ls[0]}">
            <div class="cs-status-top">
              <Icon name={ls[1]} size={28} />
              <div>
                <h3>{ls[2]}</h3>
                <p>{link.state === 'revoked' ? 'Per usarla di nuovo, azzerala e ricollegala.' : link.state === 'offline' ? 'Continua a vendere: le registrazioni partono appena la principale torna raggiungibile.' : 'Le vendite arrivano alla principale in pochi secondi.'}</p>
              </div>
            </div>
            <dl class="cs-facts">
              <div><dt>Cassa principale</dt><dd>{link.principalName || '—'}<small>{link.url.replace('http://', '')}</small></dd></div>
              <div><dt>Ultima sincronizzazione</dt><dd>{ago(link.lastSync)}</dd></div>
              <div><dt>In attesa di invio</dt><dd class="num">{link.pending}</dd></div>
            </dl>
            {#if link.state === 'offline' && link.error}<p class="hint">{link.error}</p>{/if}
            {#if link.state !== 'revoked'}
              <div class="cs-actions">
                <button type="button" class="solid sm" onclick={syncNow}><Icon name="sync" /><span>Sincronizza ora</span></button>
                <button type="button" class="linkb" onclick={() => (showAddr = !showAddr)}>{showAddr ? 'Chiudi' : 'La principale ha cambiato indirizzo?'}</button>
              </div>
              {#if showAddr}
                <div class="cs-addr" use:reveal>
                  <label class="flabel" style="margin-top:0" for="naddr">Nuovo indirizzo della cassa principale</label>
                  <div class="newev">
                    <input id="naddr" class="field num" inputmode="decimal" placeholder="192.168.1.20" bind:value={addr} oninput={() => (addrErr = '')} />
                    <button type="button" class="solid" onclick={saveAddr}>Usa</button>
                  </div>
                  {#if addrErr}<p class="kerr">{addrErr}</p>{:else}<p class="hint">Di solito non serve: se la principale cambia indirizzo, questa cassa la ritrova da sola.</p>{/if}
                </div>
              {/if}
            {/if}
          </section>
        {/if}
      </div>

      <!-- colonna laterale -->
      <aside class="cs-stack">
        {#if principal}
          <section class="panel">
            <h3 class="cs-title"><Icon name="wifi" />Indirizzo sulla rete</h3>
            {#if hub.running}
              {#if hub.ips.length}
                <div class="cs-ips num">
                  {#each hub.ips as ip (ip)}<span>{ip}{hub.port !== 47800 ? ':' + hub.port : ''}</span>{/each}
                </div>
                <p class="hint">Le altre casse trovano questa cassa da sole. Se la ricerca non funziona, sulla cassa da collegare scrivi questo indirizzo.</p>
              {:else}
                <p class="hint">Nessuna rete attiva: collega il computer al router o all'hotspot.</p>
              {/if}
            {:else}
              <p class="kerr">La cassa non riesce a mettersi in ascolto sulla rete{hub.error ? ': ' + hub.error : '.'}</p>
            {/if}
            <p class="cs-tip"><Icon name="info" size={18} />La prima volta Windows chiede se consentire a Bip l'accesso alla rete: consenti almeno le reti private.</p>
          </section>

          <section class="panel">
            <h3 class="cs-title"><Icon name="share" />Condividi il catalogo</h3>
            <p class="hint">Copia prodotti e marchi su una cassa principale <strong>indipendente</strong>, per esempio di un'altra attività. Le due casse restano separate.</p>
            {#if hub.shared}<p class="okmsg">Catalogo inviato a {hub.shared}.</p>{/if}
            <button type="button" class="outline cs-wide" onclick={newShareCode}><Icon name="share" /><span>Condividi il catalogo</span></button>
          </section>
        {:else}
          <section class="panel dangerpanel">
            <h3 class="cs-title"><Icon name="link_off" />Scollega questa cassa</h3>
            <p class="hint">Cancella tutti i dati di questa cassa e torna alla schermata iniziale, per collegarla a un'altra principale o usarla come principale.</p>
            {#if resetAsk}
              <div class="confirmbox" use:reveal>
                <p>{resetAsk.pending ? `Attenzione: ${resetAsk.pending} registrazioni di questa cassa non sono ancora arrivate alla principale e andranno perse. Prima prova a sincronizzare.` : 'Tutte le registrazioni di questa cassa sono già sulla principale. Procedere?'}</p>
                <button type="button" onclick={() => (resetAsk = null)}>Annulla</button>
                <button type="button" class="go" onclick={doReset}>Scollega e azzera</button>
              </div>
            {:else}
              <button type="button" class="outline cs-wide" style="color:var(--err)" onclick={askReset}><Icon name="link_off" /><span>Scollega e azzera</span></button>
            {/if}
          </section>
        {/if}
      </aside>
    </div>
  </div>
</div>

{#if principal && (hub.code || hub.justPaired)}
  <Dialog label="Collega una cassa" onclose={() => { closePairing(); hub.justPaired = null; }}>
    {#if hub.code}
      <h2>Collega una cassa</h2>
      <ol class="cs-steps">
        <li>Sulla nuova cassa scegli <strong>Collegala a una cassa principale</strong>.</li>
        <li>Seleziona <strong>{app.till.name}</strong> nell'elenco{hub.ips[0] ? `, oppure scrivi l'indirizzo ${hub.ips[0]}` : ''}.</li>
        <li>Inserisci questo codice:</li>
      </ol>
      {@render codeDigits(hub.code)}
      <div class="cs-timer"><i style="width:{(pairLeft / 600) * 100}%"></i></div>
      <p class="hint" style="text-align:center">Valido ancora {mmss(pairLeft)}</p>
      <button type="button" class="outline cs-wide" onclick={closePairing}>Annulla</button>
    {:else}
      <div class="cs-done"><Icon name="check_circle" size={56} fill /></div>
      <h2 style="text-align:center">{hub.justPaired} collegata</h2>
      <p class="hint" style="text-align:center">Sta ricevendo prodotti, eventi e impostazioni. Puoi rinominarla dall'elenco delle casse.</p>
      <button type="button" class="solid cs-wide" onclick={() => (hub.justPaired = null)}>Fine</button>
    {/if}
  </Dialog>
{/if}

{#if principal && hub.shareCode}
  <Dialog label="Condividi il catalogo" onclose={closeShare}>
    <h2>Condividi il catalogo</h2>
    <ol class="cs-steps">
      <li>Sull'altra cassa apri <strong>Prodotti → Importa → Da un'altra cassa Bip</strong>.</li>
      <li>Seleziona <strong>{app.till.name}</strong>{hub.ips[0] ? ` o scrivi l'indirizzo ${hub.ips[0]}` : ''}.</li>
      <li>Inserisci questo codice:</li>
    </ol>
    {@render codeDigits(hub.shareCode)}
    <div class="cs-timer"><i style="width:{(shareLeft / 600) * 100}%"></i></div>
    <p class="hint" style="text-align:center">{hub.shared ? `Catalogo inviato a ${hub.shared}. ` : ''}Valido ancora {mmss(shareLeft)}</p>
    <button type="button" class="outline cs-wide" onclick={closeShare}>{hub.shared ? 'Fine' : 'Annulla'}</button>
  </Dialog>
{/if}
