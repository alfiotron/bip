<script>
  import BrandPicker from '../../components/BrandPicker.svelte';
  import Icon from '../../components/Icon.svelte';
  import FicNotConnected from './FicNotConnected.svelte';
  import { app, reloadProducts, refreshEventData } from '../../lib/state.svelte.js';
  import { ficConfig } from '../../lib/ficStore.js';
  import { listDeliveryNotes, getDeliveryNote, ficDate } from '../../lib/fic.js';
  import { createTransfer } from '../../lib/transfers.js';
  import { record } from '../../lib/journal.js';
  import { uuid } from '../../lib/ids.js';
  import { q } from '../../lib/db/index.js';
  import { codeLabel } from '../../lib/codes.js';

  // Importa uno o più DDT emessi in Fatture in Cloud come rifornimenti della dotazione.
  let { event, onclose, ondone, backLabel = 'Dotazione' } = $props();

  let cfg = $state(null);
  let loading = $state(true);
  let error = $state('');
  let notes = $state([]);
  let page = $state(1);
  let lastPage = $state(1);
  let query = $state('');
  let selected = $state([]);
  let details = $state({}); // id → righe del DDT
  let imported = $state({}); // 'dn:id' → nome dell'evento in cui è già stato importato
  let createMissing = $state(true);
  let brandId = $state(null);
  let busy = $state(false);

  async function load(more = false) {
    loading = true;
    error = '';
    cfg = cfg || (await ficConfig());
    if (!cfg.token || !cfg.companyId) { loading = false; return; }
    try {
      const r = await listDeliveryNotes(cfg.token, cfg.companyId, more ? page + 1 : 1);
      notes = more ? [...notes, ...r.items] : r.items;
      page = more ? page + 1 : 1;
      lastPage = r.lastPage;
      const rows = await q(`SELECT t.fic_id, e.name FROM transfers t LEFT JOIN events e ON e.id = t.event_id WHERE t.fic_id LIKE 'dn:%'`);
      imported = Object.fromEntries(rows.map((r) => [r.fic_id, r.name || 'un altro evento']));
    } catch (e) {
      error = e.message;
    }
    loading = false;
  }
  load();

  async function toggle(n) {
    error = '';
    if (selected.includes(n.id)) { selected = selected.filter((x) => x !== n.id); return; }
    selected = [...selected, n.id];
    if (!details[n.id]) {
      try {
        details = { ...details, [n.id]: await getDeliveryNote(cfg.token, cfg.companyId, n.id) };
      } catch (e) {
        selected = selected.filter((x) => x !== n.id);
        error = e.message;
      }
    }
  }

  const matchLocal = (it) =>
    (it.fic_product_id && app.products.find((p) => p.fic_id === it.fic_product_id)) || (it.code && app.products.find((p) => p.code === it.code)) || null;

  // Anteprima: pezzi sommati prodotto per prodotto sui DDT selezionati
  const preview = $derived.by(() => {
    const m = new Map();
    for (const id of selected) {
      for (const it of details[id] || []) {
        if (it.qty <= 0) continue;
        const p = matchLocal(it);
        const key = p ? 'p:' + p.id : it.code || it.fic_product_id ? 'n:' + (it.code || it.fic_product_id) : 'u:' + it.name;
        const o = m.get(key) || { name: p ? p.name : it.name, code: p ? p.code : it.code, qty: 0, kind: p ? 'ok' : key.startsWith('n:') ? 'new' : 'unknown' };
        o.qty += it.qty;
        m.set(key, o);
      }
    }
    return [...m.values()];
  });
  const missing = $derived(preview.filter((x) => x.kind === 'new').length);
  const unknown = $derived(preview.filter((x) => x.kind === 'unknown'));
  const total = $derived(preview.filter((x) => x.kind === 'ok' || (x.kind === 'new' && createMissing)).reduce((s, x) => s + x.qty, 0));
  const shown = $derived.by(() => {
    const t = query.trim().toLowerCase();
    return notes.filter((n) => !t || `${n.number} ${n.to} ${ficDate(n.date)}`.toLowerCase().includes(t));
  });

  async function doImport() {
    if (!selected.length) { error = 'Seleziona almeno un DDT.'; return; }
    const dup = selected.filter((id) => imported['dn:' + id]);
    if (dup.length) {
      error = `Il DDT ${dup.map((id) => notes.find((n) => n.id === id)?.number).join(', ')} è già stato importato: toglilo dalla selezione per non contare due volte gli stessi pezzi.`;
      return;
    }
    busy = true;
    const createdBy = new Map();
    let pieces = 0, created = 0, skipped = 0;
    const nums = [];
    for (const id of selected) {
      const n = notes.find((x) => x.id === id);
      const lines = [];
      for (const it of details[id] || []) {
        if (it.qty <= 0) continue;
        let p = matchLocal(it);
        const key = it.code || it.fic_product_id;
        if (!p && key && createMissing) {
          if (!createdBy.has(key)) {
            const pid = uuid();
            await record('product.upsert', { id: pid, code: it.code, name: it.name || 'Prodotto ' + key, description: '', price_cents: it.price_cents, vat_rate: it.vat_rate, active: 1, alert_below: 5, fic_id: it.fic_product_id, brand_id: brandId || null });
            createdBy.set(key, pid);
            created++;
          }
          p = { id: createdBy.get(key) };
        }
        if (!p) { skipped += it.qty; continue; }
        const l = lines.find((x) => x.product_id === p.id);
        if (l) l.qty += it.qty;
        else lines.push({ product_id: p.id, qty: it.qty });
        pieces += it.qty;
      }
      if (!lines.length) continue;
      await createTransfer(app.till.id, {
        direction: 'in', event_id: event.id, source: 'Magazzino centrale', reference: `DDT ${n.number} del ${ficDate(n.date)}, Fatture in Cloud`, fic_id: 'dn:' + id, lines
      });
      nums.push(n.number);
    }
    await reloadProducts();
    await refreshEventData();
    busy = false;
    ondone(
      `Aggiunti ${pieces} pezzi alla dotazione di ${event.name} dai DDT ${nums.join(', ')} di Fatture in Cloud.` +
        (created ? (created === 1 ? ' Creato 1 nuovo prodotto.' : ` Creati ${created} nuovi prodotti.`) : '') +
        (skipped ? (skipped === 1 ? ' Saltato 1 pezzo di una riga non riconosciuta.' : ` Saltati ${skipped} pezzi di righe non riconosciute.`) : '')
    );
  }
