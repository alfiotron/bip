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

  let newName = $state('');
  let newErr = $state('');
  let confirmClose = $state(null);
  let note = $state(null); // { id, text }
  let stats = $state({});
  let confirmDelete = $state(null); // { id, text }

  const open = $derived(app.events.filter((e) => e.is_open));
  const closed = $derived(app.events.filter((e) => !e.is_open));

  async function loadStats() {
    const rows = await q(
      `SELECT event_id,
         SUM(CASE WHEN method <> 'gift' THEN 1 ELSE 0 END) AS sales,
         SUM(CASE WHEN method = 'gift' THEN 1 ELSE 0 END) AS gifts,
         COALESCE(SUM(total_cents), 0) AS total
       FROM sales GROUP BY event_id`
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
    <div class="narrow">
      <label class="kl" for="newName">Nuovo evento</label>
      <div class="newev">
        <input id="newName" class="field" class:bad={newErr} placeholder="Lucca Comics & Games 2026" bind:value={newName} oninput={() => (newErr = '')} onkeydown={(e) => e.key === 'Enter' && create()} />
        <button type="button" class="solid" onclick={create}><Icon name="add" /><span>Crea evento</span></button>
      </div>
      {#if newErr}<p class="kerr">{newErr}</p>{/if}

      <p class="sect">Aperti<small>Compaiono in cassa e possono registrare vendite</small></p>
      {#each open as e (e.id)}
        {@const s = statLine(e)}
        <div class="erow">
          <div style="min-width:0">
            <span class="evname">{e.name}{#if e.id === app.currentEventId}<span class="tag">In cassa</span>{/if}</span>
            <span class="evstats num"><span>{s.sales} {s.sales === 1 ? 'vendita' : 'vendite'}</span><span>{s.gifts} {s.gifts === 1 ? 'omaggio' : 'omaggi'}</span><span>{eur(s.total)}</span></span>
          </div>
          <div class="eacts">
            {#if e.id !== app.currentEventId}<button type="button" onclick={() => setCurrentEvent(e.id)}>Usa in cassa</button>{/if}
            <button type="button" class="danger" onclick={() => askClose(e)}>Chiudi</button>
          </div>
          {#if note && note.id === e.id}
            <div class="confirmbox info" use:reveal><p>{note.text}</p><button type="button" onclick={() => (note = null)}>Ho capito</button></div>
          {:else if confirmClose === e.id}
            <div class="confirmbox" use:reveal>
              <p>Chiudere l'evento? Non potrai più registrare vendite finché non lo riapri. Resterà nelle statistiche.</p>
              <button type="button" onclick={() => (confirmClose = null)}>Annulla</button>
              <button type="button" class="go" onclick={() => doClose(e)}>Chiudi evento</button>
            </div>
          {/if}
        </div>
      {:else}
        <p class="evhint" style="margin:8px 4px">Nessun evento aperto.</p>
      {/each}

      {#if closed.length}
        <p class="sect">Chiusi<small>Solo per le statistiche. Per eliminare un evento, chiudilo prima.</small></p>
        {#each closed as e (e.id)}
          {@const s = statLine(e)}
          <div class="erow">
            <div style="min-width:0">
              <span class="evname">{e.name}</span>
              <span class="evstats num"><span>{s.sales} {s.sales === 1 ? 'vendita' : 'vendite'}</span><span>{s.gifts} {s.gifts === 1 ? 'omaggio' : 'omaggi'}</span><span>{eur(s.total)}</span></span>
            </div>
            <div class="eacts">
              <button type="button" onclick={() => save(e, true)}>Riapri</button>
              <button type="button" class="danger" onclick={() => askDelete(e)}>Elimina</button>
            </div>
            {#if confirmDelete?.id === e.id}
              <div class="confirmbox" use:reveal>
                <p>{confirmDelete.text}</p>
                <button type="button" onclick={() => (confirmDelete = null)}>Annulla</button>
                <button type="button" class="go" onclick={() => doDelete(e)}>Elimina evento</button>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>
