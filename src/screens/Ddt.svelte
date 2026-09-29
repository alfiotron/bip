<script>
  import { reveal } from '../lib/reveal.js';
  import Icon from '../components/Icon.svelte';
  import Cover from '../components/Cover.svelte';
  import AdminHeader from '../components/AdminHeader.svelte';
  import DdtEditor from './ddt/DdtEditor.svelte';
  import DdtPrint from './ddt/DdtPrint.svelte';
  import FicDdtImport from './fic/FicDdtImport.svelte';
  import { app, currentEvent, productById, refreshEventData } from '../lib/state.svelte.js';
  import { dd, newEditor } from '../lib/ddt.svelte.js';
  import { loadTransfers, createReturn, deleteTransfer, deleteReturn, REASONS } from '../lib/transfers.js';
  import { codeLabel } from '../lib/codes.js';

  let transfers = $state([]);
  let note = $state('');
  let ret = $state({ destination: 'fair', qty: {}, err: '' });
  let askDelete = $state(null); // id del DDT di cui si chiede conferma dell'eliminazione
  let askReturn = $state(null); // id del rientro da annullare

  $effect(() => {
    app.version;
    loadTransfers().then((t) => (transfers = t));
  });

  const list = $derived(
    transfers.filter((t) =>
      dd.filter === 'in' ? t.direction === 'in' : dd.filter === 'out' ? t.direction === 'out' : dd.filter === 'open' ? t.atClient > 0 : true
    )
  );
  const sel = $derived(transfers.find((t) => t.id === dd.selected) || null);
  const eventOpen = (t) => app.events.some((e) => e.id === t.event_id && e.is_open);
  const date = (iso) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  const tillName = (id) => (id === app.till.id ? app.till.name : 'Cassa ' + id);

  function create() {
    if (!currentEvent()) {
      note = 'Per registrare un DDT scegli in cassa un evento aperto: la merce entra o esce dalla sua dotazione.';
      return;
    }
    note = '';
    newEditor('in');
  }
  function open(t) {
    dd.selected = t.id;
    dd.returning = false;
    dd.notice = '';
    if (matchMedia('(max-width:900px)').matches) scrollTo(0, 0);
  }
  function lineLeft(t, pid) {
    const out = t.lines.filter((l) => l.product_id === pid).reduce((s, l) => s + l.qty, 0);
    const back = t.returns.reduce((s, r) => s + r.lines.filter((l) => l.product_id === pid).reduce((x, l) => x + l.qty, 0), 0);
    return out - back;
  }
  function startReturn() {
    ret = { destination: eventOpen(sel) ? 'fair' : 'hq', qty: {}, err: '' };
    dd.returning = true;
  }
  function retStep(pid, d, max) {
    ret.qty[pid] = Math.min(max, Math.max(0, (ret.qty[pid] || 0) + d));
    ret.err = '';
  }
  function deleteText(t) {
    if (t.direction === 'in') return `Eliminare il rifornimento ${t.number}? ${t.pieces === 1 ? '1 pezzo verrà tolto' : t.pieces + ' pezzi verranno tolti'} dalla dotazione di ${t.event_name}.`;
    const back = t.returns.filter((r) => r.destination === 'fair').reduce((s, r) => s + r.lines.reduce((x, l) => x + l.qty, 0), 0);
    const net = t.pieces - back;
    return `Eliminare il DDT ${t.number}? ` + (net > 0 ? `${net === 1 ? '1 pezzo tornerà' : net + ' pezzi torneranno'} nella dotazione di ${t.event_name}` : 'La dotazione non cambia') +
      (t.returns.length ? ', e verranno annullati anche i rientri registrati.' : '.');
  }
  async function doDelete(t) {
    askDelete = null;
    await deleteTransfer(t.id);
    await refreshEventData();
    dd.selected = null;
    note = `DDT ${t.number} eliminato.`;
  }
  async function doDeleteReturn(r) {
    askReturn = null;
    await deleteReturn(r.id);
    await refreshEventData();
    dd.notice = 'Rientro annullato.';
  }
  async function confirmReturn() {
    const lines = Object.entries(ret.qty).map(([product_id, qty]) => ({ product_id, qty })).filter((l) => l.qty > 0);
    if (!lines.length) { ret.err = 'Indica almeno un pezzo che rientra.'; return; }
    await createReturn(sel.id, ret.destination, lines);
    await refreshEventData();
    dd.returning = false;
    dd.notice = `Rientro registrato: ${lines.reduce((s, l) => s + l.qty, 0)} pezzi ${ret.destination === 'fair' ? 'in fiera' : 'in sede'}.`;
  }