</script>

{#if cfg && (!cfg.token || !cfg.companyId)}
  <FicNotConnected {onclose} {backLabel} />
{:else}
  <div class="split both">
    <div class="l">
      <div class="shead"><button type="button" class="back" onclick={onclose}><Icon name="arrow_back" /><span>{backLabel}</span></button><h2>Importa dai DDT di Fatture in Cloud</h2></div>
      <p class="hint" style="margin:-8px 0 14px">Scegli i DDT con cui avete mandato la merce in fiera. Le quantità si sommano alla dotazione come rifornimenti.</p>
      <div class="psearch"><Icon name="search" /><input class="field" placeholder="Cerca per numero, data o destinatario" bind:value={query} /></div>
      {#if loading && !notes.length}
        <p class="hint">Scarico i DDT da Fatture in Cloud…</p>
      {:else}
        {#each shown as n (n.id)}
          {@const on = selected.includes(n.id)}
          <button type="button" class="fdgrid" aria-pressed={on} onclick={() => toggle(n)}>
            <span class="ck" class:on><Icon name={on ? 'check_box' : 'check_box_outline_blank'} fill={on} /></span>
            <span style="min-width:0">
              <span class="rt num">DDT {n.number} del {ficDate(n.date)}</span>
              <span class="ra">{n.to}</span>
              {#if imported['dn:' + n.id]}<span class="tag off" style="margin:6px 0 0">Già importato in {imported['dn:' + n.id]}</span>{/if}
            </span>
            <span class="r-al num" style="color:var(--ink-2)">{details[n.id] ? details[n.id].reduce((s, i) => s + i.qty, 0) + ' pezzi' : ''}</span>
          </button>
        {:else}
          <p class="hint">Nessun DDT trovato.</p>
        {/each}
        {#if page < lastPage}
          <button type="button" class="outline" style="width:100%;margin-top:12px" disabled={loading} onclick={() => load(true)}>Carica DDT meno recenti</button>
        {/if}
      {/if}
    </div>
    <div class="r">
      <h2 class="fh">Dotazione di {event.name}</h2>
      <p class="hint">{selected.length ? `${selected.length} ${selected.length === 1 ? 'DDT selezionato' : 'DDT selezionati'}` : 'Nessun DDT selezionato'}</p>
      <div style="margin-top:12px">
        {#each preview as x, i (i)}
          <div class="kvrow">
            <span>{x.name}<small>{x.code ? codeLabel(x.code) : 'Senza codice'}{x.kind === 'new' ? ', non in catalogo' : x.kind === 'unknown' ? ', riga non riconosciuta' : ''}</small></span>
            <span class="num {x.kind === 'ok' || (x.kind === 'new' && createMissing) ? 'up' : ''}">+{x.qty}</span>
          </div>
        {:else}
          <p class="hint">Seleziona uno o più DDT: qui vedrai i pezzi che entrano nella dotazione.</p>
        {/each}
      </div>
      {#if missing}
        <button type="button" class="switch" class:on={createMissing} role="switch" aria-checked={createMissing} onclick={() => (createMissing = !createMissing)}>
          <span>Aggiungi al catalogo i {missing} prodotti mancanti</span><span class="knob"></span>
        </button>
        <p class="hint" style="margin-top:0">{createMissing ? 'Vengono creati con nome, codice, prezzo e aliquota del DDT.' : 'I prodotti mancanti vengono saltati.'}</p>
        {#if createMissing && app.brands.length}
          <span class="flabel">Marchio dei prodotti creati</span>
          <BrandPicker bind:value={brandId} />
        {/if}
      {/if}
      {#if unknown.length}<p class="hint">Le righe senza codice e senza prodotto collegato non vengono importate.</p>{/if}
      {#if error}<p class="kerr">{error}</p>{/if}
      <div class="factions">
        <button type="button" class="outline" onclick={onclose}>Annulla</button>
        <button type="button" class="solid" disabled={busy} onclick={doImport}><Icon name="add" /><span>Aggiungi {total} pezzi</span></button>
      </div>
    </div>
  </div>
{/if}
