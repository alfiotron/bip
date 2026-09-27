<script>
  import { reveal, revealFirstError } from '../lib/reveal.js';
  import Icon from '../components/Icon.svelte';
  import Cover from '../components/Cover.svelte';
  import AdminHeader from '../components/AdminHeader.svelte';
  import FicProductsImport from './fic/FicProductsImport.svelte';
  import { app } from '../lib/state.svelte.js';
  import { pf, editProduct, newProduct, closeForm, saveProduct, askDeleteProduct, confirmDeleteProduct } from '../lib/products.svelte.js';
  import { eur } from '../lib/money.js';
  import { codeLabel } from '../lib/codes.js';

  const VATS = [0, 4, 5, 10, 22];
  const list = $derived.by(() => {
    const t = pf.query.trim().toLowerCase();
    return app.products.filter((p) => !t || `${p.name} ${p.description} ${p.code}`.toLowerCase().includes(t));
  });
  let busy = $state(false);
  let importing = $state(false);

  async function save() {
    if (busy) return;
    busy = true;
    const ok = await saveProduct();
    busy = false;
    if (!ok) revealFirstError(document.querySelector('.split > .r'));
  }
  function open(p) {
    editProduct(p);
    if (matchMedia('(max-width:900px)').matches) scrollTo(0, 0);
  }
</script>

