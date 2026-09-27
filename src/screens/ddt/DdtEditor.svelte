<script>
  import { reveal, revealFirstError } from '../../lib/reveal.js';
  import Icon from '../../components/Icon.svelte';
  import Cover from '../../components/Cover.svelte';
  import { app, currentEvent, productById, refreshEventData } from '../../lib/state.svelte.js';
  import { dd, editorAdd } from '../../lib/ddt.svelte.js';
  import { eventSummary } from '../../lib/stock.js';
  import { loadClients, createClient, createTransfer, nextTransferNumber, REASONS } from '../../lib/transfers.js';
  import { codeLabel } from '../../lib/codes.js';

  let { onsaved } = $props();

  const ev = currentEvent();
  let clients = $state([]);
  let summary = $state({});
  let number = $state('');
  let busy = $state(false);
  loadClients().then((c) => (clients = c));
  eventSummary(ev.id).then((s) => (summary = s));
  nextTransferNumber(app.till.id).then((n) => (number = n));

  const f = dd.editor;
  const inn = $derived(f.direction === 'in');
  const inFair = (pid) => Math.max(0, summary[pid]?.left || 0);
  const pick = $derived.by(() => {
    const t = f.query.trim().toLowerCase();
    return app.products.filter((p) => p.active && (!t || `${p.name} ${p.description} ${p.code}`.toLowerCase().includes(t))).slice(0, 60);
  });

  function step(i, d) {
    f.lines[i].qty += d;
    if (f.lines[i].qty < 1) f.lines.splice(i, 1);
  }
  async function saveClient() {
    if (!f.newClient.name.trim()) { f.errors.newClient = 'Scrivi il nome del negozio.'; return; }
    const c = await createClient(f.newClient.name, f.newClient.address);
    clients = await loadClients();
    f.client_id = c.id;
    f.newClient = null;
    f.errors.client = '';
  }
  async function save() {
    const e = {};
    if (inn && !f.source.trim()) e.source = 'Scrivi da dove arriva la merce, per esempio Magazzino centrale.';
    if (!inn && !f.client_id) e.client = 'Scegli a chi consegni o crea un nuovo cliente.';
    if (!f.lines.length) e.lines = inn ? 'Aggiungi almeno un prodotto arrivato.' : 'Aggiungi almeno un prodotto.';
    f.errors = e;
    if (Object.keys(e).length) { revealFirstError(); return; }
    busy = true;
    const t = await createTransfer(app.till.id, {
      direction: f.direction,
      event_id: ev.id,
      client_id: inn ? null : f.client_id,
      reason: inn ? null : f.reason,
      source: inn ? f.source.trim() : '',
      reference: inn ? f.reference.trim() : '',
      note: f.note.trim(),
      lines: f.lines
    });
    await refreshEventData();
    busy = false;
    const pcs = f.lines.reduce((s, l) => s + l.qty, 0);
    onsaved(t.id, inn ? `Rifornimento registrato: ${pcs} pezzi aggiunti alla dotazione.` : `DDT ${t.number} registrato.`);
  }
</script>

