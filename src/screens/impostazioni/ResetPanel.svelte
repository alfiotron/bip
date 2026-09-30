<script>
  import Icon from '../../components/Icon.svelte';
  import { app } from '../../lib/state.svelte.js';
  import { resetSummary, factoryReset } from '../../lib/factoryReset.js';
  import { reveal } from '../../lib/reveal.js';

  let keep = $state(true);
  let asking = $state(null); // riepilogo di cosa verrà cancellato
  let understood = $state(false);
  let err = $state('');
  let busy = $state(false);

  async function ask() {
    asking = await resetSummary();
    understood = false;
    err = '';
  }
  async function go() {
    if (!understood) { err = 'Conferma di aver capito che l\'operazione non si può annullare.'; return; }
    busy = true;
    await factoryReset({ keepCatalog: keep });
    busy = false;
  }
  const n = (x, one, many) => (x === 1 ? '1 ' + one : `${x} ${many}`);
</script>

<div class="panel dangerpanel">
  <h3>Azzera la cassa</h3>
  {#if app.till.role === 'secondary'}
    <p class="hint" style="margin:-8px 0 12px">Questa è una cassa secondaria: per azzerarla va scollegata dalla principale.</p>
    <button type="button" class="outline" onclick={() => (app.screen = 'casse')}><Icon name="link_off" /><span>Vai a Casse</span></button>
  {:else}
    <p class="hint" style="margin:-8px 0 12px">Per ripartire da zero, per esempio dopo le prove e prima della prima fiera vera. Se ti servono i dati, esporta prima le statistiche in Excel.</p>
    <div class="chips" style="grid-template-columns:1fr 1fr">
      <button type="button" class:on={keep} onclick={() => { keep = true; asking = null; }}>Tieni il catalogo</button>
      <button type="button" class:on={!keep} onclick={() => { keep = false; asking = null; }}>Cancella tutto</button>
    </div>
    <p class="hint">
      {keep
        ? 'Cancella eventi, vendite, dotazione e DDT, e la numerazione dei DDT riparte da 1. Restano prodotti, marchi, clienti, nome e logo dell\'attività, posta e Fatture in Cloud.'
        : 'La cassa torna come appena installata: al riavvio chiederà se è la principale o una secondaria. Restano solo colore e suoni.'}
      Le casse secondarie vengono scollegate: andranno azzerate e ricollegate.
    </p>
    {#if asking}
      <div class="confirmbox" use:reveal>
        <p>
          Verranno cancellati {n(asking.events, 'evento', 'eventi')}, {n(asking.sales, 'vendita', 'vendite')} e {n(asking.transfers, 'DDT', 'DDT')}{keep ? '' : `, oltre a ${n(asking.products, 'prodotto', 'prodotti')} e ${n(asking.brands, 'marchio', 'marchi')}`}.
          {asking.secondaries ? `${n(asking.secondaries, 'cassa secondaria verrà scollegata', 'casse secondarie verranno scollegate')}.` : ''}
        </p>
        <button type="button" class="switch" class:on={understood} role="switch" aria-checked={understood} style="flex-basis:100%;color:inherit" onclick={() => { understood = !understood; err = ''; }}>
          <span>Ho capito: l'operazione non si può annullare</span><span class="knob"></span>
        </button>
        {#if err}<p style="flex-basis:100%;margin:0;font-weight:600">{err}</p>{/if}
        <button type="button" onclick={() => (asking = null)}>Annulla</button>
        <button type="button" class="go" disabled={busy} onclick={go}>{busy ? 'Azzero…' : 'Azzera la cassa'}</button>
      </div>
    {:else}
      <button type="button" class="outline" style="color:var(--err);margin-top:6px" onclick={ask}><Icon name="restart_alt" /><span>Azzera la cassa</span></button>
    {/if}
  {/if}
</div>
