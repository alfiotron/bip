<script>
  import Icon from '../../components/Icon.svelte';
  import { voidSale, changeMethod, correctSale, VOID_REASONS } from '../../lib/salesOps.js';
  import { app } from '../../lib/state.svelte.js';
  import { pos } from '../../lib/pos.svelte.js';
  import { eur } from '../../lib/money.js';
  import { codeLabel } from '../../lib/codes.js';
  import { reveal } from '../../lib/reveal.js';

  // Elenco di tutte le vendite dell'evento, con la possibilità di annullarne una.
  let { sales, tillName, dayLabel, eventId } = $props();

  let open = $state(null); // id della vendita aperta
  let asking = $state(null); // { id, reason }
  let method = $state(null); // { id, value } metodo scelto nella modifica
  let fixing = $state(null); // { id, error } correzione completa in attesa di conferma
  let showVoided = $state(true);
  let query = $state('');

  const METHOD = { card: ['credit_card', 'Carta'], cash: ['payments', 'Contanti'], gift: ['redeem', 'Omaggio'] };
  const time = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const list = $derived.by(() => {
    const t = query.trim().toLowerCase();
    return [...sales]
      .reverse()
      .filter((s) => showVoided || !s.voided)
      .filter((s) => !t || s.lines.some((l) => `${l.name} ${l.code}`.toLowerCase().includes(t)));
  });
  const voidedCount = $derived(sales.filter((s) => s.voided).length);

  function openSale(s) {
    open = open === s.id ? null : s.id;
    asking = null;
    fixing = null;
    method = { id: s.id, value: s.method };
  }
  async function saveMethod(s) {
    await changeMethod(s.id, method.value);
  }
  function askFix(s) {
    asking = null;
    if (eventId !== app.currentEventId) fixing = { id: s.id, error: 'Per correggere lo scontrino, in cassa deve essere scelto l\'evento di questa vendita.' };
    else if (pos.lines.length) fixing = { id: s.id, error: 'In cassa c\'è una vendita in corso: completala o annullala prima di correggere questo scontrino.' };
    else fixing = { id: s.id, error: '' };
  }
  async function confirmVoid(s) {
    await voidSale(s.id, asking.reason);
    asking = null;
  }
</script>

