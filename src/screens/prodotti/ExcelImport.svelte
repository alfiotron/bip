<script>
  import Icon from '../../components/Icon.svelte';
  import Cover from '../../components/Cover.svelte';
  import ImportBrandBar from '../../components/ImportBrandBar.svelte';
  import { app, brandName } from '../../lib/state.svelte.js';
  import { readTable } from '../../lib/sheet.js';
  import { FIELDS, headerRowIndex, guessMapping, parseRows, saveTemplate } from '../../lib/excelImport.js';
  import { matchLocal, statusOf, STATUS_TAGS, importItems, importMessage } from '../../lib/catalogImport.js';
  import { eur } from '../../lib/money.js';
  import { codeLabel } from '../../lib/codes.js';
  import { reveal, revealFirstError } from '../../lib/reveal.js';

  let { onclose, ondone } = $props();

  let fileName = $state('');
  let rows = $state([]);
  let headerIdx = $state(0);
  let map = $state({});
  let defaultVat = $state(0);
  let fileErr = $state('');
  let brand = $state(null);
  let selected = $state(new Set());
  let showErrors = $state(false);
  let busy = $state(false);
  let err = $state('');
  let input;

  const header = $derived(rows[headerIdx] || []);
  const columns = $derived(header.map((h, i) => ({ i, label: String(h).trim() || `Colonna ${i + 1}` })));
  const parsed = $derived(rows.length && map.name !== undefined && map.price !== undefined ? parseRows(rows, headerIdx, map, defaultVat) : { items: [], errors: [] });
  const items = $derived(parsed.items.map((it) => { const local = matchLocal(it, app.products); return { ...it, local, status: statusOf(it, local) }; }));
  const moving = $derived(items.filter((i) => selected.has(i.key) && i.local && brand && i.local.brand_id && i.local.brand_id !== brand).length);
  const count = (s) => items.filter((i) => i.status === s).length;

  // Quando cambiano file o colonne, si selezionano i prodotti nuovi e modificati
  $effect(() => {
    selected = new Set(items.filter((i) => i.status === 'new' || i.status === 'changed').map((i) => i.key));
  });

  async function pick(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    fileErr = '';
    try {
      const r = await readTable(file);
      if (r.length < 2) throw new Error('Il file è vuoto o ha solo l\'intestazione.');
      rows = r;
      headerIdx = headerRowIndex(r);
      map = guessMapping(r[headerIdx]);
      fileName = file.name;
    } catch (x) {
      fileErr = x.message;
      rows = [];
    }
  }
  function setMap(key, v) {
    const m = { ...map };
    if (v === '') delete m[key];
    else m[key] = Number(v);
    map = m;
  }
  function toggle(k) {
    const s = new Set(selected);
    s.has(k) ? s.delete(k) : s.add(k);
    selected = s;
    err = '';
  }
  async function doImport() {
    if (!selected.size) { err = 'Seleziona almeno un prodotto da importare.'; revealFirstError(); return; }
    busy = true;
    const r = await importItems(items.filter((i) => selected.has(i.key)), brand);
    busy = false;
    ondone(importMessage(r, brand ? brandName(brand) : ''));
  }
</script>

