<script>
  import Icon from '../../components/Icon.svelte';
  import Cover from '../../components/Cover.svelte';
  import FicNotConnected from './FicNotConnected.svelte';
  import { app, brandName } from '../../lib/state.svelte.js';
  import { ficConfig } from '../../lib/ficStore.js';
  import { fetchAllProducts } from '../../lib/fic.js';
  import ImportBrandBar from '../../components/ImportBrandBar.svelte';
  import { matchLocal, statusOf as ruleStatus, importItems, importMessage } from '../../lib/catalogImport.js';
  import { eur } from '../../lib/money.js';
  import { codeLabel } from '../../lib/codes.js';

  let { onclose, ondone } = $props();

  let cfg = $state(null);
  let loading = $state(true);
  let progress = $state('');
  let error = $state('');
  let items = $state([]); // prodotti di Fatture in Cloud con lo stato rispetto al catalogo
  let selected = $state(new Set());
  let query = $state('');
  let busy = $state(false);
  let brand = $state(null); // marchio in cui scrivere i prodotti importati

  const localFor = (f) => matchLocal(f, app.products);
  // Come per Excel, più "senza codice" per i prodotti nuovi che non si potranno scansionare
  const statusOf = (f, p) => (!p && !f.code ? 'nocode' : ruleStatus(f, p));

  async function load() {
    loading = true;
    error = '';
    cfg = await ficConfig();
    if (!cfg.token || !cfg.companyId) { loading = false; return; }
    try {
      const list = await fetchAllProducts(cfg.token, cfg.companyId, (n, t) => (progress = `${n} di ${t}`));
      items = list.map((f) => { const p = localFor(f); return { ...f, local: p, status: statusOf(f, p) }; });
      selected = new Set(items.filter((i) => ['new', 'changed', 'link'].includes(i.status)).map((i) => i.fic_id));
    } catch (e) {
      error = e.message;
    }
    loading = false;
  }
  load();

  const shown = $derived.by(() => {
    const t = query.trim().toLowerCase();
    return items.filter((i) => !t || `${i.name} ${i.description} ${i.code}`.toLowerCase().includes(t));
  });
  const count = (s) => items.filter((i) => i.status === s).length;
  const TAGS = { new: ['', 'Nuovo'], changed: ['warn', 'Modificato'], link: ['off', 'Da collegare'], same: ['off', 'Già presente'], nocode: ['off', 'Senza codice'] };

  function toggle(id) {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    selected = s;
  }

  async function importSelected() {
    if (!selected.size) { error = 'Seleziona almeno un prodotto da importare.'; return; }
    busy = true;
    const r = await importItems(items.filter((i) => selected.has(i.fic_id)), brand);
    busy = false;
    ondone('Da Fatture in Cloud: ' + importMessage(r, brand ? brandName(brand) : '').replace(/^./, (c) => c.toLowerCase()));
  }

</script>

{#if cfg && (!cfg.token || !cfg.companyId)}
  <FicNotConnected {onclose} backLabel="Prodotti" />
{:else}
  <div class="abody">
    <div class="shead"><button type="button" class="back" onclick={onclose}><Icon name="arrow_back" /><span>Prodotti</span></button><h2>Importa prodotti da Fatture in Cloud</h2></div>
    {#if loading}
      <p class="hint">Scarico l'anagrafica prodotti{progress ? ` (${progress})` : ''}…</p>
    {:else if error && !items.length}
      <div class="confirmbox" style="margin-bottom:12px"><p>{error}</p><button type="button" class="go" onclick={load}>Riprova</button></div>
    {:else}
      <p class="hint" style="margin:-8px 0 14px">I prodotti si riconoscono dal collegamento con Fatture in Cloud o, la prima volta, dal codice a barre. Quelli già presenti vengono aggiornati con nome, descrizione, prezzo e aliquota di Fatture in Cloud. "Da collegare" indica prodotti identici che verranno solo associati, così in futuro si riconoscono anche se cambi il codice.</p>
      <div style="margin-bottom:16px"><ImportBrandBar bind:value={brand} moving={items.filter((i) => selected.has(i.fic_id) && i.local && brand && i.local.brand_id && i.local.brand_id !== brand).length} /></div>
      <div class="counts">
        <span class="tag" style="margin-left:0">{count('new')} {count('new') === 1 ? 'nuovo' : 'nuovi'}</span>
        <span class="tag warn" style="margin-left:0">{count('changed')} {count('changed') === 1 ? 'modificato' : 'modificati'}</span>
        {#if count('link')}<span class="tag off" style="margin-left:0">{count('link')} da collegare</span>{/if}
        <span class="tag off" style="margin-left:0">{count('same')} già {count('same') === 1 ? 'presente' : 'presenti'}</span>
        {#if count('nocode')}<span class="tag off" style="margin-left:0">{count('nocode')} senza codice</span>{/if}
      </div>
      <div class="psearch"><Icon name="search" /><input class="field" placeholder="Cerca per nome, descrizione o codice" bind:value={query} /></div>
      <div style="display:flex;gap:14px;margin-bottom:6px">
        <button type="button" class="linkb" onclick={() => (selected = new Set(items.filter((i) => ['new', 'changed', 'link'].includes(i.status)).map((i) => i.fic_id)))}>Seleziona nuovi e modificati</button>
        <button type="button" class="linkb" onclick={() => (selected = new Set())}>Deseleziona tutto</button>
      </div>
      {#each shown as f (f.fic_id)}
        {@const on = selected.has(f.fic_id)}
        <button type="button" class="fgrid" aria-pressed={on} onclick={() => toggle(f.fic_id)}>
          <span class="ck" class:on><Icon name={on ? 'check_box' : 'check_box_outline_blank'} fill={on} /></span>
          <Cover item={f.local || { id: f.fic_id, name: f.name }} />
          <span style="min-width:0"><span class="rt">{f.name}</span><span class="ra num">{f.code ? codeLabel(f.code) : 'Senza codice: si vende solo cercandolo'}{f.local && f.local.brand_id && app.brands.length ? ', ora in ' + brandName(f.local.brand_id) : ''}</span></span>
          <span class="fhide"><span class="tag {TAGS[f.status][0]}" style="margin-left:0">{TAGS[f.status][1]}</span></span>
          <span class="r-al num" style="font-weight:600">{#if f.status === 'changed' && f.local.price_cents !== f.price_cents}<span class="old">{eur(f.local.price_cents)}</span>{/if}{eur(f.price_cents)}</span>
          <span class="r-al fhide" style="color:var(--ink-2);font-size:14px">{f.vat_rate ? f.vat_rate + '%' : 'Assolta'}</span>
        </button>
      {:else}
        <p class="hint">Nessun prodotto corrisponde alla ricerca.</p>
      {/each}
      {#if error}<p class="kerr">{error}</p>{/if}
      <div class="ficbar">
        <span class="hint" style="margin:0">{selected.size} {selected.size === 1 ? 'prodotto selezionato' : 'prodotti selezionati'}</span>
        <button type="button" class="solid" disabled={busy} onclick={importSelected}><Icon name="cloud_download" /><span>Importa</span></button>
      </div>
    {/if}
  </div>
{/if}