<div class="panel">
  <h3>Vendite</h3>
  <p class="hint" style="margin:-8px 0 14px">Tocca una vendita per vederne i dettagli, cambiare il metodo di pagamento, correggerla o annullarla. Una vendita annullata resta nell'elenco, ma non conta più nell'incasso, nelle statistiche e nella dotazione.</p>
  <div class="searchrow">
    <div class="psearch"><Icon name="search" /><input class="field" placeholder="Cerca un prodotto nelle vendite" bind:value={query} /></div>
    {#if voidedCount}
      <button type="button" class="outline selbtn" class:on={!showVoided} onclick={() => (showVoided = !showVoided)}>
        <Icon name={showVoided ? 'visibility_off' : 'visibility'} /><span>{showVoided ? 'Nascondi annullate' : 'Mostra annullate'}</span>
      </button>
    {/if}
  </div>

  {#each list as s (s.id)}
    {@const m = METHOD[s.method]}
    <button type="button" class="salerow" class:voided={s.voided} class:sel={open === s.id} onclick={() => openSale(s)}>
      <span class="stime num">{time(s.at)}<small>{dayLabel(s.day)}</small></span>
      <span class="sitems" style="min-width:0">
        <span class="rt">{s.lines.map((l) => (l.qty > 1 ? `${l.qty}× ` : '') + l.name).join(', ')}</span>
        <span class="ra"><Icon name={m[0]} size={16} /> {m[1]}, {tillName(s.origin)}{s.voided ? '' : s.discount_cents ? ', con sconto' : ''}</span>
      </span>
      <span class="stot num">{#if s.voided}<span class="tag bad" style="margin:0 8px 0 0">Annullata</span>{/if}{s.method === 'gift' ? '—' : eur(s.total_cents)}</span>
    </button>
    {#if open === s.id}
      <div class="saledetail" use:reveal>
        {#each s.lines as l (l.id)}
          <div class="kvrow"><span>{l.qty}× {l.name}<small>{l.code ? codeLabel(l.code) : 'Voce libera'}, {eur(l.unit_cents)} a pezzo</small></span><span class="num">{eur(l.unit_cents * l.qty)}</span></div>
        {/each}
        {#if s.discount_cents}<div class="kvrow"><span>Sconto</span><span class="num">− {eur(s.discount_cents)}</span></div>{/if}
        {#if s.rounding_cents}<div class="kvrow"><span>Arrotondamento</span><span class="num">− {eur(s.rounding_cents)}</span></div>{/if}
        {#if s.method !== 'gift'}<div class="kvrow"><span><strong>Incassato</strong></span><span class="num"><strong>{eur(s.total_cents)}</strong></span></div>{/if}
        {#if s.gift_to}<div class="kvrow"><span>Omaggio a</span><span>{s.gift_to}</span></div>{/if}

        {#if s.method_was && !s.voided}
          <p class="hint">Pagamento modificato il {new Date(s.edited_at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}: era {METHOD[s.method_was][1].toLowerCase()}.</p>
        {/if}
        {#if !s.voided && s.method !== 'gift' && method?.id === s.id}
          <div class="paymethod">
            <span class="tl" style="margin:0">Pagamento</span>
            <div class="seg two">
              <button type="button" class:on={method.value === 'card'} onclick={() => (method.value = 'card')}><Icon name="credit_card" size={18} />Carta</button>
              <button type="button" class:on={method.value === 'cash'} onclick={() => (method.value = 'cash')}><Icon name="payments" size={18} />Contanti</button>
            </div>
            {#if method.value !== s.method}<button type="button" class="solid sm" onclick={() => saveMethod(s)}>Salva</button>{/if}
          </div>
        {/if}
        {#if s.voided}
          <p class="hint">Annullata {new Date(s.voided_at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{s.void_reason ? ', motivo: ' + s.void_reason.toLowerCase() : ''}.</p>
        {:else if asking?.id === s.id}
          <div class="confirmbox" use:reveal>
            <p>Annullare questa {s.method === 'gift' ? 'consegna in omaggio' : 'vendita'}? {s.method === 'gift' ? '' : `${eur(s.total_cents)} verranno tolti dall'incasso e `}i pezzi torneranno nella dotazione. L'annullamento vale su tutte le casse.</p>
            <div class="chips three" style="flex-basis:100%">
              {#each VOID_REASONS as r (r)}<button type="button" class:on={asking.reason === r} onclick={() => (asking.reason = r)}>{r}</button>{/each}
            </div>
            <button type="button" onclick={() => (asking = null)}>No</button>
            <button type="button" class="go" onclick={() => confirmVoid(s)}>Annulla vendita</button>
          </div>
        {:else if fixing?.id === s.id}
          {#if fixing.error}
            <div class="confirmbox info" use:reveal><p>{fixing.error}</p><button type="button" onclick={() => (fixing = null)}>Ho capito</button></div>
          {:else}
            <div class="confirmbox" use:reveal>
              <p>Correggere lo scontrino? La vendita viene annullata e i suoi prodotti tornano nel carrello in cassa, con lo stesso sconto: correggi prodotti, quantità o sconto e conferma di nuovo il pagamento.</p>
              <button type="button" onclick={() => (fixing = null)}>No</button>
              <button type="button" class="go" onclick={() => correctSale(s)}>Correggi in cassa</button>
            </div>
          {/if}
        {:else}
          <div class="saleacts">
            <button type="button" class="linkb" onclick={() => askFix(s)}><Icon name="edit_note" size={18} />Correggi prodotti o sconto</button>
            <button type="button" class="linkb danger" onclick={() => { fixing = null; asking = { id: s.id, reason: 'Errore di cassa' }; }}><Icon name="undo" size={18} />Annulla questa vendita</button>
          </div>
        {/if}
      </div>
    {/if}
  {:else}
    <p class="hint">{query ? 'Nessuna vendita con questo prodotto.' : 'Nessuna vendita registrata.'}</p>
  {/each}
</div>