<div class="abody">
  <div class="shead"><button type="button" class="back" onclick={onclose}><Icon name="arrow_back" /><span>Prodotti</span></button><h2>Importa da Excel o CSV</h2></div>

  <div class="panel">
    <div class="row-inline" style="justify-content:space-between">
      <div>
        <strong>{fileName || 'Scegli il file da importare'}</strong>
        <p class="hint" style="margin:4px 0 0">File Excel (.xlsx) o CSV, con una riga di intestazione e un prodotto per riga.</p>
      </div>
      <div class="row-inline">
        <button type="button" class="linkb" onclick={saveTemplate}>Scarica un modello</button>
        <input bind:this={input} type="file" accept=".xlsx,.csv,.txt" onchange={pick} hidden />
        <button type="button" class={fileName ? 'outline' : 'solid sm'} onclick={() => input.click()}><Icon name="upload_file" /><span>{fileName ? 'Cambia file' : 'Scegli file'}</span></button>
      </div>
    </div>
    {#if fileErr}<p class="kerr" use:reveal>{fileErr}</p>{/if}
  </div>

  {#if rows.length}
    <div class="panel" style="margin-top:12px">
      <h3>Colonne del file</h3>
      <p class="hint" style="margin:-8px 0 12px">Le ho riconosciute dalle intestazioni: controlla che siano giuste.</p>
      <div class="mapgrid">
        {#each FIELDS as f (f.key)}
          <label class="sellab"><span>{f.label}{f.required ? '' : ' (facoltativo)'}</span>
            <select class="sel" class:bad={f.required && map[f.key] === undefined} value={map[f.key] ?? ''} onchange={(e) => setMap(f.key, e.currentTarget.value)}>
              <option value="">{f.required ? 'Scegli la colonna' : 'Nessuna'}</option>
              {#each columns as c (c.i)}<option value={c.i}>{c.label}</option>{/each}
            </select>
          </label>
        {/each}
      </div>
      <span class="flabel">{map.vat === undefined ? 'Aliquota IVA per tutti i prodotti' : "Aliquota IVA per le righe in cui è vuota"}</span>
      <div class="vchips">
        {#each [0, 4, 5, 10, 22] as v (v)}<button type="button" class:on={defaultVat === v} onclick={() => (defaultVat = v)}>{v ? v + '%' : 'Assolta'}</button>{/each}
      </div>
    </div>

    {#if map.name === undefined || map.price === undefined}
      <p class="kerr" style="margin-top:12px">Scegli almeno le colonne del nome e del prezzo.</p>
    {:else}
      <div style="margin-top:12px"><ImportBrandBar bind:value={brand} {moving} /></div>

      <div class="counts" style="margin-top:16px">
        <span class="tag" style="margin-left:0">{count('new')} {count('new') === 1 ? 'nuovo' : 'nuovi'}</span>
        <span class="tag warn" style="margin-left:0">{count('changed')} {count('changed') === 1 ? 'modificato' : 'modificati'}</span>
        <span class="tag off" style="margin-left:0">{count('same')} già {count('same') === 1 ? 'presente' : 'presenti'}</span>
        {#if parsed.errors.length}
          <button type="button" class="tag bad" style="margin-left:0;border:0;cursor:pointer" onclick={() => (showErrors = !showErrors)}>{parsed.errors.length} {parsed.errors.length === 1 ? 'riga con errori' : 'righe con errori'}</button>
        {/if}
      </div>
      {#if showErrors && parsed.errors.length}
        <div class="panel" style="margin-bottom:12px" use:reveal>
          <h3>Righe non importate</h3>
          {#each parsed.errors as e (e.line)}
            <div class="kvrow"><span>Riga {e.line}{e.name ? `: ${e.name}` : ''}<small>{e.text}</small></span><span></span></div>
          {/each}
          <p class="hint">Correggile nel file e sceglilo di nuovo, oppure importa intanto le righe corrette.</p>
        </div>
      {/if}

      <div style="display:flex;gap:14px;margin-bottom:6px">
        <button type="button" class="linkb" onclick={() => (selected = new Set(items.filter((i) => i.status !== 'same').map((i) => i.key)))}>Seleziona nuovi e modificati</button>
        <button type="button" class="linkb" onclick={() => (selected = new Set(items.map((i) => i.key)))}>Seleziona tutti</button>
        <button type="button" class="linkb" onclick={() => (selected = new Set())}>Deseleziona tutto</button>
      </div>
      {#each items as it (it.key)}
        {@const on = selected.has(it.key)}
        <button type="button" class="fgrid" aria-pressed={on} onclick={() => toggle(it.key)}>
          <span class="ck" class:on><Icon name={on ? 'check_box' : 'check_box_outline_blank'} fill={on} /></span>
          <Cover item={it.local || { id: it.key, name: it.name }} />
          <span style="min-width:0"><span class="rt">{it.name}</span>
            <span class="ra num">{it.code ? codeLabel(it.code) : 'Senza codice'}{it.local && it.local.brand_id && app.brands.length ? ', ora in ' + brandName(it.local.brand_id) : ''}</span></span>
          <span class="fhide"><span class="tag {STATUS_TAGS[it.status][0]}" style="margin-left:0">{STATUS_TAGS[it.status][1]}</span></span>
          <span class="r-al num" style="font-weight:600">{#if it.status === 'changed' && it.local.price_cents !== it.price_cents}<span class="old">{eur(it.local.price_cents)}</span>{/if}{eur(it.price_cents)}</span>
          <span class="r-al fhide" style="color:var(--ink-2);font-size:14px">{it.vat_rate ? it.vat_rate + '%' : 'Assolta'}</span>
        </button>
      {:else}
        <p class="hint">Nessuna riga valida da importare.</p>
      {/each}
      {#if err}<p class="kerr">{err}</p>{/if}
      <div class="ficbar">
        <span class="hint" style="margin:0">{selected.size} {selected.size === 1 ? 'prodotto selezionato' : 'prodotti selezionati'}{brand ? ` nel marchio ${brandName(brand)}` : ''}</span>
        <button type="button" class="solid" disabled={busy} onclick={doImport}><Icon name="download" /><span>Importa</span></button>
      </div>
    {/if}
  {/if}
</div>
