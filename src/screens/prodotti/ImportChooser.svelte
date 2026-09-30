<script>
  import Icon from '../../components/Icon.svelte';
  let { onpick, onclose } = $props();
</script>

<div class="abody"><div class="narrow" style="max-width:980px">
  <div class="shead"><button type="button" class="back" onclick={onclose}><Icon name="arrow_back" /><span>Prodotti</span></button><h2>Importa l'anagrafica</h2></div>
  <div class="cards3">
    <button type="button" class="panel importcard" onclick={() => onpick('fic')}>
      <Icon name="cloud_download" size={32} />
      <h3>Da Fatture in Cloud</h3>
      <p class="hint">Scarica l'anagrafica prodotti dal tuo account. Serve internet e il collegamento in Impostazioni.</p>
    </button>
    <button type="button" class="panel importcard" onclick={() => onpick('excel')}>
      <Icon name="table_view" size={32} />
      <h3>Da un file Excel o CSV</h3>
      <p class="hint">Un elenco con nome, codice, prezzo e aliquota, per esempio il catalogo di un editore o di un distributore.</p>
    </button>
    <button type="button" class="panel importcard" onclick={() => onpick('net')}>
      <Icon name="devices" size={32} />
      <h3>Da un'altra cassa Bip</h3>
      <p class="hint">Copia i prodotti da una cassa principale indipendente da questa, sulla stessa rete. Le due casse restano separate.</p>
    </button>
  </div>
</div></div>
