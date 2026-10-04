<script>
  import { reveal } from '../lib/reveal.js';
  import Icon from '../components/Icon.svelte';
  import AdminHeader from '../components/AdminHeader.svelte';
  import { app, reloadEvents, setCurrentEvent, refreshEventData } from '../lib/state.svelte.js';
  import { pos } from '../lib/pos.svelte.js';
  import { record } from '../lib/journal.js';
  import { uuid } from '../lib/ids.js';
  import { q } from '../lib/db/index.js';
  import { eur } from '../lib/money.js';
  import { eventUsage, deleteEvent } from '../lib/deletion.js';
  import { resetEventSales } from '../lib/salesOps.js';

  let newName = $state('');
  let newErr = $state('');
  let confirmClose = $state(null);
  let note = $state(null); // { id, text }
  let stats = $state({});
  let confirmDelete = $state(null); // { id, text }
  let confirmReset = $state(null); // id dell'evento di cui azzerare le vendite

  const open = $derived((app.events.filter((e) => e.is_open)).slice().sort((a, b) => (b.id === app.currentEventId) - (a.id === app.currentEventId)));
  const closed = $derived(app.events.filter((e) => !e.is_open));

  async function loadStats() {
    const rows = await q(
      `SELECT event_id,
         SUM(CASE WHEN method <> 'gift' THEN 1 ELSE 0 END) AS sales,
         SUM(CASE WHEN method = 'gift' THEN 1 ELSE 0 END) AS gifts,
         COALESCE(SUM(total_cents), 0) AS total
       FROM sales WHERE voided = 0 GROUP BY event_id`
    );
    stats = Object.fromEntries(rows.map((r) => [r.event_id, { sales: Number(r.sales), gifts: Number(r.gifts), total: Number(r.total) }]));
  }
  $effect(() => {
    app.events;
    loadStats();
  });

  async function save(e, is_open) {
    await record('event.upsert', { id: e.id, name: e.name, is_open: is_open ? 1 : 0 });
    await reloadEvents();
    await refreshEventData();
  }

  async function create() {
    const n = newName.trim();
    if (!n) { newErr = "Scrivi il nome dell'evento."; return; }
    if (app.events.some((e) => e.name.toLowerCase() === n.toLowerCase())) { newErr = 'Esiste già un evento con questo nome. Se è chiuso, puoi riaprirlo.'; return; }
    const id = uuid();
    await record('event.upsert', { id, name: n, is_open: 1 });
    await reloadEvents();
    if (!app.currentEventId || !app.events.some((e) => e.id === app.currentEventId && e.is_open)) await setCurrentEvent(id);
    newName = '';
  }

  function askClose(e) {
    note = null;
    if (e.id === app.currentEventId && pos.lines.length) {
      note = { id: e.id, text: "In cassa c'è una vendita in corso su questo evento. Completala o annullala prima di chiuderlo." };
      return;
    }
    confirmClose = e.id;
  }
  async function doClose(e) {
    confirmClose = null;
    await save(e, false);
    if (app.currentEventId === e.id) await setCurrentEvent(null);
  }
  async function askDelete(e) {
    const u = await eventUsage(e.id);
    const parts = [];
    if (u.sales) parts.push(u.sales === 1 ? '1 vendita' : `${u.sales} vendite`);
    if (u.moves) parts.push('la dotazione');
    if (u.transfers) parts.push(u.transfers === 1 ? '1 DDT' : `${u.transfers} DDT`);
    confirmDelete = {
      id: e.id,
      text: parts.length
        ? `Eliminare "${e.name}"? Verranno cancellati definitivamente anche ${parts.join(', ')}, e spariranno dalle statistiche.`
        : `Eliminare "${e.name}"? L'operazione non si può annullare.`
    };
  }
  async function doDelete(e) {
    confirmDelete = null;
    await deleteEvent(e.id);
    await reloadEvents();
    await refreshEventData();
  }
  const statLine = (e) => stats[e.id] || { sales: 0, gifts: 0, total: 0 };
</script>

