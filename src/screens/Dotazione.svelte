<script>
  import TouchSelect from '../components/TouchSelect.svelte';
  import Icon from '../components/Icon.svelte';
  import Cover from '../components/Cover.svelte';
  import AdminHeader from '../components/AdminHeader.svelte';
  import FicDdtImport from './fic/FicDdtImport.svelte';
  import DotazioneDetail from './dotazione/DotazioneDetail.svelte';
  import { app, currentEvent, productById } from '../lib/state.svelte.js';
  import { dz } from '../lib/dotazione.svelte.js';
  import { eventSummary, fairLevel } from '../lib/stock.js';
  import { codeLabel } from '../lib/codes.js';
  import { newProduct } from '../lib/products.svelte.js';

  let summary = $state({});

  const events = $derived([...app.events].sort((a, b) => b.is_open - a.is_open));
  $effect(() => {
    if (!dz.eventId || !app.events.some((e) => e.id === dz.eventId)) dz.eventId = currentEvent()?.id || events[0]?.id || null;
  });
  const ev = $derived(app.events.find((e) => e.id === dz.eventId) || null);

  $effect(() => {
    app.version;
    const id = dz.eventId;
    if (id) eventSummary(id).then((s) => (summary = s));
  });

  const s0 = { loaded: 0, counted: 0, sold: 0, gifts: 0, ddtOut: 0, ddtBack: 0, left: 0 };
  const sOf = (pid) => summary[pid] || s0;
  const list = $derived.by(() => {
    const t = dz.query.trim().toLowerCase();
    return app.products.filter((p) => {
      const s = sOf(p.id);
      if (!p.active && !s.loaded) return false;
      if (dz.brand === 'none' ? p.brand_id : dz.brand && p.brand_id !== dz.brand) return false;
      if (t && !`${p.name} ${p.description} ${p.code}`.toLowerCase().includes(t)) return false;
      if (dz.filter === 'low') return s.loaded && fairLevel(p, s.left) === 'warn';
      if (dz.filter === 'out') return s.loaded && fairLevel(p, s.left) === 'bad';
      return true;
    });
  });
  const count = (lvl) => app.products.filter((p) => sOf(p.id).loaded && fairLevel(p, sOf(p.id).left) === lvl).length;
  const sel = $derived(dz.selected ? productById(dz.selected) : null);

  function select(p) {
    dz.selected = p.id;
    dz.missing = '';
    if (matchMedia('(max-width:900px)').matches) scrollTo(0, 0);
  }
  const tag = (p, s) => (!s.loaded ? ['off', 'Non portato'] : s.left <= 0 ? ['bad', 'Finito'] : s.left <= p.alert_below ? ['warn', 'In esaurimento'] : null);
</script>

