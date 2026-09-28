<script>
  // Scelta del marchio in cui scrivere i prodotti importati.
  import BrandPicker from './BrandPicker.svelte';
  let { value = $bindable(null), moving = 0 } = $props();
</script>

<div class="panel importbrand">
  <h3>Importa nel marchio</h3>
  <p class="hint" style="margin:-8px 0 12px">Tutti i prodotti importati vengono assegnati al marchio scelto. Con "Senza marchio" i prodotti già presenti mantengono il loro.</p>
  <BrandPicker bind:value allowCreate />
  {#if value && moving}
    <p class="hint warn" style="margin-top:10px">{moving === 1 ? '1 prodotto selezionato appartiene' : `${moving} prodotti selezionati appartengono`} a un altro marchio e {moving === 1 ? 'verrà spostato' : 'verranno spostati'}.</p>
  {/if}
</div>