<div class="split both">
  <div class="l">
    <div class="shead"><button type="button" class="back" onclick={() => (dd.editor = null)}><Icon name="arrow_back" /><span>DDT</span></button><h2 class="num">Nuovo DDT {number}</h2></div>
    <div class="seg two" role="group" aria-label="Tipo di DDT" style="max-width:520px">
      <button type="button" class:on={inn} onclick={() => { f.direction = 'in'; f.errors = {}; }}>Rifornimento in arrivo</button>
      <button type="button" class:on={!inn} onclick={() => { f.direction = 'out'; f.errors = {}; }}>Consegna a un negozio</button>
    </div>
    <p class="hint">{inn ? `I pezzi si aggiungono alla dotazione di ${ev.name}.` : `La merce esce dalla dotazione di ${ev.name}.`}</p>

    <p class="sect">{inn ? 'Prodotti arrivati' : 'Prodotti consegnati'}</p>
    {#each f.lines as l, i (l.product_id)}
      {@const p = productById(l.product_id)}
      {@const av = inFair(l.product_id)}
      <div class="lgrid">
        <Cover item={p} />
        <div style="min-width:0"><span class="rt" style="font-size:15px">{p?.name}</span>
          <span class="ra num">{codeLabel(p?.code)}{#if !inn && l.qty > av}<span class="stk warn" style="margin-left:10px">Più dei {av} in fiera</span>{/if}</span></div>
        <div class="stepper">
          <button type="button" aria-label="Togli" onclick={() => step(i, -1)}><Icon name="remove" /></button>
          <span class="num">{l.qty}</span>
          <button type="button" aria-label="Aggiungi" onclick={() => step(i, 1)}><Icon name="add" /></button>
        </div>
        <button type="button" class="icon-btn" aria-label="Rimuovi" onclick={() => f.lines.splice(i, 1)}><Icon name="delete" /></button>
      </div>
    {:else}
      <p class="hint">Aggiungili dall'elenco qui sotto o leggendo i codici con lo scanner.</p>
    {/each}
    {#if f.errors.lines}<p class="kerr">{f.errors.lines}</p>{/if}

    <p class="sect">Aggiungi prodotti</p>
    <div class="psearch"><Icon name="search" /><input class="field" placeholder="Cerca per nome, descrizione o codice" bind:value={f.query} /></div>
    {#each pick as p (p.id)}
      <div class="pick">
        <Cover item={p} />
        <div style="min-width:0"><span class="rt" style="font-size:15px">{p.name}</span><span class="ra num">{codeLabel(p.code)}<span class="pav2">, {inFair(p.id)} in fiera</span></span></div>
        <span class="r-al num pav" style="font-size:13px;color:var(--ink-2)">{inFair(p.id)} in fiera</span>
        <button type="button" class="outline" onclick={() => editorAdd(p.id)}><Icon name="add" /><span>Aggiungi</span></button>
      </div>
    {:else}
      <p class="hint">Nessun prodotto trovato.</p>
    {/each}
  </div>

  <div class="r">
    {#if inn}
      <h2 class="fh">Da dove arriva</h2>
      <label class="flabel" for="dsrc">Provenienza</label>
      <input id="dsrc" class="field" class:bad={f.errors.source} placeholder="Magazzino centrale" bind:value={f.source} />
      {#if f.errors.source}<p class="kerr">{f.errors.source}</p>{/if}
      <label class="flabel" for="dref">Riferimento (facoltativo)</label>
      <input id="dref" class="field" placeholder="Numero del DDT o della bolla del corriere" bind:value={f.reference} />
      <label class="flabel" for="dnote">Note (facoltative)</label>
      <input id="dnote" class="field" placeholder="Due scatole, una ancora chiusa" bind:value={f.note} />
      <p class="hint" style="margin-top:14px">Se il DDT è stato emesso con Fatture in Cloud, puoi importarlo invece di inserire i prodotti a mano.</p>
      <button type="button" class="outline" style="width:100%;margin-top:8px" onclick={() => { dd.editor = null; dd.importing = true; }}><Icon name="cloud_download" /><span>Importa da Fatture in Cloud</span></button>
      <div class="factions">
        <button type="button" class="outline" onclick={() => (dd.editor = null)}>Annulla</button>
        <button type="button" class="solid" disabled={busy} onclick={save}><Icon name="check" /><span>Registra rifornimento</span></button>
      </div>
    {:else}
      <h2 class="fh">A chi consegni</h2>
      <div style="margin-top:14px">
        {#each clients as c (c.id)}
          <button type="button" class="cl" class:on={f.client_id === c.id} onclick={() => { f.client_id = c.id; f.errors.client = ''; }}>{c.name}<small>{c.address}</small></button>
        {/each}
        {#if f.newClient}
          <div class="panel" style="margin:4px 0 8px;padding:14px">
            <label class="flabel" style="margin-top:0" for="ncn">Nome del negozio</label>
            <input id="ncn" class="field" class:bad={f.errors.newClient} bind:value={f.newClient.name} />
            {#if f.errors.newClient}<p class="kerr" use:reveal>{f.errors.newClient}</p>{/if}
            <label class="flabel" for="nca">Indirizzo o città (facoltativo)</label>
            <input id="nca" class="field" placeholder="Via Fillungo 112, Lucca" bind:value={f.newClient.address} />
            <div class="factions" style="padding-top:14px">
              <button type="button" class="outline" onclick={() => (f.newClient = null)}>Annulla</button>
              <button type="button" class="solid" onclick={saveClient}>Salva cliente</button>
            </div>
          </div>
        {:else}
          <button type="button" class="outline" style="width:100%;height:48px" onclick={() => (f.newClient = { name: '', address: '' })}><Icon name="person_add" /><span>Nuovo cliente</span></button>
        {/if}
      </div>
      {#if f.errors.client}<p class="kerr">{f.errors.client}</p>{/if}
      <span class="flabel">Causale</span>
      <div class="chips three">
        {#each Object.entries(REASONS) as [k, label] (k)}
          <button type="button" class:on={f.reason === k} onclick={() => (f.reason = k)}>{label}</button>
        {/each}
      </div>
      <p class="hint">{f.reason === 'sale' ? 'La merce esce dalla dotazione e non è previsto un rientro.' : 'La merce resta tua e risulta presso il cliente finché non rientra.'}</p>
      <label class="flabel" for="dnote2">Note (facoltative)</label>
      <input id="dnote2" class="field" placeholder="Ritiro a fine fiera" bind:value={f.note} />
      <div class="factions">
        <button type="button" class="outline" onclick={() => (dd.editor = null)}>Annulla</button>
        <button type="button" class="solid" disabled={busy} onclick={save}><Icon name="check" /><span>Registra DDT</span></button>
      </div>
    {/if}
  </div>
</div>