</script>

{#snippet deleteBlock(t)}
  {#if askDelete === t.id}
    <div class="confirmbox" style="margin-top:14px" use:reveal>
      <p>{deleteText(t)} L'operazione vale su tutte le casse.</p>
      <button type="button" onclick={() => (askDelete = null)}>Annulla</button>
      <button type="button" class="go" onclick={() => doDelete(t)}>Elimina DDT</button>
    </div>
  {:else}
    <button type="button" class="linkb danger" style="margin-top:14px" onclick={() => { askDelete = t.id; askReturn = null; }}><Icon name="delete" size={18} />Elimina DDT</button>
  {/if}
{/snippet}

{#if dd.importing && currentEvent()}
  <div class="admin">
    <AdminHeader />
    <FicDdtImport event={currentEvent()} backLabel="DDT" onclose={() => (dd.importing = false)} ondone={(m) => { dd.importing = false; dd.filter = 'in'; note = m; }} />
  </div>
{:else if dd.editor && currentEvent()}
  <div class="admin">
    <AdminHeader />
    <DdtEditor onsaved={(id, m) => { dd.editor = null; dd.selected = id; dd.notice = m; }} />
  </div>
{:else if dd.printing && transfers.find((t) => t.id === dd.printing)}
  <div class="admin">
    <AdminHeader />
    <DdtPrint t={transfers.find((t) => t.id === dd.printing)} onclose={() => (dd.printing = null)} />
  </div>
{:else}
  <div class="admin">
    <AdminHeader>
      {#snippet actions()}
        <button type="button" class="solid sm" onclick={create}><Icon name="add" /><span>Nuovo DDT</span></button>
      {/snippet}
    </AdminHeader>
    <div class="split" class:has-sel={sel}>
      <div class="l">
        {#if note}<div class="confirmbox info" style="margin-bottom:12px"><p>{note}</p><button type="button" onclick={() => (note = '')}>Ok</button></div>{/if}
        <div class="stoolbar">
          <div class="seg seg4" role="group" aria-label="Filtro">
            {#each [['all', 'Tutti'], ['in', 'Rifornimenti'], ['out', 'Consegne'], ['open', 'Presso clienti']] as [k, l] (k)}
              <button type="button" style="padding:0 14px;white-space:nowrap" class:on={dd.filter === k} onclick={() => (dd.filter = k)}>{l}</button>
            {/each}
          </div>
        </div>
        {#if list.length}
          <div class="dgrid phrow"><span>Documento</span><span>Provenienza o destinatario</span><span class="dhide">Tipo</span><span class="r-al dhide">Pezzi</span><span class="r-al">Presso cliente</span><span></span></div>
          {#each list as t (t.id)}
            {@const inn = t.direction === 'in'}
            <button type="button" class="dgrid prow" class:sel={dd.selected === t.id} onclick={() => open(t)}>
              <span class="ddtn num">DDT {t.number}<small>{date(t.at)}</small></span>
              <span class="ddest" style="min-width:0"><span class="rt">{inn ? t.source : t.client_name}</span><span class="ra">{inn ? 'Verso ' : 'Da '}{t.event_name}</span></span>
              <span class="dhide"><span class="tag {inn ? '' : 'off'}" style="margin-left:0">{inn ? 'Rifornimento' : REASONS[t.reason]}</span></span>
              <span class="r-al num dhide {inn ? 'up' : ''}" style={inn ? '' : 'color:var(--ink-2)'}>{inn ? '+' : '−'}{t.pieces}</span>
              <span class="pstock num">{inn || t.reason === 'sale' ? '—' : t.atClient}</span>
              <Icon name="chevron_right" />
            </button>
          {/each}
        {:else}
          <p class="hint" style="padding:16px 4px">{transfers.length ? 'Nessun DDT in questo elenco.' : 'Non ci sono ancora DDT. Con "Nuovo DDT" registri un rifornimento in arrivo o merce consegnata a un negozio.'}</p>
        {/if}
      </div>

      <div class="r">
        {#if sel}
          <button type="button" class="back mback" onclick={() => { dd.selected = null; dd.returning = false; }}><Icon name="arrow_back" /><span>Tutti i DDT</span></button>
          {#if sel.direction === 'in'}
            <h2 class="fh num">Rifornimento DDT {sel.number}</h2>
            <p class="hint">{date(sel.at)}, merce arrivata a {sel.event_name}</p>
            <div style="margin-top:14px">
              <div class="kvrow"><span>Provenienza</span><span>{sel.source}</span></div>
              {#if sel.reference}<div class="kvrow"><span>Riferimento</span><span>{sel.reference}</span></div>{/if}
              <div class="kvrow"><span>Registrato da</span><span>{tillName(sel.origin)}</span></div>
              {#if sel.note}<div class="kvrow"><span>Note</span><span>{sel.note}</span></div>{/if}
            </div>
            <p class="sect">Pezzi aggiunti alla dotazione</p>
            {#each sel.lines as l (l.id)}
              {@const p = productById(l.product_id)}
              <div class="kvrow"><span>{p?.name || 'Prodotto eliminato'}<small>{codeLabel(p?.code)}</small></span><span class="num up">+{l.qty}</span></div>
            {/each}
            {#if dd.notice}<p class="okmsg">{dd.notice}</p>{/if}
            {@render deleteBlock(sel)}
          {:else if dd.returning}
            <h2 class="fh">Rientro dal DDT {sel.number}</h2>
            <p class="hint">{sel.client_name}</p>
            <p class="sect">Pezzi che rientrano</p>
            {#each [...new Set(sel.lines.map((l) => l.product_id))] as pid (pid)}
              {@const p = productById(pid)}
              {@const max = lineLeft(sel, pid)}
              {#if max > 0}
                <div class="lgrid">
                  <Cover item={p} />
                  <div style="min-width:0"><span class="rt" style="font-size:15px">{p?.name}</span><span class="ra">Presso il cliente: {max}</span></div>
                  <div class="stepper">
                    <button type="button" aria-label="Togli" onclick={() => retStep(pid, -1, max)}><Icon name="remove" /></button>
                    <span class="num">{ret.qty[pid] || 0}</span>
                    <button type="button" aria-label="Aggiungi" onclick={() => retStep(pid, 1, max)}><Icon name="add" /></button>
                  </div>
                  <button type="button" class="icon-btn" aria-label="Rientrano tutti" onclick={() => (ret.qty[pid] = max)}><Icon name="done_all" /></button>
                </div>
              {/if}
            {/each}
            <span class="flabel">Dove rientrano</span>
            <div class="chips">
              {#if eventOpen(sel)}<button type="button" class:on={ret.destination === 'fair'} onclick={() => (ret.destination = 'fair')}>In fiera</button>{/if}
              <button type="button" class:on={ret.destination === 'hq'} onclick={() => (ret.destination = 'hq')}>Direttamente in sede</button>
            </div>
            <p class="hint">{ret.destination === 'fair' ? `Tornano disponibili in cassa a ${sel.event_name}.` : 'Non rientrano nella dotazione: la cassa non li conteggia più.'}</p>
            {#if ret.err}<p class="kerr" use:reveal>{ret.err}</p>{/if}
            <div class="factions">
              <button type="button" class="outline" onclick={() => (dd.returning = false)}>Annulla</button>
              <button type="button" class="solid" onclick={confirmReturn}><Icon name="check" /><span>Conferma rientro</span></button>
            </div>
          {:else}
            <h2 class="fh num">DDT {sel.number}</h2>
            <p class="hint">{date(sel.at)}, merce da {sel.event_name}</p>
            <div style="margin-top:14px">
              <div class="kvrow"><span>{sel.client_name}<small>{[sel.client_address, sel.client_vat && 'P.IVA ' + sel.client_vat].filter(Boolean).join(', ')}</small></span><span></span></div>
              <div class="kvrow"><span>Causale</span><span>{REASONS[sel.reason]}</span></div>
              <div class="kvrow"><span>Emesso da</span><span>{tillName(sel.origin)}</span></div>
              {#if sel.note}<div class="kvrow"><span>Note</span><span>{sel.note}</span></div>{/if}
            </div>
            <p class="sect">{sel.reason === 'sale' ? 'Prodotti venduti' : 'Prodotti, con i pezzi ancora presso il cliente'}</p>
            {#each [...new Set(sel.lines.map((l) => l.product_id))] as pid (pid)}
              {@const p = productById(pid)}
              {@const out = sel.lines.filter((l) => l.product_id === pid).reduce((s, l) => s + l.qty, 0)}
              <div class="kvrow"><span>{p?.name}<small>{out} usciti{out - lineLeft(sel, pid) ? `, ${out - lineLeft(sel, pid)} rientrati` : ''}</small></span><span class="num">{sel.reason === 'sale' ? out : lineLeft(sel, pid)}</span></div>
            {/each}
            {#if sel.returns.length}
              <p class="sect">Rientri</p>
              {#each sel.returns as r (r.id)}
                <div class="kvrow">
                  <span>Rientro {r.destination === 'fair' ? 'in fiera' : 'in sede'}<small>{date(r.at)}, {tillName(r.origin)}</small></span>
                  <span class="retacts"><span class="num up">+{r.lines.reduce((s, l) => s + l.qty, 0)}</span>
                    <button type="button" class="linkb" onclick={() => (askReturn = r.id)}>Annulla</button></span>
                </div>
                {#if askReturn === r.id}
                  <div class="confirmbox" use:reveal>
                    <p>Annullare questo rientro? I pezzi risulteranno di nuovo presso {sel.client_name}{r.destination === 'fair' ? ` e verranno tolti dalla dotazione di ${sel.event_name}` : ''}.</p>
                    <button type="button" onclick={() => (askReturn = null)}>No</button>
                    <button type="button" class="go" onclick={() => doDeleteReturn(r)}>Annulla rientro</button>
                  </div>
                {/if}
              {/each}
            {/if}
            {#if dd.notice}<p class="okmsg">{dd.notice}</p>{/if}
            <div class="factions">
              <button type="button" class="outline" onclick={() => (dd.printing = sel.id)}><Icon name="description" /><span>Riepilogo</span></button>
              {#if sel.atClient > 0}
                <button type="button" class="solid" onclick={startReturn}><Icon name="undo" /><span>Registra rientro</span></button>
              {:else}
                <p class="hint" style="align-self:center;margin:0">{sel.reason === 'sale' ? 'Merce venduta al cliente.' : 'Tutta la merce è rientrata.'}</p>
              {/if}
            </div>
            {@render deleteBlock(sel)}
          {/if}
        {:else}
          <div class="empty">
            <Icon name="local_shipping" />
            <h2>Nessun DDT aperto</h2>
            <p>Tocca un DDT per vederne il dettaglio. Con "Nuovo DDT" registri un rifornimento in arrivo o merce consegnata a un negozio.</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
