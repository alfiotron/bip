<script>
  import Icon from '../../components/Icon.svelte';
  import ImportList from '../../components/ImportList.svelte';
  import { readTable } from '../../lib/sheet.js';
  import { FIELDS, headerRowIndex, guessMapping, parseRows, saveTemplate } from '../../lib/excelImport.js';
  import { reveal } from '../../lib/reveal.js';

  let { onclose, ondone } = $props();

  let fileName = $state('');
  let rows = $state([]);
  let headerIdx = $state(0);
  let map = $state({});
  let defaultVat = $state(0);
  let fileErr = $state('');
  let input;

  const header = $derived(rows[headerIdx] || []);
  const columns = $derived(header.map((h, i) => ({ i, label: String(h).trim() || `Colonna ${i + 1}` })));
  const parsed = $derived(rows.length && map.name !== undefined && map.price !== undefined ? parseRows(rows, headerIdx, map, defaultVat) : { items: [], errors: [] });

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
      {#key fileName + JSON.stringify(map) + defaultVat}
        <ImportList source={parsed.items} errors={parsed.errors} {ondone} />
      {/key}
    {/if}
  {/if}
</div>
