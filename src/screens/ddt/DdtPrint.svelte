<script>
  import Icon from '../../components/Icon.svelte';
  import { app, productById } from '../../lib/state.svelte.js';
  import { REASONS } from '../../lib/transfers.js';

  let { t, onclose } = $props();
  const date = (iso) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
</script>

<div class="abody"><div class="docwrap">
  <div class="shead noprint">
    <button type="button" class="back" onclick={onclose}><Icon name="arrow_back" /><span>Torna al DDT</span></button>
    <button type="button" class="solid sm" onclick={() => window.print()}><Icon name="print" /><span>Stampa</span></button>
  </div>
  <article class="doc">
    <header class="doc-h">
      <div class="doc-brand">
        {#if app.shop.logo}<img src={app.shop.logo} alt="" />{/if}
        <strong>{app.shop.name || (app.shop.logo ? '' : 'Riepilogo interno')}</strong>
      </div>
      <div class="doc-t"><span class="l">Riepilogo merce consegnata, uso interno</span><strong class="num">DDT {t.number} del {date(t.at)}</strong></div>
    </header>
    <div class="doc-g">
      <div><span class="l">Consegnata a</span><strong>{t.client_name}</strong><br />{t.client_address}</div>
      <div><span class="l">Causale</span>{REASONS[t.reason] || ''}<br /><span class="l" style="margin-top:10px">Partenza</span>{t.event_name}</div>
    </div>
    <table>
      <thead><tr><th>Codice</th><th>Prodotto</th><th class="r">Quantità</th></tr></thead>
      <tbody>
        {#each t.lines as l (l.id)}
          {@const p = productById(l.product_id)}
          <tr><td class="num">{p?.code || '—'}</td><td>{p?.name || 'Prodotto eliminato'}</td><td class="r num">{l.qty}</td></tr>
        {/each}
      </tbody>
    </table>
    {#if t.note}<p style="margin:14px 0 0"><span class="l">Note</span>{t.note}</p>{/if}
    <div class="doc-sign" style="grid-template-columns:1fr 1fr"><div>Firma di chi consegna</div><div>Firma di chi riceve</div></div>
  </article>
  <p class="hint noprint">Documento a uso interno per tracciare la merce consegnata.</p>
</div></div>
