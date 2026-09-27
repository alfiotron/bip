<script>
  import Icon from '../../components/Icon.svelte';
  import Cover from '../../components/Cover.svelte';
  import { app, currentEvent, productById } from '../../lib/state.svelte.js';
  import { ui } from '../../lib/ui.svelte.js';
  import { pos, changeQty, removeLine, openManual, leftInFair } from '../../lib/pos.svelte.js';
  import { eur } from '../../lib/money.js';
  import { codeLabel } from '../../lib/codes.js';

  const ev = $derived(currentEvent());

  function hint(l) {
    if (!l.product_id || !app.stock.has) return null;
    const s = leftInFair(l.product_id);
    const p = productById(l.product_id);
    if (!s.loaded) return ['bad', 'Non risulta portato in fiera'];
    if (s.left < 0) return ['bad', 'Più di quelli portati'];
    if (s.left === 0) return ['warn', 'Ultimi pezzi in fiera'];
    if (p && s.left <= p.alert_below) return ['warn', s.left === 1 ? 'Ne resta 1 in fiera' : `Ne restano ${s.left} in fiera`];
    return null;
  }
</script>

{#if !ev}
  <div class="empty">
    <Icon name="event_busy" />
    <h2>Nessun evento selezionato</h2>
    <p>Scegli un evento aperto per registrare le vendite.</p>
    <button type="button" class="outline" onclick={() => (app.events.some((e) => e.is_open) ? (ui.eventMenuOpen = true) : (app.screen = 'eventi'))}>
      <Icon name="event" /><span>{app.events.some((e) => e.is_open) ? 'Scegli evento' : 'Crea un evento'}</span>
    </button>
  </div>
{:else}
  {#if pos.lines.length}
    <ul class="cart">
      {#each pos.lines as l, i (l.key)}
        {@const h = hint(l)}
        <li class="row" class:arrive={pos.highlight === l.key}>
          <Cover item={l} />
          <div style="min-width:0">
            <span class="rt">{l.name}</span>
            <span class="ra num">{l.free ? 'Voce libera' : codeLabel(l.code)}</span>
            <span class="rp num">
              <span>{eur(l.unit_cents)} a pezzo</span>
              {#if l.vat_rate}<span>IVA {l.vat_rate}%</span>{/if}
              {#if h}<span class="stk {h[0]}">{h[1]}</span>{/if}
            </span>
          </div>
          <div class="stepper">
            <button type="button" aria-label="Togli un pezzo" onclick={() => changeQty(i, -1)}><Icon name="remove" /></button>
            <span class="num">{l.qty}</span>
            <button type="button" aria-label="Aggiungi un pezzo" onclick={() => changeQty(i, 1)}><Icon name="add" /></button>
          </div>
          <span class="rtot num">{eur(l.unit_cents * l.qty)}</span>
          <button type="button" class="icon-btn" aria-label="Rimuovi {l.name}" onclick={() => removeLine(i)}><Icon name="delete" /></button>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="empty" class:showcase={app.shop.logo && app.shop.logoIdle}>
      {#if app.shop.logo && app.shop.logoIdle}
        <img class="idlelogo" src={app.shop.logo} alt={app.shop.name || 'Logo'} />
      {:else}
        <Icon name="barcode_scanner" />
      {/if}
      <h2>Scansiona un prodotto per iniziare</h2>
      <p>Oppure cercalo nel catalogo, o aggiungi una voce libera.</p>
    </div>
  {/if}
  <div class="bottom">
    <button type="button" class="outline" onclick={() => (pos.view = 'search')}><Icon name="search" /><span>Cerca prodotto</span></button>
    <button type="button" class="outline" onclick={() => openManual()}><Icon name="edit_note" /><span>Voce libera</span></button>
  </div>
{/if}