<div class="admin">
  <AdminHeader />
  <div class="abody">
    <div class="ev-page">
      <section class="panel ev-new">
        <div>
          <h3>Nuovo evento</h3>
          <p class="hint">Una fiera o un'occasione di vendita: vendite, dotazione e DDT si registrano sull'evento scelto in cassa.</p>
        </div>
        <div class="newev">
          <input id="newName" class="field" class:bad={newErr} placeholder="Lucca Comics & Games 2026" bind:value={newName} oninput={() => (newErr = '')} onkeydown={(e) => e.key === 'Enter' && create()} />
          <button type="button" class="solid" onclick={create}><Icon name="add" /><span>Crea evento</span></button>
        </div>
        {#if newErr}<p class="kerr">{newErr}</p>{/if}
      </section>

      <div class="ev-grid">
        <section class="cs-stack">
          <header class="ev-colhead"><h3>Aperti</h3><span class="hint">Compaiono in cassa e possono registrare vendite</span></header>
          {#each open as e (e.id)}
            {@const s = statLine(e)}
            <article class="panel evcard" class:current={e.id === app.currentEventId}>
              <div class="evcard-top">
                <h4>{e.name}</h4>
                {#if e.id === app.currentEventId}<span class="tag" style="margin:0">In cassa</span>{/if}
              </div>
              <div class="evkpis num">
                <div><span>Vendite</span><strong>{s.sales}</strong></div>
                <div><span>Omaggi</span><strong>{s.gifts}</strong></div>
                <div><span>Incasso</span><strong>{eur(s.total)}</strong></div>
              </div>
              <div class="evcard-acts">
                {#if e.id !== app.currentEventId}<button type="button" class="solid sm" onclick={() => setCurrentEvent(e.id)}><Icon name="point_of_sale" /><span>Usa in cassa</span></button>{/if}
                {#if s.sales || s.gifts}<button type="button" class="outline sm danger-t" onclick={() => { confirmClose = null; note = null; confirmReset = e.id; }}><Icon name="restart_alt" /><span>Azzera vendite</span></button>{/if}
                <button type="button" class="outline sm danger-t" onclick={() => { confirmReset = null; askClose(e); }}><Icon name="lock" /><span>Chiudi</span></button>
              </div>
              {#if confirmReset === e.id}
                <div class="confirmbox" use:reveal>
                  <p>Azzerare le vendite di "{e.name}"? Verranno cancellate definitivamente {s.sales === 1 ? '1 vendita' : s.sales + ' vendite'}{s.gifts ? ` e ${s.gifts === 1 ? '1 omaggio' : s.gifts + ' omaggi'}` : ''} ({eur(s.total)}), su tutte le casse. Evento, dotazione e DDT restano. Serve per esempio a togliere le vendite di prova prima della fiera.</p>
                  <button type="button" onclick={() => (confirmReset = null)}>Annulla</button>
                  <button type="button" class="go" onclick={async () => { confirmReset = null; await resetEventSales(e.id); await loadStats(); }}>Azzera vendite</button>
                </div>
              {/if}
              {#if note && note.id === e.id}
                <div class="confirmbox info" use:reveal><p>{note.text}</p><button type="button" onclick={() => (note = null)}>Ho capito</button></div>
              {:else if confirmClose === e.id}
                <div class="confirmbox" use:reveal>
                  <p>Chiudere l'evento? Non potrai più registrare vendite finché non lo riapri. Resterà nelle statistiche.</p>
                  <button type="button" onclick={() => (confirmClose = null)}>Annulla</button>
                  <button type="button" class="go" onclick={() => doClose(e)}>Chiudi evento</button>
                </div>
              {/if}
            </article>
          {:else}
            <div class="panel cs-empty" style="margin:0"><Icon name="event_available" size={40} /><p><strong>Nessun evento aperto</strong><br />Creane uno qui sopra per iniziare a vendere.</p></div>
          {/each}
        </section>

        <section class="cs-stack">
          <header class="ev-colhead"><h3>Chiusi</h3><span class="hint">Solo per le statistiche. Per eliminare un evento, chiudilo prima.</span></header>
          {#each closed as e (e.id)}
            {@const s = statLine(e)}
            <article class="panel evcard closed">
              <div class="evcard-top"><h4>{e.name}</h4></div>
              <p class="evline num">{s.sales} {s.sales === 1 ? 'vendita' : 'vendite'}, {s.gifts} {s.gifts === 1 ? 'omaggio' : 'omaggi'}, {eur(s.total)}</p>
              <div class="evcard-acts">
                <button type="button" class="outline sm" onclick={() => save(e, true)}><Icon name="lock_open" /><span>Riapri</span></button>
                <button type="button" class="outline sm danger-t" onclick={() => askDelete(e)}><Icon name="delete" /><span>Elimina</span></button>
              </div>
              {#if confirmDelete?.id === e.id}
                <div class="confirmbox" use:reveal>
                  <p>{confirmDelete.text}</p>
                  <button type="button" onclick={() => (confirmDelete = null)}>Annulla</button>
                  <button type="button" class="go" onclick={() => doDelete(e)}>Elimina evento</button>
                </div>
              {/if}
            </article>
          {:else}
            <div class="panel cs-empty" style="margin:0"><Icon name="inventory_2" size={40} /><p>Gli eventi chiusi compaiono qui, con le loro statistiche.</p></div>
          {/each}
        </section>
      </div>
    </div>
  </div>
</div>