{#if dz.importing && ev}
  <div class="admin">
    <AdminHeader />
    <FicDdtImport event={ev} onclose={() => (dz.importing = false)} ondone={(m) => { dz.importing = false; dz.notice = m; }} />
  </div>
{:else}
  <div class="admin">
    <AdminHeader>
      {#snippet actions()}
        {#if events.length}
          <TouchSelect bind:value={dz.eventId} label="Evento" onchange={() => (dz.selected = null)}
              options={events.map((e) => ({ value: e.id, label: e.name, group: e.is_open ? 'Aperti' : 'Chiusi' }))} />
          {#if ev && ev.is_open}
            <button type="button" class="outline sm" onclick={() => (dz.importing = true)}><Icon name="cloud_download" /><span>Importa<span class="long">{" "}dai DDT</span></span></button>
          {/if}
        {/if}
      {/snippet}
    </AdminHeader>

    {#if !ev}
      <div class="abody"><div class="empty" style="min-height:320px"><Icon name="event_busy" /><h2>Nessun evento</h2><p>Crea un evento dalla scheda Eventi per preparare la dotazione.</p>
        <button type="button" class="outline" onclick={() => (app.screen = 'eventi')}>Vai agli eventi</button></div></div>
    {:else}
      <div class="split" class:has-sel={sel}>
        <div class="l">
          {#if dz.notice}<div class="confirmbox info" style="margin-bottom:12px;background:var(--ok-bg);color:var(--ok)"><p>{dz.notice}</p><button type="button" onclick={() => (dz.notice = '')}>Ok</button></div>{/if}
          {#if dz.missing}
            <div class="confirmbox info" style="margin-bottom:12px"><p>Il codice {dz.missing} non è in catalogo.</p>
              <button type="button" onclick={() => (dz.missing = '')}>Ignora</button>
              <button type="button" class="outline" style="height:44px" onclick={() => { const c = dz.missing; dz.missing = ''; app.screen = 'prodotti'; newProduct(c); }}>Crea prodotto</button></div>
          {/if}
          <div class="stoolbar">
            <div class="seg three" role="group" aria-label="Filtro" style="width:420px;max-width:100%">
              <button type="button" class:on={dz.filter === 'all'} onclick={() => (dz.filter = 'all')}>Tutti</button>
              <button type="button" class:on={dz.filter === 'low'} onclick={() => (dz.filter = 'low')}>In esaurimento ({count('warn')})</button>
              <button type="button" class:on={dz.filter === 'out'} onclick={() => (dz.filter = 'out')}>Finiti ({count('bad')})</button>
            </div>
            {#if app.brands.length}
              <div class="aright">
                <TouchSelect bind:value={dz.brand} label="Marchio" options={[{ value: '', label: 'Tutti i marchi' }, ...app.brands.map((b) => ({ value: b.id, label: b.name })), { value: 'none', label: 'Senza marchio' }]} />
              </div>
            {/if}
          </div>
          <div class="psearch"><Icon name="search" /><input class="field" placeholder="Cerca per nome, descrizione o codice" bind:value={dz.query} /></div>
          {#if list.length}
            <div class="agrid phrow"><span></span><span>Prodotto</span><span class="r-al">Portati</span><span class="r-al ahide">Usciti</span><span class="r-al ahide">DDT</span><span class="r-al">Rimasti</span><span></span></div>
            {#each list as p (p.id)}
              {@const s = sOf(p.id)}
              {@const t = tag(p, s)}
              <button type="button" class="agrid prow" class:sel={dz.selected === p.id} onclick={() => select(p)}>
                <Cover item={p} />
                <span style="min-width:0"><span class="rt">{p.name}</span><span class="ra num">{codeLabel(p.code)}{#if t}<span class="tag {t[0]}">{t[1]}</span>{/if}</span></span>
                <span class="r-al num">{s.loaded || '—'}</span>
                <span class="r-al num ahide" style="color:var(--ink-2)">{s.sold + s.gifts || '—'}</span>
                <span class="r-al num ahide" style="color:var(--ink-2)">{s.ddtOut - s.ddtBack || '—'}</span>
                <span class="pstock num {s.loaded ? fairLevel(p, s.left) : ''}" style="font-size:18px">{s.loaded ? s.left : '—'}</span>
                <Icon name="chevron_right" />
              </button>
            {/each}
          {:else}
            <p class="hint" style="padding:16px 4px">{app.products.length ? 'Nessun prodotto in questo elenco.' : 'Il catalogo è vuoto: aggiungi i prodotti dalla scheda Prodotti.'}</p>
          {/if}
        </div>

        <div class="r">
          {#if sel}
            <DotazioneDetail product={sel} event={ev} s={sOf(sel.id)} onback={() => (dz.selected = null)} />
          {:else}
            <div class="empty">
              <Icon name="inventory" />
              <h2>{ev.is_open ? 'Prepara la dotazione' : 'Evento chiuso'}</h2>
              <p>{ev.is_open ? `Per ogni prodotto indica quanti pezzi porti a ${ev.name}. Puoi farlo prima della partenza, aggiungere pezzi quando arriva un'altra scatola e registrare un conteggio allo stand. Puoi anche leggere i codici con lo scanner.` : 'La dotazione di un evento chiuso resta consultabile per le statistiche.'}</p>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{/if}