{#if importing}
<div class="admin">
  <AdminHeader />
  <FicProductsImport onclose={() => (importing = false)} ondone={(m) => { importing = false; pf.form = null; pf.saved = m; }} />
</div>
{:else}
<div class="admin">
  <AdminHeader>
    {#snippet actions()}
      <button type="button" class="outline sm" onclick={() => (importing = true)}><Icon name="cloud_download" /><span>Importa<span class="long">{" "}da Fatture in Cloud</span></span></button>
      <button type="button" class="solid sm" onclick={() => newProduct('')}><Icon name="add" /><span>Nuovo<span class="long">{" "}prodotto</span></span></button>
    {/snippet}
  </AdminHeader>

  <div class="split" class:has-sel={pf.form}>
    <div class="l">
      <div class="psearch"><Icon name="search" /><input class="field" placeholder="Cerca per nome, descrizione o codice" bind:value={pf.query} /></div>
      {#if list.length}
        <div class="pgrid phrow"><span></span><span>Prodotto</span><span>Codice</span><span>IVA</span><span class="r-al">Stato</span><span class="r-al">Prezzo</span><span></span></div>
        {#each list as p (p.id)}
          <button type="button" class="pgrid prow" class:sel={pf.form && pf.form.id === p.id} onclick={() => open(p)}>
            <Cover item={p} />
            <span style="min-width:0">
              <span class="rt">{p.name}</span>
              <span class="ra">{p.description}</span>
            </span>
            <span class="pcode num">{p.code ? codeLabel(p.code) : 'Nessun codice'}</span>
            <span class="pvat">{p.vat_rate ? p.vat_rate + '%' : 'Assolta'}</span>
            <span class="r-al">{#if !p.active}<span class="tag off">Non in vendita</span>{/if}</span>
            <span class="pprice num">{eur(p.price_cents)}</span>
            <Icon name="chevron_right" />
          </button>
        {/each}
      {:else}
        <div class="empty" style="min-height:260px">
          <Icon name="inventory_2" />
          <h2>{app.products.length ? 'Nessun risultato' : 'Il catalogo è vuoto'}</h2>
          <p>{app.products.length ? 'Nessun prodotto corrisponde alla ricerca.' : 'Crea il primo prodotto, oppure leggi il codice a barre di un libro con lo scanner.'}</p>
        </div>
      {/if}
    </div>

    <div class="r">
      {#if pf.form}
        {@const f = pf.form}
        <button type="button" class="back mback" onclick={closeForm}><Icon name="arrow_back" /><span>Tutti i prodotti</span></button>
        <h2 class="fh">{f.id ? 'Modifica prodotto' : 'Nuovo prodotto'}</h2>

        <label class="flabel" for="fn">Nome</label>
        <input id="fn" class="field" class:bad={pf.errors.name} placeholder="Il giardino delle ore" bind:value={f.name} />
        {#if pf.errors.name}<p class="kerr">{pf.errors.name}</p>{/if}

        <label class="flabel" for="fa">Descrizione (facoltativa)</label>
        <input id="fa" class="field" placeholder="Autore, editore o formato" bind:value={f.description} />

        <label class="flabel" for="fc">Codice a barre (ISBN o EAN)</label>
        <input id="fc" class="field num" class:bad={pf.errors.code} inputmode="numeric" placeholder="9788812345671" bind:value={f.code} />
        {#if pf.errors.code}<p class="kerr">{pf.errors.code}</p>{:else}<p class="hint">Facoltativo. Con la scheda aperta puoi leggerlo con lo scanner.</p>{/if}

        <label class="flabel" for="fp">Prezzo di vendita, IVA inclusa</label>
        <input id="fp" class="field num" class:bad={pf.errors.price} inputmode="decimal" placeholder="18,00" bind:value={f.price} />
        {#if pf.errors.price}<p class="kerr">{pf.errors.price}</p>{/if}

        <span class="flabel">Aliquota IVA</span>
        <div class="vchips" role="group" aria-label="Aliquota IVA">
          {#each VATS as v (v)}
            <button type="button" class:on={f.vat_rate === v} aria-pressed={f.vat_rate === v} onclick={() => (f.vat_rate = v)}>{v ? v + '%' : 'Assolta'}</button>
          {/each}
        </div>
        <p class="hint">{f.vat_rate === 0 ? "IVA assolta all'origine dall'editore (art. 74)." : "Nelle statistiche l'IVA viene scorporata dal prezzo di vendita."}</p>

        <label class="flabel" for="fmin">Avvisami quando ne restano</label>
        <input id="fmin" class="field num" class:bad={pf.errors.alert_below} inputmode="numeric" placeholder="5" bind:value={f.alert_below} />
        {#if pf.errors.alert_below}<p class="kerr">{pf.errors.alert_below}</p>{:else}<p class="hint">Serve per gli avvisi in cassa sui pezzi rimasti in fiera.</p>{/if}

        <button type="button" class="switch" class:on={f.active} role="switch" aria-checked={f.active} onclick={() => (f.active = !f.active)}>
          <span>In vendita</span><span class="knob"></span>
        </button>
        <p class="hint" style="margin-top:0">{f.active ? 'Compare in cassa e si può scansionare.' : 'Non compare in cassa, ma resta nelle statistiche degli eventi passati.'}</p>

        <div class="factions">
          <button type="button" class="outline" onclick={closeForm}>Annulla</button>
          <button type="button" class="solid" disabled={busy} onclick={save}><Icon name="check" /><span>Salva prodotto</span></button>
        </div>
        {#if f.id}
          {#if pf.del?.kind === 'confirm'}
            <div class="confirmbox" style="margin-top:14px" use:reveal>
              <p>Eliminare "{f.name}"? L'operazione non si può annullare.</p>
              <button type="button" onclick={() => (pf.del = null)}>Annulla</button>
              <button type="button" class="go" onclick={confirmDeleteProduct}>Elimina prodotto</button>
            </div>
          {:else if pf.del?.kind === 'blocked'}
            <div class="confirmbox info" style="margin-top:14px" use:reveal><p>{pf.del.text}</p><button type="button" onclick={() => (pf.del = null)}>Ho capito</button></div>
          {:else}
            <button type="button" class="linkb danger" style="margin-top:14px" onclick={askDeleteProduct}><Icon name="delete" size={18} />Elimina prodotto</button>
          {/if}
        {/if}
      {:else}
        <div class="empty">
          <Icon name={pf.saved ? 'check_circle' : 'inventory_2'} />
          <h2>{pf.saved || 'Nessun prodotto aperto'}</h2>
          <p>Tocca un prodotto per modificarlo o creane uno nuovo. Puoi anche leggere un codice a barre con lo scanner per aprire o creare il prodotto corrispondente.</p>
        </div>
      {/if}
    </div>
  </div>
</div>
{/if}
